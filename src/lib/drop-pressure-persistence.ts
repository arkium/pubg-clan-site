import { Prisma, type PrismaClient } from '@prisma/client'

import {
  countNearbyPlayersBreakdown,
  dropPressureLevel,
  type DropPressureSample,
} from '@/lib/drop-zone-pressure'
import { prisma } from '@/lib/prisma'

type LandingSample = DropPressureSample

type DropPressureMatch = {
  id: string
  mapName: string
  createdAt: Date
  members: Array<{
    memberId: number
    member: {
      pubgAccountId: string | null
      pubgPlayerName: string
    }
  }>
}

export type DropPressureStatRow = {
  squadMatchId: string
  memberId: number
  mapName: string
  x: number
  y: number
  matchDate: Date
  nearbyPlayerCount250m: number
  nearbyOpponentCount250m: number | null
  pressureLevel: string
}

function normalizeKey(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

export function parseDropPressureLandingSamples(raw: unknown): LandingSample[] {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }

  if (!Array.isArray(value)) return []

  const samples = new Map<string, LandingSample>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const sample = item as Record<string, unknown>
    const memberKey = typeof sample.memberKey === 'string' ? normalizeKey(sample.memberKey) : null
    const x = typeof sample.x === 'number' && Number.isFinite(sample.x) ? sample.x : null
    const y = typeof sample.y === 'number' && Number.isFinite(sample.y) ? sample.y : null
    if (!memberKey || x === null || y === null || samples.has(memberKey)) continue

    samples.set(memberKey, {
      memberKey,
      teamId:
        typeof sample.teamId === 'number' && Number.isInteger(sample.teamId)
          ? sample.teamId
          : undefined,
      x,
      y,
    })
  }

  return Array.from(samples.values())
}

export function buildDropPressureStatRows(
  match: DropPressureMatch,
  rawLandingSamples: unknown
): DropPressureStatRow[] {
  const samples = parseDropPressureLandingSamples(rawLandingSamples)
  const sampleByKey = new Map(samples.map((sample) => [sample.memberKey, sample]))

  return match.members.flatMap((squadMember) => {
    const accountId = normalizeKey(squadMember.member.pubgAccountId)
    const playerName = normalizeKey(squadMember.member.pubgPlayerName)
    const sample = (accountId ? sampleByKey.get(accountId) : undefined) ??
      (playerName ? sampleByKey.get(playerName) : undefined)
    if (!sample) return []

    const pressure = countNearbyPlayersBreakdown(
      samples,
      sample.memberKey,
      sample.x,
      sample.y
    )

    return [{
      squadMatchId: match.id,
      memberId: squadMember.memberId,
      mapName: match.mapName,
      x: sample.x,
      y: sample.y,
      matchDate: match.createdAt,
      nearbyPlayerCount250m: pressure.nearbyPlayerCount,
      nearbyOpponentCount250m: pressure.nearbyOpponentCount,
      pressureLevel: dropPressureLevel(pressure.nearbyPlayerCount),
    }]
  })
}

export async function persistDropPressureStatsForMatch(
  squadMatchId: string,
  rawLandingSamples: unknown,
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
              pubgAccountId: true,
              pubgPlayerName: true,
            },
          },
        },
      },
    },
  })
  if (!match) return 0

  const rows = buildDropPressureStatRows(match, rawLandingSamples)
  await client.$transaction(async (transaction) => {
    await transaction.dropPressureStat.deleteMany({ where: { squadMatchId } })
    if (rows.length > 0) {
      await transaction.dropPressureStat.createMany({ data: rows })
    }
  })

  return rows.length
}

export async function backfillDropPressureStats(input: {
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

  const snapshots = await client.$queryRaw<Array<{
    squadMatchId: string
    landingSamples: unknown
  }>>(Prisma.sql`
    SELECT t.squadMatchId, t.landingSamples
    FROM SquadMatchTelemetry t
    INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
    WHERE t.status = 'success'
      AND t.landingSamples IS NOT NULL
      ${clanFilter}
    ORDER BY sm.createdAt ASC
    LIMIT ${limit}
  `)

  let rowsWritten = 0
  for (const snapshot of snapshots) {
    rowsWritten += await persistDropPressureStatsForMatch(
      snapshot.squadMatchId,
      snapshot.landingSamples,
      client
    )
  }

  const totalRows = await client.dropPressureStat.count({
    where: input.clanId ? { member: { clanId: input.clanId } } : undefined,
  })

  return { matchesProcessed: snapshots.length, rowsWritten, totalRows }
}