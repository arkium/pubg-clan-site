import { Prisma } from '@prisma/client'

import { previousPeriodRange } from '@/lib/clan-league-service'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getPeriodRange, type PeriodRange, type StandardPeriod } from '@/lib/period'
import {
  EMPTY_TOTALS,
  PLAYERS_MIN_MATCHES,
  PLAYERS_MIN_RANKED,
  addTotals,
  compareKeyId,
  gameModePrefix,
  playerStyle,
  ranksByMember,
  roleScores,
  rolePopulation,
  statLine,
  type CompareKey,
  type ComparedValues,
  type PlayerDuel,
  type PlayerRankingEntry,
  type PlayerRoles,
  type PlayerStatLine,
  type PlayerTotals,
  type PlayersMode,
  type RolePopulation,
} from '@/lib/players-ranking'
import { prisma } from '@/lib/prisma'
import { getPeriodKey } from '@/lib/pubg-telemetry/period-aggregates'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'
import { aggregateMemberWeapons, type MemberWeapon } from '@/lib/weapons/member-arsenal'

/**
 * Joueurs — données du classement inter-clans et du comparateur (docs/features/joueurs.md).
 *
 * Parties retenues (décision du 2026-10-12) : les parties officielles **de clan** (`SquadMember`), comme la Ligue et le
 * classement d'un clan ; joueurs actifs des clans suivis (actifs, hors clan technique, non archivés). Trois lectures
 * groupées par joueur, chacune couvrant la période et la précédente (flèches) : moyennes (`SquadMember`), distance des
 * kills (`KillEvent`), fermetures de zone (`ZoneClosurePosition`). Mesuré le 2026-10-12 (scripts/measure-players-ranking.ts) :
 * environ 1 s chacune. Résultat gardé 5 minutes en mémoire par période et mode.
 */

const CACHE_TTL_MS = 5 * 60 * 1000

const TRACKED_CLAN = { isActive: true, isSystem: false, archivedAt: null } as const

export type PlayersRankingPayload = {
  period: StandardPeriod
  mode: PlayersMode
  minMatches: number
  minRanked: number
  /** Joueurs actifs et clans suivis (tout l'effectif, pas seulement ceux qui ont joué). */
  totals: { players: number; clans: number }
  /** Joueurs à `minMatches` parties ou plus, sans ordre (le classement dépend du critère). */
  ranked: PlayerRankingEntry[]
  /** Joueurs sous le seuil : la carte « Mon rang » et la recherche du comparateur. */
  qualifying: PlayerRankingEntry[]
  /** Clans qui ont au moins un joueur sur la période (filtre « Tous les clans »). */
  clans: Array<{ clanId: number; name: string; tag: string }>
  lastMatchAt: string | null
}

type Identity = { memberId: number; name: string; clanId: number; clanName: string; clanTag: string; accountId: string | null }

/** Ce que garde le cache : la réponse, et de quoi calculer une moyenne de clan dans le comparateur. */
type RankingState = {
  payload: PlayersRankingPayload
  population: RolePopulation
  totalsByMember: Map<number, PlayerTotals>
  identities: Map<number, Identity>
}

const cache = new Map<string, { expiresAt: number; state: Promise<RankingState> }>()

/** Vide le cache (tests). */
export function clearPlayersRankingCache() {
  cache.clear()
}

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────

type Windows = { current: PeriodRange | null; previous: PeriodRange | null }

function windowsOf(period: StandardPeriod, now: Date): Windows {
  return { current: getPeriodRange(period, now), previous: previousPeriodRange(period, now) }
}

/** Filtres communs (alias `sm` = SquadMatch) : partie officielle, mode, fenêtre période + période précédente. */
function matchFilters(windows: Windows, mode: PlayersMode) {
  const prefix = gameModePrefix(mode)
  const since = windows.previous?.start ?? windows.current?.start ?? null
  return Prisma.sql`sm.matchType = 'official'
    ${prefix ? Prisma.sql`AND sm.gameMode LIKE ${`${prefix}%`}` : Prisma.empty}
    ${since ? Prisma.sql`AND sm.createdAt >= ${since}` : Prisma.empty}
    ${windows.current ? Prisma.sql`AND sm.createdAt < ${windows.current.end}` : Prisma.empty}`
}

