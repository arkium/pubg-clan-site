import 'server-only'

import { Prisma } from '@prisma/client'

import { leagueMatchTypeValues, type LeagueMatchType } from '@/lib/clan-league'
import {
  buildClanMapRows,
  buildClanMapsVerdict,
  CLAN_MAPS_MIN_SAMPLE,
  pickStarPlayers,
  type ClanMapAggregate,
  type ClanMapStatsPayload,
  type LeagueMapAverage,
} from '@/lib/clan-maps'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getPeriodRange, type PeriodRange, type StandardPeriod } from '@/lib/period'

export type { ClanMapStatsPayload } from '@/lib/clan-maps'
import { prisma } from '@/lib/prisma'

/**
 * Données de la page « Cartes » d'un clan (docs/TODO/cartes-clan.md) : par carte et pour la période, les parties
 * d'escouade du clan, la même période juste avant (tendance du Top 10), la moyenne de tous les clans suivis et le joueur
 * phare. Mêmes règles que la Ligue (`loadLeagueRows`) : une ligne par clan et par partie, placement de l'équipe, kills
 * et dégâts des seuls membres actifs, clans actifs ayant un clan PUBG.
 */

const LEAGUE_CACHE_TTL_MS = 5 * 60 * 1000

type LeagueCacheEntry = { at: number; averages: LeagueMapAverage[]; clans: number }

const globalForMaps = globalThis as typeof globalThis & { clanMapsLeagueCache?: Map<string, LeagueCacheEntry> }
globalForMaps.clanMapsLeagueCache ??= new Map()

/** Réservé aux tests : vide le cache de la moyenne des clans. */
export function resetClanMapsLeagueCache() {
  globalForMaps.clanMapsLeagueCache?.clear()
}

const typeSql = (matchType: LeagueMatchType) => Prisma.sql`sm.matchType IN (${Prisma.join(leagueMatchTypeValues(matchType))})`

const rangeSql = (range: PeriodRange | null) =>
  range ? Prisma.sql`AND sm.createdAt >= ${range.start} AND sm.createdAt < ${range.end}` : Prisma.empty

type RawAggregate = {
  mapName: string
  matches: bigint | number
  wins: bigint | number | null
  top10: bigint | number | null
  placementSum: bigint | number | null
  killsSum: bigint | number | null
  damageSum: number | null
}

const toAggregate = (row: RawAggregate): ClanMapAggregate => ({
  mapName: row.mapName,
  matches: Number(row.matches),
  wins: Number(row.wins ?? 0),
  top10: Number(row.top10 ?? 0),
  placementSum: Number(row.placementSum ?? 0),
  killsSum: Number(row.killsSum ?? 0),
  damageSum: Number(row.damageSum ?? 0),
})

async function loadClanAggregates(clanId: number, matchType: LeagueMatchType, range: PeriodRange | null) {
  const rows = await prisma.$queryRaw<RawAggregate[]>(Prisma.sql`
    SELECT t.mapName AS mapName, COUNT(*) AS matches, SUM(t.placement = 1) AS wins, SUM(t.placement <= 10) AS top10,
           SUM(t.placement) AS placementSum, SUM(t.kills) AS killsSum, SUM(t.damage) AS damageSum
      FROM (
        SELECT sm.id, sm.mapName, sm.placement, SUM(sq.kills) AS kills, SUM(sq.damage) AS damage
          FROM SquadMember sq
          INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
          INNER JOIN ClanMember cm ON cm.id = sq.memberId
         WHERE cm.clanId = ${clanId} AND cm.isActive = 1 AND cm.joinStatus = 'active'
           AND ${typeSql(matchType)} ${rangeSql(range)}
         GROUP BY sm.id, sm.mapName, sm.placement
      ) t
     GROUP BY t.mapName
  `)
  return rows.map(toAggregate)
}

