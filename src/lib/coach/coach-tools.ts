import { locationForPercent } from '@/lib/city-insights'
import type { CoachToolCall, CoachToolDeclaration } from '@/lib/coach/coach-provider'
import { DEFAULT_MAP_LABELS, getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getMapLocations } from '@/lib/map-location-service'
import { sessionDateOf } from '@/lib/match-sessions'
import { prisma } from '@/lib/prisma'
import { formatClock, phaseStartTimes } from '@/lib/pubg-telemetry/debrief-view'
import { loadMatchDebriefPayload } from '@/lib/pubg-telemetry/match-debrief-payload'
import { getMapBounds } from '@/lib/pubg-telemetry/position-heatmap'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'
import { aggregateMemberWeapons, type MemberWeaponRow } from '@/lib/weapons/member-arsenal'

/**
 * Outils du Coach IA (docs/TODO/chatbot-ia.md §5). **Le modèle ne choisit jamais le clan ni le compte** : `clanId`,
 * le membre et ses droits sont liés ici, dans la fermeture de `createCoachTools` ; le modèle ne passe que des filtres
 * (carte, nombre de parties, arme, tag adverse, identifiant d'un match vérifié comme appartenant au clan).
 *
 * Chaque outil se borne (nombre de parties, période, taille des listes) et réutilise les services des pages : le Coach
 * ne contredit pas l'écran. Aucune donnée d'authentification ne sort d'un résultat.
 */

export type CoachToolScope = {
  clanId: number
  /** Membre actif de la session : « mes armes » par défaut. */
  memberId: number
  memberName: string
}

export type CoachTools = {
  declarations: CoachToolDeclaration[]
  run(call: CoachToolCall): Promise<unknown>
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
const RECENT_MATCHES_MAX = 10
const RECENT_MATCHES_DEFAULT = 5
const DEBRIEF_EVENTS_MAX = 60
const WEAPONS_MAX = 8
const OPPONENT_PLAYERS_MAX = 200
const DROP_ROWS_MAX = 2000
const DROP_DAYS = 90
const DROP_ZONES_MAX = 8

export const COACH_TOOL_DECLARATIONS: CoachToolDeclaration[] = [
  {
    name: 'getRecentMatches',
    description: 'Parties récentes du clan du joueur, de la plus récente à la plus ancienne, regroupées par soirée.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: `Nombre de parties, ${RECENT_MATCHES_MAX} au plus (${RECENT_MATCHES_DEFAULT} par défaut).` },
        mapName: { type: 'string', description: 'Carte (Erangel, Miramar, Sanhok, Taego, Vikendi, Deston, Rondo…), facultatif.' },
      },
    },
  },
  {
    name: 'getMatchDebrief',
    description: "Débriefing d'une partie du clan : phases, mises à terre, kills, morts, réanimations, distances, dégâts par membre.",
    parameters: {
      type: 'object',
      properties: { matchId: { type: 'string', description: "Identifiant de la partie (page consultée ou getRecentMatches)." } },
      required: ['matchId'],
    },
  },
  {
    name: 'getWeaponStats',
    description: "Statistiques d'armes d'un membre du clan (kills, précision, tirs à la tête, distances) ; le joueur lui-même par défaut.",
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan, facultatif.' },
        weaponCategory: { type: 'string', description: 'Catégorie : AR, DMR, SR, SMG, LMG, SHOTGUN, PISTOL, facultatif.' },
        period: { type: 'string', enum: ['all', 'month'], description: '« all » (défaut) ou « month » (mois en cours).' },
      },
    },
  },
  {
    name: 'getOpponentRecord',
    description: "Bilan du clan du joueur face à un clan adverse : kills échangés, joueurs adverses les plus dangereux, dernière rencontre.",
    parameters: {
      type: 'object',
      properties: { clanTag: { type: 'string', description: 'Tag du clan adverse, avec ou sans crochets.' } },
      required: ['clanTag'],
    },
  },
  {
    name: 'getDropZones',
    description: `Zones de largage du clan sur une carte (${DROP_DAYS} derniers jours) : villes, fréquence, pression à l'atterrissage, placements obtenus.`,
    parameters: {
      type: 'object',
      properties: { mapName: { type: 'string', description: 'Carte.' } },
      required: ['mapName'],
    },
  },
]

type ToolArgs = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}
const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** « Erangel (Remastered) » → « erangel » : le joueur dit le nom de la carte, pas son suffixe. */
const mapKeyword = (label: string) => normalizeText(label.replace(/\s*\(.*\)\s*$/, ''))

/** Noms bruts de carte dont l'étiquette (ou le nom brut) correspond au nom demandé. */
function resolveMapNames(requested: string, labels: Record<string, string>): string[] {
  const wanted = mapKeyword(requested)
  if (!wanted) return []
  const rawNames = new Set([...Object.keys(DEFAULT_MAP_LABELS), ...Object.keys(labels)])
  return [...rawNames].filter((raw) => mapKeyword(mapDisplayName(raw, labels)) === wanted || normalizeText(raw) === wanted)
}