/** 1 : partie de la période ; 0 : de la période précédente. « Tous » n'a pas de période précédente. */
function bucketOf(windows: Windows) {
  return windows.current ? Prisma.sql`(sm.createdAt >= ${windows.current.start})` : Prisma.sql`1`
}

const num = (value: unknown) => (typeof value === 'bigint' ? Number(value) : Number(value ?? 0))

type Bucketed<T> = { current: Map<number, T>; previous: Map<number, T> }

function bucketed<T>(): Bucketed<T> {
  return { current: new Map(), previous: new Map() }
}

async function loadMatchTotals(windows: Windows, mode: PlayersMode) {
  const bucket = bucketOf(windows)
  const rows = await prisma.$queryRaw<
    Array<{
      memberId: number
      isCurrent: number | bigint
      matches: bigint
      wins: unknown
      damage: unknown
      kills: unknown
      knocks: unknown
      revives: unknown
      assists: unknown
      headshotKills: unknown
      survivalSeconds: unknown
      lastMatchAt: Date | null
    }>
  >(Prisma.sql`
    SELECT sq.memberId AS memberId, ${bucket} AS isCurrent, COUNT(*) AS matches, SUM(sq.placement = 1) AS wins,
           SUM(sq.damage) AS damage, SUM(sq.kills) AS kills, SUM(sq.knockouts) AS knocks, SUM(sq.revives) AS revives,
           SUM(sq.assists) AS assists, SUM(sq.headshotKills) AS headshotKills, SUM(sq.timeSurvived) AS survivalSeconds,
           MAX(sm.createdAt) AS lastMatchAt
    FROM SquadMember sq
    INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
    INNER JOIN ClanMember cm ON cm.id = sq.memberId
    INNER JOIN Clan c ON c.id = cm.clanId
    WHERE ${matchFilters(windows, mode)}
      AND cm.isActive = 1 AND cm.joinStatus = 'active'
      AND c.isActive = 1 AND c.isSystem = 0 AND c.archivedAt IS NULL
    GROUP BY sq.memberId${windows.current ? Prisma.sql`, isCurrent` : Prisma.empty}
  `)
  const result = bucketed<PlayerTotals>()
  let lastMatchAt: Date | null = null
  for (const row of rows) {
    const current = num(row.isCurrent) === 1
    ;(current ? result.current : result.previous).set(Number(row.memberId), {
      ...EMPTY_TOTALS,
      matches: num(row.matches),
      wins: num(row.wins),
      damage: num(row.damage),
      kills: num(row.kills),
      knocks: num(row.knocks),
      revives: num(row.revives),
      assists: num(row.assists),
      headshotKills: num(row.headshotKills),
      survivalSeconds: num(row.survivalSeconds),
    })
    if (current && row.lastMatchAt && (!lastMatchAt || new Date(row.lastMatchAt) > lastMatchAt)) lastMatchAt = new Date(row.lastMatchAt)
  }
  return { totals: result, lastMatchAt }
}

/** Distance des kills (télémétrie, en cm) : les parties analysées seulement ; un suicide ne compte pas. */
async function loadKillDistances(windows: Windows, mode: PlayersMode) {
  const bucket = bucketOf(windows)
  const rows = await prisma.$queryRaw<Array<{ memberId: number; isCurrent: number | bigint; measuredKills: bigint; distanceCm: unknown }>>(Prisma.sql`
    SELECT ke.killerMemberId AS memberId, ${bucket} AS isCurrent, COUNT(ke.distance) AS measuredKills, SUM(ke.distance) AS distanceCm
    FROM KillEvent ke
    INNER JOIN SquadMatch sm ON sm.id = ke.squadMatchId
    WHERE ke.killerMemberId IS NOT NULL
      AND (ke.victimMemberId IS NULL OR ke.victimMemberId <> ke.killerMemberId)
      AND ${matchFilters(windows, mode)}
    GROUP BY ke.killerMemberId${windows.current ? Prisma.sql`, isCurrent` : Prisma.empty}
  `)
  const result = bucketed<{ measuredKills: number; killDistanceMeters: number }>()
  for (const row of rows) {
    ;(num(row.isCurrent) === 1 ? result.current : result.previous).set(Number(row.memberId), {
      measuredKills: num(row.measuredKills),
      killDistanceMeters: num(row.distanceCm) / 100,
    })
  }
  return result
}

