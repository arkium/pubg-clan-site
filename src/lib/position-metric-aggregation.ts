import { Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { PositionMetric } from '@/lib/position-metric-cells'

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

export async function loadPositionMetricCatalog(input: {
  clanId: number
  bounds: PositionMetricPeriodBounds
  selectedMap?: string | null
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

  if (!input.selectedMap || maps.length === 0) {
    return { maps, members: [], phases: [] }
  }

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
    maps,
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