function monthPeriodKey(now = new Date()) {
  return `month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

type CombatEventLike = {
  type: string
  timestamp: number
  phaseNumber: number
  actorName?: string
  actorClanTag?: string | null
  targetName?: string
  targetClanTag?: string | null
  weaponName?: string
  distanceMeters?: number | null
  isSquadActor?: boolean
  isSquadTarget?: boolean
}

export function createCoachTools(scope: CoachToolScope): CoachTools {
  async function getRecentMatches(args: ToolArgs) {
    const take = clampInt(args.limit, 1, RECENT_MATCHES_MAX, RECENT_MATCHES_DEFAULT)
    const labels = await getMapLabels()
    const requestedMap = text(args.mapName)
    const rawMaps = requestedMap ? resolveMapNames(requestedMap, labels) : []
    if (requestedMap && rawMaps.length === 0) return { error: 'map_not_found', message: `Carte inconnue : ${requestedMap}.` }

    const matches = await prisma.squadMatch.findMany({
      where: {
        members: { some: { member: { clanId: scope.clanId } } },
        ...(rawMaps.length > 0 ? { mapName: { in: rawMaps } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        mapName: true,
        gameMode: true,
        matchType: true,
        placement: true,
        createdAt: true,
        totalKills: true,
        totalDamage: true,
        members: { select: { member: { select: { displayName: true } } } },
        telemetry: { select: { status: true } },
      },
    })
    return {
      matches: matches.map((match) => ({
        matchId: match.id,
        map: mapDisplayName(match.mapName, labels),
        session: sessionDateOf(match.createdAt),
        startedAt: match.createdAt.toISOString(),
        gameMode: match.gameMode,
        matchType: match.matchType,
        placement: match.placement,
        squadKills: match.totalKills,
        squadDamage: Math.round(match.totalDamage),
        squad: match.members.map((entry) => entry.member.displayName),
        telemetryAnalyzed: match.telemetry?.status === 'success',
      })),
    }
  }

  async function getMatchDebrief(args: ToolArgs) {
    const matchId = text(args.matchId)
    if (!SAFE_ID.test(matchId)) return { error: 'match_not_found', message: 'Identifiant de partie invalide.' }
    const payload = await loadMatchDebriefPayload({ matchId, accessClanId: scope.clanId, clanId: scope.clanId })
    if (!payload) return { error: 'match_not_found', message: 'Aucune partie du clan avec cet identifiant.' }

    const labels = await getMapLabels()
    const header = {
      matchId: payload.match.id,
      map: mapDisplayName(payload.match.mapName, labels),
      startedAt: payload.match.createdAt,
      session: sessionDateOf(payload.match.createdAt),
      gameMode: payload.match.gameMode,
      matchType: payload.match.matchType,
      placement: payload.match.placement,
      durationSeconds: payload.match.durationSeconds,
      squadKills: payload.match.totalKills,
      squadDamage: Math.round(payload.match.totalDamage),
    }
    if (payload.telemetry.status !== 'success') {
      return { ...header, telemetryAnalyzed: false, message: 'Télémétrie pas encore analysée : pas de déroulé disponible.' }
    }

    const weaponLabels = payload.weaponLabels ?? {}
    const squadEvents = ((payload.combatEvents ?? []) as CombatEventLike[]).filter((event) => event.isSquadActor || event.isSquadTarget)
    const opponentClans = new Set<string>()
    for (const event of squadEvents) {
      if (!event.isSquadActor && event.actorClanTag) opponentClans.add(event.actorClanTag)
      if (!event.isSquadTarget && event.targetClanTag) opponentClans.add(event.targetClanTag)
    }
    return {
      ...header,
      telemetryAnalyzed: true,
      phases: phaseStartTimes(payload.telemetry.phaseSnapshots).map((entry) => ({ phase: entry.phase, start: formatClock(entry.t) })),
      squad: payload.squadMates.map((mate) => ({
        name: mate.name,
        clanTag: mate.clanTag,
        kills: mate.kills,
        damage: Math.round(mate.damage),
        knockouts: mate.knockouts,
        revives: mate.revives,
        deaths: mate.deaths,
        damageTaken: Math.round(mate.damageTaken),
      })),
      events: squadEvents.slice(0, DEBRIEF_EVENTS_MAX).map((event) => ({
        time: formatClock(event.timestamp),
        phase: event.phaseNumber,
        type: event.type,
        actor: event.actorName ?? null,
        actorClan: event.actorClanTag ?? null,
        target: event.targetName ?? null,
        targetClan: event.targetClanTag ?? null,
        weapon: event.weaponName ? weaponDisplayName(event.weaponName, weaponLabels) : null,
        distanceM: typeof event.distanceMeters === 'number' ? Math.round(event.distanceMeters) : null,
        bySquad: Boolean(event.isSquadActor),
        onSquad: Boolean(event.isSquadTarget),
      })),
      eventsTruncated: squadEvents.length > DEBRIEF_EVENTS_MAX,
      opponentClans: [...opponentClans],
    }
  }

  async function getWeaponStats(args: ToolArgs) {
    const playerName = text(args.playerName)
    let memberId = scope.memberId
    let memberName = scope.memberName
    if (playerName && normalizeText(playerName) !== normalizeText(scope.memberName)) {
      const member = await prisma.clanMember.findFirst({
        where: { clanId: scope.clanId, isActive: true, OR: [{ displayName: playerName }, { pubgPlayerName: playerName }] },
        select: { id: true, displayName: true },
      })
      if (!member) return { error: 'player_not_found', message: `Aucun membre du clan ne s'appelle ${playerName}.` }
      memberId = member.id
      memberName = member.displayName
    }
    const period = text(args.period) === 'month' ? 'month' : 'all'
    const periodKey = period === 'month' ? monthPeriodKey() : 'all-time'
    const [rows, weaponLabels] = await Promise.all([
      prisma.memberWeaponStats.findMany({
        where: { memberId, period: periodKey },
        orderBy: { kills: 'desc' },
        select: { weaponName: true, kills: true, headshots: true, shotsFired: true, hitsLanded: true, avgDistance: true, maxDistance: true, matchCount: true },
      }),
      getWeaponLabels(),
    ])
    const memberRows: MemberWeaponRow[] = rows.map((row) => ({
      weaponName: row.weaponName,
      weaponLabel: weaponDisplayName(row.weaponName, weaponLabels),
      kills: row.kills,
      headshots: row.headshots,
      shotsFired: row.shotsFired,
      hitsLanded: row.hitsLanded,
      avgDistance: row.avgDistance / 100,
      maxDistance: row.maxDistance > 0 ? row.maxDistance / 100 : null,
      matchCount: row.matchCount,
    }))
    const category = text(args.weaponCategory).toUpperCase()
    const weapons = aggregateMemberWeapons(memberRows).filter((weapon) => !category || weapon.category === category)
    return {
      player: memberName,
      period: period === 'month' ? 'mois en cours' : 'depuis toujours',
      weapons: weapons.slice(0, WEAPONS_MAX).map((weapon) => ({
        weapon: weapon.name,
        category: weapon.category,
        matches: weapon.matchCount,
        kills: weapon.kills,
        killsPerMatch: weapon.matchCount > 0 ? Math.round((weapon.kills / weapon.matchCount) * 100) / 100 : null,
        headshotRatePercent: weapon.headshotRate !== null ? Math.round(weapon.headshotRate) : null,
        accuracyPercent: weapon.accuracy !== null ? Math.round(weapon.accuracy) : null,
        avgDistanceM: weapon.avgDistance !== null ? Math.round(weapon.avgDistance) : null,
        maxDistanceM: weapon.maxDistance !== null ? Math.round(weapon.maxDistance) : null,
      })),
      weaponsTruncated: weapons.length > WEAPONS_MAX,
    }
  }

  async function getOpponentRecord(args: ToolArgs) {
    const clanTag = text(args.clanTag).replace(/^\[|\]$/g, '').trim()
    if (!clanTag || clanTag.length > 16) return { error: 'clan_not_found', message: 'Tag de clan invalide.' }
    const opponent = await prisma.opponentClan.findFirst({
      where: { tag: clanTag },
      select: { tag: true, name: true, players: { select: { id: true, pubgAccountId: true, pubgPlayerName: true }, take: OPPONENT_PLAYERS_MAX } },
    })
    if (!opponent || opponent.players.length === 0) return { error: 'clan_not_found', message: `Aucun clan adverse connu avec le tag ${clanTag}.` }

    const accountIds = opponent.players.map((player) => player.pubgAccountId)
    const nameOf = new Map(opponent.players.map((player) => [player.pubgAccountId, player.pubgPlayerName]))
    const theirKills = { clanId: scope.clanId, victimMemberId: { not: null }, killerAccountId: { in: accountIds } }
    const ourKills = { clanId: scope.clanId, killerMemberId: { not: null }, victimAccountId: { in: accountIds } }
    const [killsOnThem, deathsToThem, killers, weapons, matches, encounters] = await Promise.all([
      prisma.killEvent.count({ where: ourKills }),
      prisma.killEvent.count({ where: theirKills }),
      prisma.killEvent.groupBy({ by: ['killerAccountId'], where: theirKills, _count: { _all: true }, orderBy: { _count: { killerAccountId: 'desc' } }, take: 3 }),
      prisma.killEvent.groupBy({ by: ['weaponName'], where: theirKills, _count: { _all: true }, orderBy: { _count: { weaponName: 'desc' } }, take: 3 }),
      prisma.killEvent.findMany({ where: { OR: [ourKills, theirKills] }, select: { squadMatchId: true }, distinct: ['squadMatchId'] }),
      prisma.clanEncounter.aggregate({ _max: { lastSeenAt: true }, where: { clanId: scope.clanId, playerId: { in: opponent.players.map((player) => player.id) } } }),
    ])
    const weaponLabels = await getWeaponLabels()
    return {
      clan: { tag: opponent.tag, name: opponent.name },
      playersKnown: opponent.players.length,
      matchesWithFights: matches.length,
      killsOnThem,
      deathsToThem,
      topKillers: killers.map((row) => ({ player: (row.killerAccountId && nameOf.get(row.killerAccountId)) ?? 'Joueur inconnu', kills: row._count._all })),
      theirWeapons: weapons.map((row) => ({ weapon: row.weaponName ? weaponDisplayName(row.weaponName, weaponLabels) : 'Arme inconnue', kills: row._count._all })),
      lastEncounter: encounters._max.lastSeenAt?.toISOString() ?? null,
    }
  }

  async function getDropZones(args: ToolArgs) {
    const requested = text(args.mapName)
    const labels = await getMapLabels()
    const rawMaps = resolveMapNames(requested, labels)
    if (rawMaps.length === 0) return { error: 'map_not_found', message: `Carte inconnue : ${requested || '(vide)'}.` }
    const since = new Date(Date.now() - DROP_DAYS * 24 * 60 * 60 * 1000)
    const [rows, locations] = await Promise.all([
      prisma.dropPressureStat.findMany({
        where: { member: { clanId: scope.clanId }, mapName: { in: rawMaps }, matchDate: { gte: since } },
        orderBy: { matchDate: 'desc' },
        take: DROP_ROWS_MAX,
        select: { squadMatchId: true, mapName: true, x: true, y: true, nearbyPlayerCount250m: true, pressureLevel: true, squadMatch: { select: { placement: true } } },
      }),
      getMapLocations(),
    ])

    // Une escouade atterrit ensemble : une ligne par partie suffit (la première rencontrée, la plus récente).
    const byMatch = new Map<string, (typeof rows)[number]>()
    for (const row of rows) if (!byMatch.has(row.squadMatchId)) byMatch.set(row.squadMatchId, row)

    type Zone = { landings: number; nearby: number; hot: number; placements: number[] }
    const zones = new Map<string, Zone>()
    for (const row of byMatch.values()) {
      const bounds = getMapBounds(row.mapName)
      const city = locationForPercent((row.x / bounds.width) * 100, (row.y / bounds.height) * 100, locations[row.mapName] ?? [])
      const key = city?.name ?? 'Hors ville'
      const zone = zones.get(key) ?? { landings: 0, nearby: 0, hot: 0, placements: [] }
      zone.landings += 1
      zone.nearby += row.nearbyPlayerCount250m
      if (row.pressureLevel === 'hot' || row.pressureLevel === 'very_hot') zone.hot += 1
      zone.placements.push(row.squadMatch.placement)
      zones.set(key, zone)
    }
    const ranked = [...zones.entries()]
      .sort((a, b) => b[1].landings - a[1].landings)
      .map(([zone, stats]) => ({
        zone,
        landings: stats.landings,
        avgNearbyPlayers250m: Math.round((stats.nearby / stats.landings) * 10) / 10,
        hotDropPercent: Math.round((stats.hot / stats.landings) * 100),
        avgPlacement: Math.round((stats.placements.reduce((sum, value) => sum + value, 0) / stats.placements.length) * 10) / 10,
        top10Percent: Math.round((stats.placements.filter((placement) => placement <= 10).length / stats.placements.length) * 100),
        winPercent: Math.round((stats.placements.filter((placement) => placement === 1).length / stats.placements.length) * 100),
      }))
    return {
      map: mapDisplayName(rawMaps[0], labels),
      days: DROP_DAYS,
      matches: byMatch.size,
      zones: ranked.slice(0, DROP_ZONES_MAX),
      zonesTruncated: ranked.length > DROP_ZONES_MAX,
    }
  }

  const handlers: Record<string, (args: ToolArgs) => Promise<unknown>> = {
    getRecentMatches,
    getMatchDebrief,
    getWeaponStats,
    getOpponentRecord,
    getDropZones,
  }

  return {
    declarations: COACH_TOOL_DECLARATIONS,
    async run(call) {
      const handler = handlers[call.name]
      if (!handler) return { error: 'unknown_tool', message: `Outil inconnu : ${call.name}.` }
      return handler(call.args ?? {})
    },
  }
}