/** Fermetures de zone (docs/features/fin-de-zone.md) : dans le nouveau cercle = bande `center` ou `edge`. */
async function loadZoneClosures(windows: Windows, mode: PlayersMode) {
  const bucket = bucketOf(windows)
  const rows = await prisma.$queryRaw<Array<{ memberId: number; isCurrent: number | bigint; closures: bigint; inside: unknown }>>(Prisma.sql`
    SELECT z.memberId AS memberId, ${bucket} AS isCurrent, COUNT(*) AS closures, SUM(z.zoneBand <> 'outside') AS inside
    FROM ZoneClosurePosition z
    INNER JOIN SquadMatch sm ON sm.id = z.squadMatchId
    WHERE ${matchFilters(windows, mode)}
    GROUP BY z.memberId${windows.current ? Prisma.sql`, isCurrent` : Prisma.empty}
  `)
  const result = bucketed<{ zoneClosures: number; zoneInside: number }>()
  for (const row of rows) {
    ;(num(row.isCurrent) === 1 ? result.current : result.previous).set(Number(row.memberId), { zoneClosures: num(row.closures), zoneInside: num(row.inside) })
  }
  return result
}

async function loadIdentities(memberIds: number[]) {
  if (memberIds.length === 0) return new Map<number, Identity>()
  const members = await prisma.clanMember.findMany({
    where: { id: { in: memberIds }, clan: TRACKED_CLAN },
    select: { id: true, displayName: true, pubgAccountId: true, clan: { select: { id: true, name: true, tag: true } } },
  })
  return new Map(
    members.flatMap((member) =>
      member.clan
        ? [[member.id, { memberId: member.id, name: member.displayName, clanId: member.clan.id, clanName: member.clan.name, clanTag: member.clan.tag, accountId: member.pubgAccountId }] as const]
        : []
    )
  )
}

/** Sommes complètes d'un joueur dans une fenêtre : parties, distance des kills, fermetures de zone. */
function mergeTotals(
  matches: Map<number, PlayerTotals>,
  kills: Map<number, { measuredKills: number; killDistanceMeters: number }>,
  zone: Map<number, { zoneClosures: number; zoneInside: number }>
) {
  const merged = new Map<number, PlayerTotals>()
  for (const [memberId, totals] of matches) {
    merged.set(memberId, { ...totals, ...(kills.get(memberId) ?? {}), ...(zone.get(memberId) ?? {}) })
  }
  return merged
}

// ── Classement ──────────────────────────────────────────────────────────────────────────────────

