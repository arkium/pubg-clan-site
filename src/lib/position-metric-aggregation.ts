import { Prisma, type PrismaClient } from '@prisma/client'

import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import { prisma } from '@/lib/prisma'
import type { PositionMetric } from '@/lib/position-metric-cells'
import type { RawPositionTelemetryRow } from '@/lib/position-metric-raw-aggregation'

export type PositionMetricPeriodBounds = {
  startDate: Date
  endDate: Date
} | null

export type PositionMetricMapSummary = {
  mapName: string
  matches: number
  positionPoints: number
  rotationPoints: number
  deathPoints: number
}

export type AggregatedPositionMetricCell = {
  metric: PositionMetric
  xIndex: number
  yIndex: number
  count: number
}

function periodWhere(bounds: PositionMetricPeriodBounds): Prisma.PositionMetricCellWhereInput {
  return bounds
    ? { matchDate: { gte: bounds.startDate, lte: bounds.endDate } }
    : {}
}

export async function loadPositionMetricMapSummary(input: {
  clanId: number
  bounds: PositionMetricPeriodBounds
  client?: PrismaClient
}) {
  const client = input.client ?? prisma
  const dateFilter = input.bounds
    ? Prisma.sql`AND matchDate >= ${input.bounds.startDate} AND matchDate <= ${input.bounds.endDate}`
    : Prisma.empty
  const mapRows = await client.$queryRaw<Array<{
    mapName: string
    matches: bigint | number
    positionPoints: bigint | number | null
    rotationPoints: bigint | number | null
    deathPoints: bigint | number | null
  }>>(Prisma.sql`
    SELECT
      mapName,
      COUNT(DISTINCT squadMatchId) AS matches,
      SUM(CASE WHEN metric = 'position' THEN eventCount ELSE 0 END) AS positionPoints,
      SUM(CASE WHEN metric = 'rotation' THEN eventCount ELSE 0 END) AS rotationPoints,
      SUM(CASE WHEN metric = 'death' THEN eventCount ELSE 0 END) AS deathPoints
    FROM PositionMetricCell
    WHERE clanId = ${input.clanId}
      ${dateFilter}
    GROUP BY mapName
    ORDER BY matches DESC, mapName ASC
  `)
  const maps: PositionMetricMapSummary[] = mapRows.map((row) => ({
    mapName: row.mapName,
    matches: Number(row.matches),
    positionPoints: Number(row.positionPoints ?? 0),
    rotationPoints: Number(row.rotationPoints ?? 0),
    deathPoints: Number(row.deathPoints ?? 0),
  }))

  return { maps }
}

export async function loadPositionMetricMemberPhaseBreakdown(input: {
  clanId: number
  bounds: PositionMetricPeriodBounds
  selectedMap: string
  client?: PrismaClient
}) {
  const client = input.client ?? prisma
  const baseWhere: Prisma.PositionMetricCellWhereInput = {
    clanId: input.clanId,
    mapName: input.selectedMap,
    ...periodWhere(input.bounds),
  }
  const [memberRows, phaseRows] = await Promise.all([
    client.positionMetricCell.groupBy({
      by: ['memberId'],
      where: { ...baseWhere, metric: { in: ['position', 'rotation'] } },
      _sum: { eventCount: true },
    }),
    client.positionMetricCell.findMany({
      where: { ...baseWhere, phase: { gt: 0 } },
      distinct: ['phase'],
      select: { phase: true },
      orderBy: { phase: 'asc' },
    }),
  ])

  return {
    members: memberRows.map((row) => ({
      memberId: row.memberId,
      points: row._sum.eventCount ?? 0,
    })),
    phases: phaseRows.map((row) => row.phase),
  }
}

export async function loadAggregatedPositionMetricCells(input: {
  clanId: number
  mapName: string
  bounds: PositionMetricPeriodBounds
  memberId?: number
  phases?: number[]
  client?: PrismaClient
}) {
  const client = input.client ?? prisma
  const rows = await client.positionMetricCell.groupBy({
    by: ['metric', 'xIndex', 'yIndex'],
    where: {
      clanId: input.clanId,
      mapName: input.mapName,
      memberId: input.memberId,
      phase: input.phases?.length ? { in: input.phases } : undefined,
      ...periodWhere(input.bounds),
    },
    _sum: { eventCount: true },
  })

  return rows.map((row) => ({
    metric: row.metric as PositionMetric,
    xIndex: row.xIndex,
    yIndex: row.yIndex,
    count: row._sum.eventCount ?? 0,
  }))
}
/**
 * Télémétrie brute d'une carte sur la période, avec les membres du clan de chaque escouade. `without_cells` : ce
 * que la route Positions doit relire (matchs sans `PositionMetricCell`) ; `with_cells` : pour comparer les deux
 * sources sur les mêmes matchs (`scripts/compare-position-metrics.ts`).
 */
