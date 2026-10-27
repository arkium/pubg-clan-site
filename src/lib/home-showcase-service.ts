import { Prisma } from '@prisma/client'

import { getClanLeague } from '@/lib/clan-league-service'
import { CLAN_PLACEMENT_MEMBER_SELECT, countsForClanPlacement } from '@/lib/clan-placement'
import { CLAN_PLACEMENT_SQL } from '@/lib/clan-placement-sql'
import { getMapLabels } from '@/lib/map-label-service'
import { matchDebriefPath } from '@/lib/match-links'
import { getPeriodStart } from '@/lib/period'
import { prisma } from '@/lib/prisma'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import { getWeaponLabels } from '@/lib/weapon-label-service'
import {
  buildKillFeed,
  buildShowcaseClans,
  mapImagePath,
  pickMvpMemberId,
  pickSquadClan,
  teamCountFromPhaseSnapshots,
  teamModeFromGameMode,
  topWeaponsByKiller,
  type ClanRef,
  type FeedKill,
  type HomeShowcasePayload,
  type ShowcaseDinner,
} from '@/lib/home-showcase'

/**
 * Données de la vitrine publique (`/`) — docs/features/accueil.md.
 *
 * Page publique : chaque visiteur (et chaque robot) déclencherait les mêmes lectures. La réponse est gardée en
 * mémoire du process web pendant `CACHE_TTL_MS`, et les appels simultanés partagent la même lecture.
 */

export const CACHE_TTL_MS = 5 * 60_000
/** Top 1 du carrousel « Chicken Dinner ». */
export const DINNER_COUNT = 3
/** Victoires dont les kills alimentent le kill feed. */
const FEED_WIN_COUNT = 8
/** Victoires lues : quelques-unes de plus, certaines équipes n'ayant aucun membre d'un clan actif. */
const WIN_CANDIDATES = 16

const ACTIVE_CLAN = { isActive: true, isSystem: false, archivedAt: null } as const

/** Âge maximal de la dernière vitrine connue, servie au rendu serveur pendant qu'une nouvelle se calcule. */
export const STALE_SHOWCASE_MAX_MS = 60 * 60_000

let cache: { at: number; value: Promise<HomeShowcasePayload> } | null = null
let lastResolved: { at: number; value: HomeShowcasePayload } | null = null
let refreshing: Promise<HomeShowcasePayload> | null = null

export function resetHomeShowcaseCache() {
  cache = null
  lastResolved = null
  refreshing = null
}

/**
 * Préchauffage par le cron (docs/TODO/geo-seo-propositions.md, 5.2), via `POST /api/internal/home-showcase/warm` : le
 * cache vit dans le process web, le cron ne peut donc le remplir qu'en l'appelant. Recalcule la vitrine et ne remplace
 * le cache qu'une fois la nouvelle prête : tant que le cron passe plus souvent que `CACHE_TTL_MS`, aucun visiteur ne
 * tombe sur une lecture à froid (~2 s), même après un redémarrage. Un échec garde l'ancienne vitrine.
 */
export function refreshHomeShowcase(now: number = Date.now()): Promise<HomeShowcasePayload> {
  if (refreshing) return refreshing
  const pending = loadHomeShowcase(new Date(now))
  refreshing = pending
  pending
    .then(
      (payload) => {
        cache = { at: now, value: pending }
        lastResolved = { at: now, value: payload }
      },
      () => undefined
    )
    .finally(() => {
      if (refreshing === pending) refreshing = null
    })
  return pending
}

export function getHomeShowcase(now: number = Date.now()): Promise<HomeShowcasePayload> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value
  const value = loadHomeShowcase(new Date(now))
  cache = { at: now, value }
  value.then(
    (payload) => {
      lastResolved = { at: now, value: payload }
    },
    // Une lecture en échec n'est pas gardée : le visiteur suivant réessaie.
    () => {
      if (cache?.value === value) cache = null
    }
  )
  return value
}

