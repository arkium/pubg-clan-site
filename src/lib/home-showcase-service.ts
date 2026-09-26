import { getMapLabels } from '@/lib/map-label-service'
import { matchDebriefPath } from '@/lib/match-links'
import { getPeriodStart } from '@/lib/period'
import { prisma } from '@/lib/prisma'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import { getWeaponLabels } from '@/lib/weapon-label-service'
import {
  buildKillFeed,
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

let cache: { at: number; value: Promise<HomeShowcasePayload> } | null = null

export function resetHomeShowcaseCache() {
  cache = null
}

export function getHomeShowcase(now: number = Date.now()): Promise<HomeShowcasePayload> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value
  const value = loadHomeShowcase(new Date(now))
  cache = { at: now, value }
  // Une lecture en échec n'est pas gardée : le visiteur suivant réessaie.
  value.catch(() => {
    if (cache?.value === value) cache = null
  })
  return value
}

function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

async function loadHomeShowcase(now: Date): Promise<HomeShowcasePayload> {
  const weekStart = getPeriodStart('week', now) ?? now

  const [clans, players, weekTotals, wins, weaponLabels, mapLabels] = await Promise.all([
    prisma.clan.count({ where: ACTIVE_CLAN }),
    prisma.clanMember.count({ where: { isActive: true, joinStatus: 'active', clan: ACTIVE_CLAN } }),
    prisma.$queryRaw<Array<{ kills: bigint | number | null; wins: bigint | number | null }>>`
      SELECT COALESCE(SUM(totalKills), 0) AS kills, COALESCE(SUM(placement = 1), 0) AS wins
      FROM SquadMatch
      WHERE createdAt >= ${weekStart}
    `,
    prisma.squadMatch.findMany({
      where: { placement: 1, members: { some: { member: { clan: ACTIVE_CLAN } } } },
      orderBy: { createdAt: 'desc' },
      take: WIN_CANDIDATES,
      select: {
        id: true,
        pubgMatchId: true,
        gameMode: true,
        matchType: true,
        mapName: true,
        createdAt: true,
        totalKills: true,
        totalDamage: true,
        members: {
          select: {
            memberId: true,
            kills: true,
            damage: true,
            revives: true,
            longestKill: true,
            member: {
              select: {
                displayName: true,
                pubgPlayerName: true,
                clanId: true,
                clan: { select: { name: true, tag: true, isActive: true, isSystem: true, archivedAt: true } },
              },
            },
          },
        },
      },
    }),
    getWeaponLabels(),
    getMapLabels(),
  ])

  // Clan de chaque victoire, parmi les seuls membres d'un clan actif.
  const resolvedWins = wins
    .map((win) => {
      const refs: ClanRef[] = win.members.flatMap(({ member }) =>
        member.clan && member.clanId !== null && member.clan.isActive && !member.clan.isSystem && !member.clan.archivedAt
          ? [{ clanId: member.clanId, clanName: member.clan.name, clanTag: member.clan.tag }]
          : []
      )
      const clan = pickSquadClan(refs)
      return clan ? { win, clan, mapLabel: mapLabels[win.mapName] ?? win.mapName } : null
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
    // Nombre d'équipes : instantanés de phase de la télémétrie (compressés, lus par decodeTelemetryRow).
    prisma.squadMatchTelemetry.findMany({
      where: { squadMatchId: { in: dinnerWins.map(({ win }) => win.id) } },
      select: { squadMatchId: true, phaseSnapshots: true, phaseSnapshotsGz: true },
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
  for (const row of telemetryRows) {
    decodeTelemetryRow(row)
    teamCountByMatch.set(row.squadMatchId, teamCountFromPhaseSnapshots(row.phaseSnapshots))
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
      kills: win.totalKills,
      damage: Math.round(win.totalDamage),
      longestKillMeters: Math.round(Math.max(0, ...win.members.map((member) => member.longestKill))),
      debriefPath: matchDebriefPath(clan.clanId, win.id),
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
    },
    dinners,
    killFeed: buildKillFeed({
      kills: feedKills,
      wins: resolvedWins.map(({ win, clan, mapLabel }) => ({ squadMatchId: win.id, clanTag: clan.clanTag, mapLabel })),
      labels: weaponLabels,
    }),
  }
}