export async function loadRawPositionTelemetryRows(input: {
  clanId: number
  mapName: string
  bounds: PositionMetricPeriodBounds
  coverage: 'without_cells' | 'with_cells'
  client?: PrismaClient
}): Promise<RawPositionTelemetryRow[]> {
  const client = input.client ?? prisma
  const dateFilter = input.bounds
    ? Prisma.sql`AND sm.createdAt >= ${input.bounds.startDate} AND sm.createdAt <= ${input.bounds.endDate}`
    : Prisma.empty
  const coverageFilter =
    input.coverage === 'without_cells'
      ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM PositionMetricCell pmc WHERE pmc.squadMatchId = sm.id)`
      : Prisma.sql`AND EXISTS (SELECT 1 FROM PositionMetricCell pmc WHERE pmc.squadMatchId = sm.id)`

  // Deux étapes : sélectionner les matchs sans lire le JSON, puis lire le JSON des seuls matchs retenus. En une
  // requête, MariaDB part de tous les matchs du clan (toutes dates), lit leurs colonnes JSON et ne filtre carte et
  // période qu'ensuite — mesuré le 2026-09-16 : 9 s contre 3,4 à 4,7 s pour 151 matchs (clan 1, Erangel, septembre).
  const matchIds = await client.$queryRaw<Array<{ squadMatchId: string }>>(Prisma.sql`
    SELECT sm.id AS squadMatchId
    FROM SquadMatch sm
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success'
      ${dateFilter}
      AND sm.mapName = ${input.mapName}
      AND EXISTS (
        SELECT 1
        FROM SquadMember sdm
        INNER JOIN ClanMember cm ON cm.id = sdm.memberId
        WHERE sdm.squadMatchId = sm.id
          AND cm.clanId = ${input.clanId}
      )
      ${coverageFilter}
  `)
  if (matchIds.length === 0) return []

  const rows = await client.$queryRaw<
    Array<RawPositionTelemetryRow & { squadMatchId: string } & Record<string, unknown>>
  >(Prisma.sql`
    SELECT
      t.squadMatchId,
      t.positionSamples,
      t.positionSamplesGz,
      t.deathSamples,
      t.deathSamplesGz,
      t.killSamples,
      t.killSamplesGz,
      t.shotSamples,
      t.shotSamplesGz,
      t.damageSamples,
      t.damageSamplesGz,
      t.knockoutSamples,
      t.knockoutSamplesGz,
      t.reviveSamples,
      t.reviveSamplesGz,
      t.vehicleSamples,
      t.vehicleSamplesGz
    FROM SquadMatchTelemetry t
    WHERE t.squadMatchId IN (${Prisma.join(matchIds.map((row) => row.squadMatchId))})
  `)
  if (rows.length === 0) return []

  const squadMembers = await client.squadMember.findMany({
    where: { squadMatchId: { in: rows.map((row) => row.squadMatchId) }, member: { clanId: input.clanId } },
    select: { squadMatchId: true, member: { select: { pubgAccountId: true, pubgPlayerName: true } } },
  })
  const keysByMatch = new Map<string, Set<string>>()
  for (const entry of squadMembers) {
    const keys = keysByMatch.get(entry.squadMatchId) ?? new Set<string>()
    if (entry.member.pubgAccountId) keys.add(entry.member.pubgAccountId.toLowerCase())
    if (entry.member.pubgPlayerName) keys.add(entry.member.pubgPlayerName.toLowerCase())
    keysByMatch.set(entry.squadMatchId, keys)
  }

  // Les deux formats coexistent le temps du rattrapage : une seule normalisation par ligne.
  return rows.map((row) => {
    const { squadMatchId, ...reste } = decodeTelemetryRow(row)
    return {
      ...reste,
      squadMemberKeys: keysByMatch.get(squadMatchId) ?? new Set<string>(),
    }
  })
}