/**
 * Vitrine pour le rendu serveur de l'accueil (docs/TODO/geo-seo-propositions.md, lot 2) : la réponse en cache si elle
 * est prête dans `waitMs`, sinon la dernière vitrine connue (moins de `STALE_SHOWCASE_MAX_MS`), sinon `null`.
 * L'accueil n'attend jamais une lecture à froid (~2 s) : elle continue en arrière-plan pour le visiteur suivant, et le
 * navigateur relit de toute façon l'API (`useHomeShowcase`).
 */
export async function getHomeShowcaseIfReady(waitMs = 150, now: number = Date.now()): Promise<HomeShowcasePayload | null> {
  const pending = getHomeShowcase(now)
  pending.catch(() => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs)
  })
  let ready: HomeShowcasePayload | null = null
  try {
    ready = await Promise.race([pending, timeout])
  } catch {
    ready = null
  } finally {
    clearTimeout(timer)
  }
  if (ready) return ready
  return lastResolved && now - lastResolved.at < STALE_SHOWCASE_MAX_MS ? lastResolved.value : null
}

function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/**
 * Seules les parties Normal (`official`) et Ranked (`competitive`) vont sur la vitrine publique (décision du 2026-10-11) :
 * ni parties personnalisées (tournois, scrims), ni Casual contre des bots, ni modes événement.
 */
const SHOWCASE_MATCH_TYPES = ['official', 'competitive']

