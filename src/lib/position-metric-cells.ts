import { Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { ParsedTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import { toMapPercent } from '@/lib/pubg-telemetry/position-heatmap'

export const POSITION_METRIC_GRID_SIZE = 40

export type PositionMetric =
  | 'position'
  | 'rotation'
  | 'kill'
  | 'shot'
  | 'damage_dealt'
  | 'damage_taken'
  | 'knockout_dealt'
  | 'knockout_taken'
  | 'revive_given'
  | 'revive_received'
  | 'vehicle'
  | 'death'

export type PositionMetricMatch = {
  id: string
  mapName: string
  createdAt: Date
  members: Array<{
    memberId: number
    member: {
      clanId: number | null
      pubgAccountId: string | null
      pubgPlayerName: string
    }
  }>
}

export type PositionMetricCellRow = {
  squadMatchId: string
  clanId: number
  memberId: number
  mapName: string
  phase: number
  metric: PositionMetric
  xIndex: number
  yIndex: number
  eventCount: number
  matchDate: Date
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}

function gridCell(mapName: string, x: number, y: number) {
  const percent = toMapPercent(mapName, x, y)
  return {
    xIndex: Math.min(POSITION_METRIC_GRID_SIZE - 1, Math.floor((percent.x / 100) * POSITION_METRIC_GRID_SIZE)),
    yIndex: Math.min(POSITION_METRIC_GRID_SIZE - 1, Math.floor((percent.y / 100) * POSITION_METRIC_GRID_SIZE)),
  }
}

export function buildPositionMetricCellRows(
  match: PositionMetricMatch,
  snapshot: ParsedTelemetrySnapshot
): PositionMetricCellRow[] {
  const memberByKey = new Map<string, { memberId: number; clanId: number }>()
  for (const squadMember of match.members) {
    const clanId = squadMember.member.clanId
    if (!clanId) continue
    const member = { memberId: squadMember.memberId, clanId }
    const accountId = normalizeKey(squadMember.member.pubgAccountId)
    const playerName = normalizeKey(squadMember.member.pubgPlayerName)
    if (accountId) memberByKey.set(accountId, member)
    if (playerName) memberByKey.set(playerName, member)
  }

  const rows = new Map<string, PositionMetricCellRow>()
  function add(input: {
    memberKey: string
    phase: number
    metric: PositionMetric
    x: number
    y: number
    eventCount?: number
  }) {
    const member = memberByKey.get(normalizeKey(input.memberKey) ?? '')
    if (!member || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return
    const eventCount = Math.max(1, Math.round(input.eventCount ?? 1))
    const phase = Number.isFinite(input.phase) ? Math.max(0, Math.trunc(input.phase)) : 0
    const cell = gridCell(match.mapName, input.x, input.y)
    const key = `${member.memberId}:${phase}:${input.metric}:${cell.xIndex}:${cell.yIndex}`
    const existing = rows.get(key)
    if (existing) {
      existing.eventCount += eventCount
      return
    }
    rows.set(key, {
      squadMatchId: match.id,
      clanId: member.clanId,
      memberId: member.memberId,
      mapName: match.mapName,
      phase,
      metric: input.metric,
      ...cell,
      eventCount,
      matchDate: match.createdAt,
    })
  }

  for (const sample of snapshot.positionSamples) add({ ...sample, metric: 'position' })
  for (const segment of snapshot.trajectorySegments) {
    add({
      memberKey: segment.memberKey,
      phase: segment.phase,
      metric: 'rotation',
      x: (segment.fromX + segment.toX) / 2,
      y: (segment.fromY + segment.toY) / 2,
    })
  }
  for (const sample of snapshot.deathSamples) add({ ...sample, metric: 'death' })
  for (const sample of snapshot.killSamples) add({ ...sample, metric: 'kill' })
  for (const sample of snapshot.shotSamples) add({ ...sample, metric: 'shot', eventCount: sample.count })
  for (const sample of snapshot.damageSamples) {
    add({
      ...sample,
      metric: sample.role === 'attacker' ? 'damage_dealt' : 'damage_taken',
      eventCount: sample.count,
    })
  }
  for (const sample of snapshot.knockoutSamples) {
    add({ ...sample, metric: sample.role === 'knocker' ? 'knockout_dealt' : 'knockout_taken' })
  }
  for (const sample of snapshot.reviveSamples) {
    add({ ...sample, metric: sample.role === 'reviver' ? 'revive_given' : 'revive_received' })
  }
  for (const sample of snapshot.vehicleSamples) add({ ...sample, metric: 'vehicle' })

  return Array.from(rows.values()).sort((left, right) =>
    left.memberId - right.memberId ||
    left.metric.localeCompare(right.metric) ||
    left.phase - right.phase ||
    left.yIndex - right.yIndex ||
    left.xIndex - right.xIndex
  )
}

export async function persistPositionMetricCellsForMatch(
  squadMatchId: string,
  snapshot: ParsedTelemetrySnapshot,
  client: PrismaClient = prisma
) {
  const match = await client.squadMatch.findUnique({
    where: { id: squadMatchId },
    select: {
      id: true,
      mapName: true,
      createdAt: true,
      members: {
        select: {
          memberId: true,
          member: {
            select: {
              clanId: true,
              pubgAccountId: true,
              pubgPlayerName: true,
            },
          },
        },
      },
    },
  })
  if (!match) return 0

  const rows = buildPositionMetricCellRows(match, snapshot)
  await client.$transaction(async (transaction) => {
    await transaction.positionMetricCell.deleteMany({ where: { squadMatchId } })
    if (rows.length > 0) {
      await transaction.positionMetricCell.createMany({ data: rows })
    }
  })

  return rows.length
}

function storedArray(value: unknown) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

type StoredPositionSnapshot = Pick<
  ParsedTelemetrySnapshot,
  | 'positionSamples'
  | 'trajectorySegments'
  | 'deathSamples'
  | 'killSamples'
  | 'shotSamples'
  | 'damageSamples'
  | 'knockoutSamples'
  | 'reviveSamples'
  | 'vehicleSamples'
>

export function parseStoredPositionSnapshot(row: Record<keyof StoredPositionSnapshot, unknown>) {
  return {
    summary: {
      totalEvents: 0,
      killEvents: 0,
      reviveEvents: 0,
      damageEvents: 0,
      knockoutEvents: 0,
      itemUseEvents: 0,
      vehicleEvents: 0,
      positionEvents: 0,
      phaseChangeEvents: 0,
      blueZoneEvents: 0,
      distinctEventTypes: 0,
    },
    weaponStats: [],
    memberStats: [],
    landingSamples: [],
    phaseSnapshots: [],
    killFeedSamples: [],
    throwableSamples: [],
    positionSamples: storedArray(row.positionSamples),
    trajectorySegments: storedArray(row.trajectorySegments),
    deathSamples: storedArray(row.deathSamples),
    killSamples: storedArray(row.killSamples),
    shotSamples: storedArray(row.shotSamples),
    damageSamples: storedArray(row.damageSamples),
    knockoutSamples: storedArray(row.knockoutSamples),
    reviveSamples: storedArray(row.reviveSamples),
    vehicleSamples: storedArray(row.vehicleSamples),
  } as ParsedTelemetrySnapshot
}

export async function backfillPositionMetricCells(input: {
  clanId?: number
  limit?: number
  client?: PrismaClient
} = {}) {
  const client = input.client ?? prisma
  const limit = Math.max(1, Math.min(input.limit ?? 10_000, 100_000))
  const clanFilter = input.clanId
    ? Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM SquadMember sdm
          INNER JOIN ClanMember cm ON cm.id = sdm.memberId
          WHERE sdm.squadMatchId = t.squadMatchId
            AND cm.clanId = ${input.clanId}
        )
      `
    : Prisma.empty

  const snapshotIds = await client.$queryRaw<Array<{ squadMatchId: string }>>(Prisma.sql`
    SELECT t.squadMatchId
    FROM SquadMatchTelemetry t
    INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
    WHERE t.status = 'success'
      AND (
        t.positionSamples IS NOT NULL OR
        t.killSamples IS NOT NULL OR
        t.damageSamples IS NOT NULL
      )
      ${clanFilter}
    ORDER BY sm.createdAt ASC
    LIMIT ${limit}
  `)

  let rowsWritten = 0
  let matchesProcessed = 0
  for (const { squadMatchId } of snapshotIds) {
    const snapshot = await client.squadMatchTelemetry.findUnique({
      where: { squadMatchId },
      select: {
        positionSamples: true,
        trajectorySegments: true,
        deathSamples: true,
        killSamples: true,
        shotSamples: true,
        damageSamples: true,
        knockoutSamples: true,
        reviveSamples: true,
        vehicleSamples: true,
      },
    })
    if (!snapshot) continue
    rowsWritten += await persistPositionMetricCellsForMatch(
      squadMatchId,
      parseStoredPositionSnapshot(snapshot),
      client
    )
    matchesProcessed += 1
  }

  const totalRows = await client.positionMetricCell.count({
    where: input.clanId ? { clanId: input.clanId } : undefined,
  })

  return { matchesProcessed, rowsWritten, totalRows }
}