async function loadLeagueAverages(matchType: LeagueMatchType, range: PeriodRange | null): Promise<LeagueCacheEntry> {
  const key = `${matchType}|${range ? `${range.start.toISOString()}|${range.end.toISOString()}` : 'all'}`
  const cached = globalForMaps.clanMapsLeagueCache!.get(key)
  if (cached && Date.now() - cached.at < LEAGUE_CACHE_TTL_MS) return cached

  const [rows, clans] = await Promise.all([
    prisma.$queryRaw<Array<{ mapName: string; top10Rate: number | null; avgPlacement: number | null; killsPerMatch: number | null }>>(Prisma.sql`
      SELECT t.mapName AS mapName, AVG(t.placement <= 10) AS top10Rate, AVG(t.placement) AS avgPlacement, AVG(t.kills) AS killsPerMatch
        FROM (
          SELECT cm.clanId, sm.id, sm.mapName, sm.placement, SUM(sq.kills) AS kills
            FROM SquadMember sq
            INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
            INNER JOIN ClanMember cm ON cm.id = sq.memberId
            INNER JOIN Clan c ON c.id = cm.clanId
           WHERE cm.isActive = 1 AND cm.joinStatus = 'active' AND c.isActive = 1 AND c.pubgClanId IS NOT NULL
             AND ${typeSql(matchType)} ${rangeSql(range)}
           GROUP BY cm.clanId, sm.id, sm.mapName, sm.placement
        ) t
       GROUP BY t.mapName
    `),
    prisma.clan.count({ where: { isActive: true, pubgClanId: { not: null } } }),
  ])

  const entry: LeagueCacheEntry = {
    at: Date.now(),
    clans,
    averages: rows.map((row) => ({
      mapName: row.mapName,
      top10Rate: Number(row.top10Rate ?? 0),
      avgPlacement: Number(row.avgPlacement ?? 0),
      killsPerMatch: Number(row.killsPerMatch ?? 0),
    })),
  }
  globalForMaps.clanMapsLeagueCache!.set(key, entry)
  return entry
}

async function loadStarPlayerRows(clanId: number, matchType: LeagueMatchType, range: PeriodRange | null) {
  const rows = await prisma.$queryRaw<
    Array<{ mapName: string; memberId: number; displayName: string; matches: bigint | number; killsSum: bigint | number | null }>
  >(Prisma.sql`
    SELECT sm.mapName AS mapName, cm.id AS memberId, cm.displayName AS displayName, COUNT(*) AS matches, SUM(sq.kills) AS killsSum
      FROM SquadMember sq
      INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
      INNER JOIN ClanMember cm ON cm.id = sq.memberId
     WHERE cm.clanId = ${clanId} AND cm.isActive = 1 AND cm.joinStatus = 'active'
       AND ${typeSql(matchType)} ${rangeSql(range)}
     GROUP BY sm.mapName, cm.id, cm.displayName
    HAVING COUNT(*) >= ${CLAN_MAPS_MIN_SAMPLE}
  `)
  return rows.map((row) => ({
    mapName: row.mapName,
    memberId: Number(row.memberId),
    displayName: row.displayName,
    matches: Number(row.matches),
    killsSum: Number(row.killsSum ?? 0),
  }))
}

/** `null` si le clan n'existe pas. */
export async function loadClanMapStats(input: {
  clanId: number
  period: StandardPeriod
  matchType: LeagueMatchType
  now?: Date
}): Promise<ClanMapStatsPayload | null> {
  const clan = await prisma.clan.findUnique({ where: { id: input.clanId }, select: { id: true, name: true, tag: true } })
  if (!clan) return null

  const now = input.now ?? new Date()
  const range = getPeriodRange(input.period, now)
  // Période précédente de même nature : la semaine ou le mois civil d'avant ; aucune pour « Tous ».
  const previousRange = range ? getPeriodRange(input.period, new Date(range.start.getTime() - 1)) : null

  const [current, previous, league, starRows, mapLabels] = await Promise.all([
    loadClanAggregates(clan.id, input.matchType, range),
    previousRange ? loadClanAggregates(clan.id, input.matchType, previousRange) : Promise.resolve(null),
    loadLeagueAverages(input.matchType, range),
    loadStarPlayerRows(clan.id, input.matchType, range),
    getMapLabels(),
  ])

  const maps = buildClanMapRows({
    current,
    previous,
    league: league.averages,
    stars: pickStarPlayers(starRows),
    labelOf: (mapName) => mapDisplayName(mapName, mapLabels),
  })

  return {
    clan,
    period: input.period,
    matchType: input.matchType,
    minSample: CLAN_MAPS_MIN_SAMPLE,
    comparedClans: league.clans,
    totals: { matches: maps.reduce((sum, row) => sum + row.matches, 0), maps: maps.length },
    maps,
    verdict: buildClanMapsVerdict(maps),
  }
}