async function loadHomeShowcase(now: Date): Promise<HomeShowcasePayload> {
  const weekStart = getPeriodStart('week', now) ?? now

  const [clans, players, weekTotals, wins, weaponLabels, mapLabels, analyzedMatches, league] = await Promise.all([
    prisma.clan.count({ where: ACTIVE_CLAN }),
    prisma.clanMember.count({ where: { isActive: true, joinStatus: 'active', clan: ACTIVE_CLAN } }),
    // Normal et Ranked seulement (2026-10-11) : un tournoi range tout son lobby sous une seule ligne, dont la « victoire »
    // mêlerait tous les clans et dont les kills gonfleraient les compteurs de la semaine ; Casual se joue contre des bots.
    // Top 1 de la semaine : parties qu'au moins un clan a gagnées, chacun avec **sa** place (`CLAN_PLACEMENT_SQL`) —
    // `SquadMatch.placement` n'est que celle du clan qui a créé la ligne (docs/TODO/place-partie-partagee.md).
    prisma.$queryRaw<Array<{ kills: bigint | number | null; wins: bigint | number | null }>>`
      SELECT
        (SELECT COALESCE(SUM(sm.totalKills), 0) FROM SquadMatch sm
          WHERE sm.createdAt >= ${weekStart} AND sm.matchType IN (${Prisma.join(SHOWCASE_MATCH_TYPES)})) AS kills,
        (SELECT COUNT(DISTINCT t.id) FROM (
           SELECT sm.id, ${CLAN_PLACEMENT_SQL} AS placement
             FROM SquadMember sq
             INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
             INNER JOIN ClanMember cm ON cm.id = sq.memberId
            WHERE sm.createdAt >= ${weekStart} AND sm.matchType IN (${Prisma.join(SHOWCASE_MATCH_TYPES)}) AND cm.clanId IS NOT NULL
            GROUP BY cm.clanId, sm.id
         ) t WHERE t.placement = 1) AS wins
    `,
    // Une victoire = une partie où un membre actif d'un clan actif a fini premier ; l'équipe affichée est celle-là.
    prisma.squadMatch.findMany({
      where: {
        matchType: { in: SHOWCASE_MATCH_TYPES },
        members: { some: { placement: 1, member: { isActive: true, joinStatus: 'active', clan: ACTIVE_CLAN } } },
      },
      orderBy: { createdAt: 'desc' },
      take: WIN_CANDIDATES,
      select: {
        id: true,
        pubgMatchId: true,
        gameMode: true,
        matchType: true,
        mapName: true,
        createdAt: true,
        members: {
          select: {
            memberId: true,
            kills: true,
            damage: true,
            revives: true,
            longestKill: true,
            placement: true,
            member: {
              select: {
                displayName: true,
                pubgPlayerName: true,
                ...CLAN_PLACEMENT_MEMBER_SELECT,
                clan: { select: { name: true, tag: true, isActive: true, isSystem: true, archivedAt: true } },
              },
            },
          },
        },
      },
    }),
    getWeaponLabels(),
    getMapLabels(),
    prisma.squadMatchTelemetry.count(),
    // Hub des clans : la Ligue de la semaine (parties Normal), déjà gardée 5 minutes en mémoire par son service. Une
    // ligue en échec masque le hub, jamais toute la vitrine.
    getClanLeague('week', 'official', now).catch((error: unknown) => {
      console.error('[home-showcase] Ligue indisponible, hub des clans masqué', error)
      return null
    }),
  ])

  // L'équipe gagnante (membres classés 1ers) et son clan, parmi les seuls membres actifs d'un clan actif : la ligne
  // réunit tous les joueurs suivis du lobby, d'autres clans compris.
  const resolvedWins = wins
    .map((win) => {
      const team = win.members.filter((entry) => entry.placement === 1)
      const refs: ClanRef[] = team.flatMap(({ member }) =>
        member.clan &&
        member.clanId !== null &&
        countsForClanPlacement(member, member.clanId) &&
        member.clan.isActive &&
        !member.clan.isSystem &&
        !member.clan.archivedAt
          ? [{ clanId: member.clanId, clanName: member.clan.name, clanTag: member.clan.tag }]
          : []
      )
      const clan = pickSquadClan(refs)
      return clan ? { win: { ...win, members: team }, clan, mapLabel: mapLabels[win.mapName] ?? win.mapName } : null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, FEED_WIN_COUNT)

  const dinnerWins = resolvedWins.slice(0, DINNER_COUNT)
  const winIds = resolvedWins.map(({ win }) => win.id)

  const [durations, telemetryRows, killEvents] = await Promise.all([
    prisma.match.findMany({
      where: { pubgMatchId: { in: dinnerWins.map(({ win }) => win.pubgMatchId) } },
      select: { pubgMatchId: true, duration: true },
    }),
    // Nombre d'équipes : instantanés de phase de la télémétrie (compressés, lus par decodeTelemetryRow) ; replay
    // proposé seulement si la télémétrie est analysée.
    prisma.squadMatchTelemetry.findMany({
      where: { squadMatchId: { in: dinnerWins.map(({ win }) => win.id) } },
      select: { squadMatchId: true, status: true, phaseSnapshots: true, phaseSnapshotsGz: true },
    }),
    prisma.killEvent.findMany({
      where: { squadMatchId: { in: winIds }, killerMemberId: { not: null } },
      select: {
        id: true,
        squadMatchId: true,
        killerAccountId: true,
        victimAccountId: true,
        killerMemberId: true,
        timestampSeconds: true,
        matchDate: true,
        weaponName: true,
        distance: true,
        headshot: true,
        killerMember: { select: { displayName: true, pubgPlayerName: true, clan: { select: { tag: true, isSystem: true } } } },
        victimMember: { select: { clan: { select: { tag: true, isSystem: true } } } },
      },
    }),
  ])

  // Clan PUBG des victimes hors site (identité globale `Player`), jamais leur pseudo.
  const outsideVictimIds = [
    ...new Set(killEvents.filter((kill) => !kill.victimMember && kill.victimAccountId).map((kill) => kill.victimAccountId as string)),
  ]
  const victimPlayers = outsideVictimIds.length
    ? await prisma.player.findMany({
        where: { pubgAccountId: { in: outsideVictimIds } },
        select: { pubgAccountId: true, opponentClan: { select: { tag: true } } },
      })
    : []
  const outsideVictimTag = new Map<string, string>()
  for (const player of victimPlayers) {
    if (player.opponentClan?.tag) outsideVictimTag.set(player.pubgAccountId, player.opponentClan.tag)
  }

  const teamCountByMatch = new Map<string, number | null>()
  const analyzedMatchIds = new Set<string>()
  for (const row of telemetryRows) {
    decodeTelemetryRow(row)
    teamCountByMatch.set(row.squadMatchId, teamCountFromPhaseSnapshots(row.phaseSnapshots))
    if (row.status === 'success') analyzedMatchIds.add(row.squadMatchId)
  }

  const durationByMatch = new Map<string, number>()
  for (const row of durations) {
    if (row.duration > 0 && !durationByMatch.has(row.pubgMatchId)) durationByMatch.set(row.pubgMatchId, row.duration)
  }

  const dinners: ShowcaseDinner[] = dinnerWins.map(({ win, clan, mapLabel }) => {
    const matchKills = killEvents.filter((kill) => kill.squadMatchId === win.id)
    const weapons = topWeaponsByKiller(matchKills, weaponLabels)
    const mvp = pickMvpMemberId(win.members)
    const squad = [...win.members]
      .sort((a, b) => b.kills - a.kills || b.damage - a.damage)
      .map((member) => ({
        memberId: member.memberId,
        name: member.member.displayName || member.member.pubgPlayerName,
        kills: member.kills,
        damage: Math.round(member.damage),
        revives: member.revives,
        weapons: weapons.get(member.memberId) ?? [],
        mvp: member.memberId === mvp,
      }))
    return {
      squadMatchId: win.id,
      clanId: clan.clanId,
      clanName: clan.clanName,
      clanTag: clan.clanTag,
      mapName: win.mapName,
      mapLabel,
      mapImage: mapImagePath(win.mapName),
      playedAt: win.createdAt.toISOString(),
      durationSeconds: durationByMatch.get(win.pubgMatchId) ?? null,
      teamCount: teamCountByMatch.get(win.id) ?? null,
      teamMode: teamModeFromGameMode(win.gameMode, win.members.length),
      matchType: win.matchType,
      // Kills et dégâts de l'équipe gagnante, pas les totaux de la ligne (ceux du clan qui l'a créée).
      kills: win.members.reduce((sum, member) => sum + member.kills, 0),
      damage: Math.round(win.members.reduce((sum, member) => sum + member.damage, 0)),
      longestKillMeters: Math.round(Math.max(0, ...win.members.map((member) => member.longestKill))),
      debriefPath: matchDebriefPath(clan.clanId, win.id),
      replayAvailable: analyzedMatchIds.has(win.id),
      squad,
    }
  })

  const feedKills: FeedKill[] = killEvents.map((kill) => {
    const victimSiteClan = kill.victimMember?.clan
    return {
      id: kill.id,
      squadMatchId: kill.squadMatchId,
      killerAccountId: kill.killerAccountId,
      victimAccountId: kill.victimAccountId,
      timestampSeconds: kill.timestampSeconds,
      matchDate: kill.matchDate,
      killer: kill.killerMember?.displayName || kill.killerMember?.pubgPlayerName || 'Joueur',
      killerClanTag: kill.killerMember?.clan && !kill.killerMember.clan.isSystem ? kill.killerMember.clan.tag : null,
      weaponName: kill.weaponName,
      distance: kill.distance,
      headshot: kill.headshot,
      victimClanTag: victimSiteClan
        ? victimSiteClan.isSystem
          ? null
          : victimSiteClan.tag
        : kill.victimAccountId
          ? (outsideVictimTag.get(kill.victimAccountId) ?? null)
          : null,
    }
  })

  const totals = weekTotals[0]
  return {
    generatedAt: now.toISOString(),
    stats: {
      clans,
      players,
      weekKills: Number(totals?.kills ?? 0),
      weekWins: Number(totals?.wins ?? 0),
      isoWeek: isoWeekNumber(now),
      analyzedMatches,
    },
    dinners,
    killFeed: buildKillFeed({
      kills: feedKills,
      wins: resolvedWins.map(({ win, clan, mapLabel }) => ({ squadMatchId: win.id, clanTag: clan.clanTag, mapLabel })),
      labels: weaponLabels,
    }),
    clans: league ? buildShowcaseClans(league) : [],
  }
}