async function computeRanking(period: StandardPeriod, mode: PlayersMode, now: Date): Promise<RankingState> {
  const windows = windowsOf(period, now)
  const [matchTotals, kills, zone, players, clans] = await Promise.all([
    loadMatchTotals(windows, mode),
    loadKillDistances(windows, mode),
    loadZoneClosures(windows, mode),
    prisma.clanMember.count({ where: { isActive: true, joinStatus: 'active', clan: TRACKED_CLAN } }),
    prisma.clan.count({ where: TRACKED_CLAN }),
  ])
  const currentTotals = mergeTotals(matchTotals.totals.current, kills.current, zone.current)
  const previousTotals = mergeTotals(matchTotals.totals.previous, kills.previous, zone.previous)
  const identities = await loadIdentities([...currentTotals.keys()])

  // Période précédente : mêmes règles (seuil, population de ses classés), pour les flèches de chaque critère.
  let previousRanks: Map<number, Array<number | null>> | null = null
  if (windows.current) {
    const previousLines = [...previousTotals.entries()]
      .filter(([, totals]) => totals.matches >= PLAYERS_MIN_MATCHES)
      .map(([memberId, totals]) => ({ memberId, name: identities.get(memberId)?.name ?? String(memberId), line: statLine(totals) }))
    const previousPopulation = rolePopulation(previousLines.map((entry) => entry.line))
    previousRanks = ranksByMember(previousLines.map((entry) => ({ memberId: entry.memberId, name: entry.name, ...entry.line, roles: roleScores(entry.line, previousPopulation, true) })))
  }

  const lines = [...currentTotals.entries()].flatMap(([memberId, totals]) => {
    const identity = identities.get(memberId)
    return identity ? [{ identity, line: statLine(totals) }] : []
  })
  const rankedLines = lines.filter((entry) => entry.line.matches >= PLAYERS_MIN_MATCHES)
  const population = rolePopulation(rankedLines.map((entry) => entry.line))
  const toEntry = (identity: Identity, line: PlayerStatLine, ranked: boolean): PlayerRankingEntry => {
    const roles = roleScores(line, population, ranked)
    return {
      memberId: identity.memberId,
      name: identity.name,
      clanId: identity.clanId,
      clanName: identity.clanName,
      clanTag: identity.clanTag,
      ...line,
      style: playerStyle(roles),
      roles,
      previousRanks: ranked && previousRanks ? (previousRanks.get(identity.memberId) ?? null) : null,
    }
  }

  const clanMap = new Map<number, { clanId: number; name: string; tag: string }>()
  for (const { identity } of lines) clanMap.set(identity.clanId, { clanId: identity.clanId, name: identity.clanName, tag: identity.clanTag })

  return {
    payload: {
      period,
      mode,
      minMatches: PLAYERS_MIN_MATCHES,
      minRanked: PLAYERS_MIN_RANKED,
      totals: { players, clans },
      ranked: rankedLines.map((entry) => toEntry(entry.identity, entry.line, true)),
      qualifying: lines.filter((entry) => entry.line.matches < PLAYERS_MIN_MATCHES).map((entry) => toEntry(entry.identity, entry.line, false)),
      clans: [...clanMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      lastMatchAt: matchTotals.lastMatchAt?.toISOString() ?? null,
    },
    population,
    totalsByMember: currentTotals,
    identities,
  }
}

function rankingState(period: StandardPeriod, mode: PlayersMode, now: Date): Promise<RankingState> {
  const key = `${period}:${mode}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now.getTime()) return cached.state
  // La promesse est gardée : deux visiteurs simultanés ne relancent pas les trois lectures.
  const state = computeRanking(period, mode, now)
  cache.set(key, { expiresAt: now.getTime() + CACHE_TTL_MS, state })
  state.catch(() => cache.delete(key))
  return state
}

export async function getPlayersRanking(period: StandardPeriod, mode: PlayersMode, now = new Date()): Promise<PlayersRankingPayload> {
  return (await rankingState(period, mode, now)).payload
}

// ── Comparateur ─────────────────────────────────────────────────────────────────────────────────

export type ComparedWeapon = { id: string; name: string; iconId: string; kills: number; accuracy: number | null; matchCount: number }

export type ComparedSlot = {
  key: string
  kind: 'player' | 'clan'
  memberId: number | null
  clanId: number
  name: string
  clanName: string
  clanTag: string
  /** Moyenne d'un clan : nombre de ses joueurs qui ont joué sur la période. */
  players: number | null
  matches: number
  /** Au seuil du classement (toujours vrai pour une moyenne de clan) : sinon, chiffres indicatifs. */
  qualified: boolean
  values: ComparedValues
  roles: PlayerRoles
  /** Les trois armes les plus jouées (agrégats de la période, tous modes). */
  weapons: ComparedWeapon[]
}

export type PlayersComparisonPayload = {
  period: StandardPeriod
  mode: PlayersMode
  minMatches: number
  slots: ComparedSlot[]
  /** Duels entre joueurs comparés, depuis le début et tous modes (comme le face-à-face du comparateur de clans). */
  duels: PlayerDuel[]
}

type TelemetryRow = { memberId: number; avgCircleDelaySeconds: number; avgCircleDelayPercent: number; avgBlueZoneHits: number; matchesPlayed: number }

/**
 * Retard sur le cercle et zone bleue : moyenne pondérée par les parties (`MemberTelemetryStats` de la période). Le retard
 * n'est mesuré que sur les parties récentes : sans aucune mesure (0 s et 0 %), « — » plutôt que 0 s (comme le style de jeu).
 */
function telemetryValues(rows: TelemetryRow[]) {
  const counted = rows.filter((row) => row.matchesPlayed > 0)
  const weight = counted.reduce((sum, row) => sum + row.matchesPlayed, 0)
  if (weight === 0) return { avgCircleDelaySeconds: null, avgBlueZoneHits: null }
  const weighted = (pick: (row: TelemetryRow) => number, subset = counted) => {
    const total = subset.reduce((sum, row) => sum + row.matchesPlayed, 0)
    return total > 0 ? Math.round((subset.reduce((sum, row) => sum + pick(row) * row.matchesPlayed, 0) / total) * 10) / 10 : null
  }
  const measured = counted.filter((row) => row.avgCircleDelaySeconds > 0 || row.avgCircleDelayPercent > 0)
  return { avgCircleDelaySeconds: measured.length > 0 ? weighted((row) => row.avgCircleDelaySeconds, measured) : null, avgBlueZoneHits: weighted((row) => row.avgBlueZoneHits) }
}

/** Hors du râtelier, comme le sac de l'armurerie : les lancers (grenades) et la mêlée ne sont pas « l'arme jouée ». */
const NOT_A_GUN = new Set(['THROWABLE', 'MELEE'])

/** Armes : agrégées par joueur (variantes fusionnées), puis additionnées pour une moyenne de clan. */
export function topWeapons(perMember: MemberWeapon[][]): ComparedWeapon[] {
  const merged = new Map<string, ComparedWeapon & { shotsFired: number; hitsLanded: number }>()
  for (const weapons of perMember) {
    for (const weapon of weapons) {
      if (NOT_A_GUN.has(weapon.category)) continue
      const entry = merged.get(weapon.id) ?? { id: weapon.id, name: weapon.name, iconId: weapon.iconId, kills: 0, accuracy: null, matchCount: 0, shotsFired: 0, hitsLanded: 0 }
      entry.kills += weapon.kills
      entry.matchCount += weapon.matchCount
      entry.shotsFired += weapon.shotsFired
      entry.hitsLanded += weapon.hitsLanded
      merged.set(weapon.id, entry)
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.matchCount - a.matchCount || b.kills - a.kills || a.name.localeCompare(b.name, 'fr'))
    .slice(0, 3)
    .map(({ shotsFired, hitsLanded, ...weapon }) => ({ ...weapon, accuracy: shotsFired > 0 ? Math.round((hitsLanded / shotsFired) * 1000) / 10 : null }))
}

function comparedValues(line: PlayerStatLine, telemetry: { avgCircleDelaySeconds: number | null; avgBlueZoneHits: number | null }): ComparedValues {
  return {
    avgDamage: line.avgDamage,
    avgKills: line.avgKills,
    avgKnocks: line.avgKnocks,
    headshotRate: line.headshotRate,
    avgKillDistance: line.avgKillDistance,
    avgRevives: line.avgRevives,
    avgAssists: line.avgAssists,
    avgSurvivalSeconds: line.avgSurvivalSeconds,
    ...telemetry,
  }
}

/** Éliminations entre les joueurs comparés, retrouvés par membre ou par compte PUBG (clan non rattaché à la partie). */
async function loadDuels(players: Array<{ key: string; memberId: number; accountId: string | null; name: string }>): Promise<PlayerDuel[]> {
  if (players.length < 2) return []
  const ids = players.map((player) => player.memberId)
  const accounts = players.flatMap((player) => (player.accountId ? [player.accountId] : []))
  const victimFilter = accounts.length > 0 ? Prisma.sql`(ke.victimMemberId IN (${Prisma.join(ids)}) OR ke.victimAccountId IN (${Prisma.join(accounts)}))` : Prisma.sql`ke.victimMemberId IN (${Prisma.join(ids)})`
  type KillRow = { id: string; killerMemberId: number | null; killerAccountId: string | null; victimMemberId: number | null; victimAccountId: string | null; matchDate: Date; mapName: string }
  const rows = await prisma.$queryRaw<KillRow[]>(Prisma.sql`
    SELECT ke.id, ke.killerMemberId, ke.killerAccountId, ke.victimMemberId, ke.victimAccountId, ke.matchDate, sm.mapName
    FROM KillEvent ke INNER JOIN SquadMatch sm ON sm.id = ke.squadMatchId
    WHERE ke.killerMemberId IN (${Prisma.join(ids)}) AND ${victimFilter}
    ${
      accounts.length > 0
        ? Prisma.sql`UNION ALL
    SELECT ke.id, ke.killerMemberId, ke.killerAccountId, ke.victimMemberId, ke.victimAccountId, ke.matchDate, sm.mapName
    FROM KillEvent ke INNER JOIN SquadMatch sm ON sm.id = ke.squadMatchId
    WHERE ke.victimMemberId IN (${Prisma.join(ids)}) AND ke.killerMemberId IS NULL AND ke.killerAccountId IN (${Prisma.join(accounts)})`
        : Prisma.empty
    }
  `)
  const playerOf = (memberId: number | null, accountId: string | null) =>
    players.find((player) => (memberId !== null && player.memberId === memberId) || (accountId !== null && player.accountId === accountId)) ?? null
  const mapLabels = rows.length > 0 ? await getMapLabels() : {}
  const seen = new Set<string>()
  const duels: PlayerDuel[] = []
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i]
      const b = players[j]
      let aKills = 0
      let bKills = 0
      let last: { date: Date; mapName: string; killer: string } | null = null
      for (const row of rows) {
        const killer = playerOf(row.killerMemberId, row.killerAccountId)
        const victim = playerOf(row.victimMemberId, row.victimAccountId)
        if (!killer || !victim || killer === victim) continue
        const pair = (killer === a && victim === b) || (killer === b && victim === a)
        if (!pair || seen.has(`${row.id}:${i}:${j}`)) continue
        seen.add(`${row.id}:${i}:${j}`)
        if (killer === a) aKills += 1
        else bKills += 1
        const date = new Date(row.matchDate)
        if (!last || date > last.date) last = { date, mapName: mapDisplayName(row.mapName, mapLabels), killer: killer.key }
      }
      duels.push({ a: a.key, b: b.key, aKills, bKills, last: last ? { date: last.date.toISOString(), mapName: last.mapName, killer: last.killer } : null })
    }
  }
  return duels
}

export async function getPlayersComparison(keys: CompareKey[], period: StandardPeriod, mode: PlayersMode, now = new Date()): Promise<PlayersComparisonPayload> {
  const state = await rankingState(period, mode, now)
  const entries = new Map([...state.payload.ranked, ...state.payload.qualifying].map((entry) => [entry.memberId, entry]))

  // Joueurs sans partie sur la période : identité seule, chiffres à zéro.
  const missing = keys.flatMap((key) => (key.kind === 'player' && !state.identities.has(key.memberId) ? [key.memberId] : []))
  const extraIdentities = await loadIdentities(missing)
  const identityOf = (memberId: number) => state.identities.get(memberId) ?? extraIdentities.get(memberId) ?? null

  const clanKeys = keys.flatMap((key) => (key.kind === 'clan' ? [key.clanId] : []))
  const clans = clanKeys.length > 0 ? await prisma.clan.findMany({ where: { id: { in: clanKeys }, ...TRACKED_CLAN }, select: { id: true, name: true, tag: true } }) : []
  const membersOfClan = (clanId: number) => [...state.totalsByMember.keys()].filter((memberId) => state.identities.get(memberId)?.clanId === clanId)

  type Resolved = { key: CompareKey; memberIds: number[] }
  const resolved = keys.flatMap((key): Resolved[] => {
    if (key.kind === 'player') return identityOf(key.memberId) ? [{ key, memberIds: [key.memberId] }] : []
    return clans.some((clan) => clan.id === key.clanId) ? [{ key, memberIds: membersOfClan(key.clanId) }] : []
  })

  const periodKey = getPeriodKey(period, now)
  const allMemberIds = [...new Set(resolved.flatMap((entry) => entry.memberIds))]
  const [telemetryRows, weaponRows, weaponLabels] = await Promise.all([
    allMemberIds.length > 0
      ? prisma.memberTelemetryStats.findMany({
          where: { memberId: { in: allMemberIds }, period: periodKey },
          select: { memberId: true, avgCircleDelaySeconds: true, avgCircleDelayPercent: true, avgBlueZoneHits: true, matchesPlayed: true },
        })
      : Promise.resolve([] as TelemetryRow[]),
    allMemberIds.length > 0
      ? prisma.memberWeaponStats.findMany({
          where: { memberId: { in: allMemberIds }, period: periodKey },
          select: { memberId: true, weaponName: true, kills: true, headshots: true, shotsFired: true, hitsLanded: true, avgDistance: true, maxDistance: true, matchCount: true },
        })
      : Promise.resolve([]),
    allMemberIds.length > 0 ? getWeaponLabels() : Promise.resolve({} as Record<string, string>),
  ])
  const weaponsOf = (memberId: number) =>
    aggregateMemberWeapons(
      weaponRows
        .filter((row) => row.memberId === memberId)
        // Distances des agrégats en cm, comme la route des armes d'un joueur.
        .map((row) => ({ ...row, weaponLabel: weaponDisplayName(row.weaponName, weaponLabels), avgDistance: row.avgDistance / 100, maxDistance: row.maxDistance / 100 }))
    )

  const slots: ComparedSlot[] = resolved.map(({ key, memberIds }) => {
    const telemetry = telemetryValues(telemetryRows.filter((row) => memberIds.includes(row.memberId)))
    const weapons = topWeapons(memberIds.map(weaponsOf))
    if (key.kind === 'player') {
      const identity = identityOf(key.memberId)!
      const entry = entries.get(key.memberId)
      const line = entry ?? statLine(EMPTY_TOTALS)
      return {
        key: compareKeyId(key),
        kind: 'player',
        memberId: key.memberId,
        clanId: identity.clanId,
        name: identity.name,
        clanName: identity.clanName,
        clanTag: identity.clanTag,
        players: null,
        matches: line.matches,
        qualified: line.matches >= PLAYERS_MIN_MATCHES,
        values: comparedValues(line, telemetry),
        roles: entry?.roles ?? roleScores(line, state.population, false),
        weapons,
      }
    }
    const clan = clans.find((candidate) => candidate.id === key.clanId)!
    const totals = memberIds.reduce((sum, memberId) => addTotals(sum, state.totalsByMember.get(memberId) ?? EMPTY_TOTALS), EMPTY_TOTALS)
    const line = statLine(totals)
    return {
      key: compareKeyId(key),
      kind: 'clan',
      memberId: null,
      clanId: clan.id,
      name: `Moyenne ${clan.name}`,
      clanName: clan.name,
      clanTag: clan.tag,
      players: memberIds.length,
      matches: line.matches,
      qualified: true,
      values: comparedValues(line, telemetry),
      roles: roleScores(line, state.population, false),
      weapons,
    }
  })

  const duelPlayers = slots.flatMap((slot) =>
    slot.kind === 'player' && slot.memberId !== null ? [{ key: slot.key, memberId: slot.memberId, accountId: identityOf(slot.memberId)?.accountId ?? null, name: slot.name }] : []
  )
  return { period, mode, minMatches: PLAYERS_MIN_MATCHES, slots, duels: await loadDuels(duelPlayers) }
}
