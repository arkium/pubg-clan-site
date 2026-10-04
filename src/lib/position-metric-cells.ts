import { Prisma, type PrismaClient } from '@prisma/client'

import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import { prisma } from '@/lib/prisma'
import type { ParsedTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import { toMapPercent } from '@/lib/pubg-telemetry/position-heatmap'
import { vehicleTripFlags } from '@/lib/vehicle-trips'

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
  /** Véhicule pris / laissé : un par véhicule, pas par passager (`vehicleTripFlags`). Avant le 2026-10-04 : `vehicle`. */
  | 'vehicle_ride'
  | 'vehicle_leave'
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

/** Membres du clan de l'escouade, par compte et par pseudo (minuscules). */
function clanMemberByKey(match: PositionMetricMatch) {
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
  return memberByKey
}

export function buildPositionMetricCellRows(
  match: PositionMetricMatch,
  snapshot: ParsedTelemetrySnapshot
): PositionMetricCellRow[] {
  const memberByKey = clanMemberByKey(match)

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
  const vehicleCounted = vehicleTripFlags(snapshot.vehicleSamples, (memberKey) => {
    const member = memberByKey.get(normalizeKey(memberKey) ?? '')
    return member ? String(member.memberId) : null
  })
  snapshot.vehicleSamples.forEach((sample, index) => {
    if (vehicleCounted[index]) add({ ...sample, metric: sample.action === 'ride' ? 'vehicle_ride' : 'vehicle_leave' })
  })

  return Array.from(rows.values()).sort((left, right) =>
    left.memberId - right.memberId ||
    left.metric.localeCompare(right.metric) ||
    left.phase - right.phase ||
    left.yIndex - right.yIndex ||
    left.xIndex - right.xIndex
  )
}

const POSITION_METRIC_MATCH_SELECT = {
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
} satisfies Prisma.SquadMatchSelect

export async function persistPositionMetricCellsForMatch(
  squadMatchId: string,
  snapshot: ParsedTelemetrySnapshot,
  client: PrismaClient = prisma
) {
  const match = await client.squadMatch.findUnique({
    where: { id: squadMatchId },
    select: POSITION_METRIC_MATCH_SELECT,
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

/**
 * Ligne telle qu'elle sort de la base : aux colonnes historiques s'ajoutent les colonnes
 * compressees, absentes du type en memoire `ParsedTelemetrySnapshot` (voir geo-codec).
 */
type StoredPositionRow = Record<keyof StoredPositionSnapshot, unknown> &
  Partial<Record<`${keyof StoredPositionSnapshot}Gz`, unknown>>

export function parseStoredPositionSnapshot(row: StoredPositionRow) {
  // Les deux formats de stockage coexistent le temps du rattrapage : une seule normalisation.
  const normalisee = decodeTelemetryRow({ ...row })
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
    itemUseSamples: [],
    positionSamples: storedArray(normalisee.positionSamples),
    trajectorySegments: storedArray(normalisee.trajectorySegments),
    deathSamples: storedArray(normalisee.deathSamples),
    killSamples: storedArray(normalisee.killSamples),
    shotSamples: storedArray(normalisee.shotSamples),
    damageSamples: storedArray(normalisee.damageSamples),
    knockoutSamples: storedArray(normalisee.knockoutSamples),
    reviveSamples: storedArray(normalisee.reviveSamples),
    vehicleSamples: storedArray(normalisee.vehicleSamples),
  } as ParsedTelemetrySnapshot
}

export async function backfillPositionMetricCells(input: {
  clanId?: number
  limit?: number
  /** Ne traite que les matchs sans aucune cellule (rattrapage des synchronisations qui ne les écrivaient pas). */
  missingOnly?: boolean
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
        t.positionSamplesGz IS NOT NULL OR
        t.killSamples IS NOT NULL OR
        t.killSamplesGz IS NOT NULL OR
        t.damageSamples IS NOT NULL OR
        t.damageSamplesGz IS NOT NULL
      )
      ${clanFilter}
      ${input.missingOnly
        ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM PositionMetricCell c WHERE c.squadMatchId = t.squadMatchId)`
        : Prisma.empty}
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
        positionSamplesGz: true,
        trajectorySegments: true,
        trajectorySegmentsGz: true,
        deathSamples: true,
        deathSamplesGz: true,
        killSamples: true,
        killSamplesGz: true,
        shotSamples: true,
        shotSamplesGz: true,
        damageSamples: true,
        damageSamplesGz: true,
        knockoutSamples: true,
        knockoutSamplesGz: true,
        reviveSamples: true,
        reviveSamplesGz: true,
        vehicleSamples: true,
        vehicleSamplesGz: true,
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

export type LegacyVehicleConversionPage = {
  matches: number
  /** Cellules et événements `vehicle` (une montée ou descente par passager, avion compris) remplacés. */
  legacyCells: number
  legacyEvents: number
  /** Véhicules pris et laissés écrits à la place. */
  rides: number
  leaves: number
  cellsWritten: number
  lastSquadMatchId: string | null
}

/**
 * Convertit les cellules `vehicle` d'avant le 2026-10-04 (une montée ou une descente **par passager**, avion compris)
 * en `vehicle_ride` / `vehicle_leave` (une montée et une descente **par véhicule**, engins volants exclus), relues dans
 * `vehicleSamples` avec la déduction de `vehicleTripFlags` — l'historique ne sait pas qui était à bord avec qui.
 * Pages de matchs triées par identifiant (reprise par `after`). **Simulation par défaut** ; avec `write`, une
 * transaction par page remplace les cellules `vehicle` de la page.
 *
 * Seuls les membres qui avaient des cellules `vehicle` en reçoivent, **avec le clan de ces cellules** : un recalcul
 * depuis les membres actuels donnerait des véhicules aux membres rattachés au match après coup (sans positions ni
 * kills pour ce match) et déplacerait ceux qui ont changé de clan. Ils servent en revanche à la déduction (ils étaient
 * bien à bord). Idempotent : une fois convertis, les matchs n'ont plus de cellule `vehicle`.
 */
export async function convertLegacyVehiclePositionCells(input: {
  clanId?: number
  limit?: number
  pageSize?: number
  after?: string
  write?: boolean
  client?: PrismaClient
  onPage?: (page: LegacyVehicleConversionPage) => void
} = {}) {
  const client = input.client ?? prisma
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 200, 1_000))
  const limit = Math.max(1, input.limit ?? Number.MAX_SAFE_INTEGER)

  const total: LegacyVehicleConversionPage = {
    matches: 0,
    legacyCells: 0,
    legacyEvents: 0,
    rides: 0,
    leaves: 0,
    cellsWritten: 0,
    lastSquadMatchId: input.after ?? null,
  }

  while (total.matches < limit) {
    const after = total.lastSquadMatchId
    const ids = (await client.$queryRaw<Array<{ squadMatchId: string }>>(Prisma.sql`
      SELECT DISTINCT c.squadMatchId
      FROM PositionMetricCell c
      WHERE c.metric = 'vehicle'
        ${after ? Prisma.sql`AND c.squadMatchId > ${after}` : Prisma.empty}
        ${input.clanId ? Prisma.sql`AND c.clanId = ${input.clanId}` : Prisma.empty}
      ORDER BY c.squadMatchId ASC
      LIMIT ${Math.min(pageSize, limit - total.matches)}
    `)).map((row) => row.squadMatchId)
    if (ids.length === 0) break

    const [snapshots, matches, legacy] = await Promise.all([
      client.squadMatchTelemetry.findMany({
        where: { squadMatchId: { in: ids } },
        select: { squadMatchId: true, vehicleSamples: true, vehicleSamplesGz: true },
      }),
      client.squadMatch.findMany({ where: { id: { in: ids } }, select: POSITION_METRIC_MATCH_SELECT }),
      client.positionMetricCell.findMany({
        where: { squadMatchId: { in: ids }, metric: 'vehicle' },
        select: { squadMatchId: true, memberId: true, clanId: true, eventCount: true },
      }),
    ])

    // Membre → clan des cellules d'origine, par match.
    const legacyClan = new Map<string, number>()
    for (const cell of legacy) legacyClan.set(`${cell.squadMatchId}:${cell.memberId}`, cell.clanId)

    const rows: PositionMetricCellRow[] = []
    const matchById = new Map(matches.map((match) => [match.id, match]))
    for (const stored of snapshots) {
      const match = matchById.get(stored.squadMatchId)
      if (!match) continue
      const snapshot = parseStoredPositionSnapshot({
        positionSamples: null,
        trajectorySegments: null,
        deathSamples: null,
        killSamples: null,
        shotSamples: null,
        damageSamples: null,
        knockoutSamples: null,
        reviveSamples: null,
        vehicleSamples: stored.vehicleSamples,
        vehicleSamplesGz: stored.vehicleSamplesGz,
      })
      for (const row of buildPositionMetricCellRows(match, snapshot)) {
        const clanId = legacyClan.get(`${row.squadMatchId}:${row.memberId}`)
        if (clanId !== undefined) rows.push({ ...row, clanId })
      }
    }

    const page: LegacyVehicleConversionPage = {
      matches: ids.length,
      legacyCells: legacy.length,
      legacyEvents: legacy.reduce((sum, cell) => sum + cell.eventCount, 0),
      rides: rows.filter((row) => row.metric === 'vehicle_ride').reduce((sum, row) => sum + row.eventCount, 0),
      leaves: rows.filter((row) => row.metric === 'vehicle_leave').reduce((sum, row) => sum + row.eventCount, 0),
      cellsWritten: rows.length,
      lastSquadMatchId: ids[ids.length - 1],
    }

    if (input.write) {
      await client.$transaction([
        client.positionMetricCell.deleteMany({ where: { squadMatchId: { in: ids }, metric: { in: ['vehicle', 'vehicle_ride', 'vehicle_leave'] } } }),
        client.positionMetricCell.createMany({ data: rows }),
      ])
    }

    total.matches += page.matches
    total.legacyCells += page.legacyCells
    total.legacyEvents += page.legacyEvents
    total.rides += page.rides
    total.leaves += page.leaves
    total.cellsWritten += page.cellsWritten
    total.lastSquadMatchId = page.lastSquadMatchId
    input.onPage?.(page)
  }

  return total
}
