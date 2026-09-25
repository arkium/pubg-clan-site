/**
 * Zones sûres par phase (`SafeZonePhaseStat`) : le « cercle moyen » de la page Positions sans relire les
 * `phaseSnapshots` JSON de chaque match. Une ligne par match et par phase entière, sommes en pourcentage de la carte.
 *
 * Même calcul que la lecture JSON historique de la route (`toMapPercent`, rayon / largeur de carte) : la moyenne
 * obtenue en additionnant les lignes est identique à celle calculée snapshot par snapshot.
 */
import { Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { getMapBounds, toMapPercent } from '@/lib/pubg-telemetry/position-heatmap'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'

export type SafeZonePhaseStatRow = {
  squadMatchId: string
  mapName: string
  matchDate: Date
  phase: number
  snapshotCount: number
  sumXPercent: number
  sumYPercent: number
  sumRadiusPercent: number
}

export type SafeZoneTotals = {
  snapshotCount: number
  sumXPercent: number
  sumYPercent: number
  sumRadiusPercent: number
}

function asRows(value: unknown): Record<string, unknown>[] {
  let rows = value
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows)
    } catch {
      return []
    }
  }
  return Array.isArray(rows)
    ? rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    : []
}

const toNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function buildSafeZonePhaseStatRows(
  match: { id: string; mapName: string; createdAt: Date },
  phaseSnapshots: unknown
): SafeZonePhaseStatRow[] {
  const bounds = getMapBounds(match.mapName)
  const byPhase = new Map<number, SafeZonePhaseStatRow>()

  for (const snapshot of asRows(phaseSnapshots)) {
    const isGame = toNumber(snapshot.isGame)
    const x = toNumber(snapshot.safetyZoneX)
    const y = toNumber(snapshot.safetyZoneY)
    const radius = toNumber(snapshot.safetyZoneRadiusMeters)
    if (isGame === null || x === null || y === null || radius === null || radius <= 0) continue
    const phase = Math.trunc(isGame)
    if (phase < 1) continue

    const percent = toMapPercent(match.mapName, x, y)
    const row =
      byPhase.get(phase) ??
      {
        squadMatchId: match.id,
        mapName: match.mapName,
        matchDate: match.createdAt,
        phase,
        snapshotCount: 0,
        sumXPercent: 0,
        sumYPercent: 0,
        sumRadiusPercent: 0,
      }
    row.snapshotCount += 1
    row.sumXPercent += percent.x
    row.sumYPercent += percent.y
    row.sumRadiusPercent += (radius / bounds.width) * 100
    byPhase.set(phase, row)
  }

  const rows = Array.from(byPhase.values()).sort((left, right) => left.phase - right.phase)
  if (rows.length > 0) return rows

  // Marqueur « match traité, aucune zone exploitable » : la phase 0 n'appartient à aucune plage tactique.
  return [{
    squadMatchId: match.id,
    mapName: match.mapName,
    matchDate: match.createdAt,
    phase: 0,
    snapshotCount: 0,
    sumXPercent: 0,
    sumYPercent: 0,
    sumRadiusPercent: 0,
  }]
}

/** Additionne les lignes des phases demandées (toutes si la liste est vide). */
export function sumSafeZoneRows(rows: SafeZonePhaseStatRow[], phases: number[]): SafeZoneTotals {
  const totals: SafeZoneTotals = { snapshotCount: 0, sumXPercent: 0, sumYPercent: 0, sumRadiusPercent: 0 }
  for (const row of rows) {
    if (phases.length > 0 && !phases.includes(row.phase)) continue
    totals.snapshotCount += row.snapshotCount
    totals.sumXPercent += row.sumXPercent
    totals.sumYPercent += row.sumYPercent
    totals.sumRadiusPercent += row.sumRadiusPercent
  }
  return totals
}

export function safeZoneOverlayFromTotals(...parts: SafeZoneTotals[]) {
  const total = parts.reduce(
    (sum, part) => ({
      snapshotCount: sum.snapshotCount + part.snapshotCount,
      sumXPercent: sum.sumXPercent + part.sumXPercent,
      sumYPercent: sum.sumYPercent + part.sumYPercent,
      sumRadiusPercent: sum.sumRadiusPercent + part.sumRadiusPercent,
    }),
    { snapshotCount: 0, sumXPercent: 0, sumYPercent: 0, sumRadiusPercent: 0 }
  )
  if (total.snapshotCount === 0) return null
  return {
    x: total.sumXPercent / total.snapshotCount,
    y: total.sumYPercent / total.snapshotCount,
    r: total.sumRadiusPercent / total.snapshotCount,
  }
}

export async function persistSafeZonePhaseStatsForMatch(
  squadMatchId: string,
  phaseSnapshots: unknown,
  client: PrismaClient = prisma
) {
  const match = await client.squadMatch.findUnique({
    where: { id: squadMatchId },
    select: { id: true, mapName: true, createdAt: true },
  })
  if (!match) return 0

  const rows = buildSafeZonePhaseStatRows(match, phaseSnapshots)
  await client.$transaction(async (transaction) => {
    await transaction.safeZonePhaseStat.deleteMany({ where: { squadMatchId } })
    await transaction.safeZonePhaseStat.createMany({ data: rows })
  })
  return rows.length
}

type PeriodBounds = { startDate: Date; endDate: Date } | null

function clanMatchFilter(clanId: number) {
  return Prisma.sql`
    AND EXISTS (
      SELECT 1
      FROM SquadMember sdm
      INNER JOIN ClanMember cm ON cm.id = sdm.memberId
      WHERE sdm.squadMatchId = sm.id
        AND cm.clanId = ${clanId}
    )`
}

/** Sommes persistées pour les matchs du clan sur la carte et la période, phases demandées. */
export async function loadPersistedSafeZoneTotals(input: {
  clanId: number
  mapName: string
  bounds: PeriodBounds
  phases: number[]
  client?: PrismaClient
}): Promise<SafeZoneTotals> {
  const client = input.client ?? prisma
  const dateFilter = input.bounds
    ? Prisma.sql`AND s.matchDate >= ${input.bounds.startDate} AND s.matchDate <= ${input.bounds.endDate}`
    : Prisma.empty
  const phaseFilter = input.phases.length > 0 ? Prisma.sql`AND s.phase IN (${Prisma.join(input.phases)})` : Prisma.empty
  const [row] = await client.$queryRaw<Array<{
    snapshotCount: bigint | number | null
    sumXPercent: number | null
    sumYPercent: number | null
    sumRadiusPercent: number | null
  }>>(Prisma.sql`
    SELECT
      SUM(s.snapshotCount) AS snapshotCount,
      SUM(s.sumXPercent) AS sumXPercent,
      SUM(s.sumYPercent) AS sumYPercent,
      SUM(s.sumRadiusPercent) AS sumRadiusPercent
    FROM SafeZonePhaseStat s
    INNER JOIN SquadMatch sm ON sm.id = s.squadMatchId
    WHERE s.mapName = ${input.mapName}
      ${dateFilter}
      ${phaseFilter}
      ${clanMatchFilter(input.clanId)}
  `)
  return {
    snapshotCount: Number(row?.snapshotCount ?? 0),
    sumXPercent: Number(row?.sumXPercent ?? 0),
    sumYPercent: Number(row?.sumYPercent ?? 0),
    sumRadiusPercent: Number(row?.sumRadiusPercent ?? 0),
  }
}

/**
 * Matchs du clan sur la carte et la période qui n'ont pas encore de `SafeZonePhaseStat` : leurs zones sont relues
 * depuis le JSON, en deux étapes (identifiants sans JSON, puis JSON des seuls matchs retenus).
 */
export async function loadUnpersistedSafeZoneRows(input: {
  clanId: number
  mapName: string
  bounds: PeriodBounds
  client?: PrismaClient
}): Promise<SafeZonePhaseStatRow[]> {
  const client = input.client ?? prisma
  const dateFilter = input.bounds
    ? Prisma.sql`AND sm.createdAt >= ${input.bounds.startDate} AND sm.createdAt <= ${input.bounds.endDate}`
    : Prisma.empty
  const matches = await client.$queryRaw<Array<{ id: string; mapName: string; createdAt: Date }>>(Prisma.sql`
    SELECT sm.id, sm.mapName, sm.createdAt
    FROM SquadMatch sm
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success'
      AND sm.mapName = ${input.mapName}
      ${dateFilter}
      ${clanMatchFilter(input.clanId)}
      AND NOT EXISTS (SELECT 1 FROM SafeZonePhaseStat s WHERE s.squadMatchId = sm.id)
  `)
  if (matches.length === 0) return []

  const snapshots = await client.$queryRaw<
    Array<{ squadMatchId: string; phaseSnapshots: unknown; phaseSnapshotsGz: unknown }>
  >(Prisma.sql`
    SELECT t.squadMatchId, t.phaseSnapshots, t.phaseSnapshotsGz
    FROM SquadMatchTelemetry t
    WHERE t.squadMatchId IN (${Prisma.join(matches.map((match) => match.id))})
  `)
  // Les deux formats coexistent le temps du rattrapage.
  const snapshotsByMatch = new Map(
    snapshots.map((row) => [row.squadMatchId, decodeTelemetryRow(row).phaseSnapshots])
  )
  return matches.flatMap((match) => buildSafeZonePhaseStatRows(match, snapshotsByMatch.get(match.id)))
}

/** Rattrapage : matchs `success` sans ligne `SafeZonePhaseStat`, par lots, du plus ancien au plus récent. */
export async function backfillSafeZonePhaseStats(input: {
  clanId?: number
  limit?: number
  batchSize?: number
  client?: PrismaClient
  onProgress?: (processed: number, total: number) => void
} = {}) {
  const client = input.client ?? prisma
  const limit = Math.max(1, Math.min(input.limit ?? 100_000, 100_000))
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 100, 500))
  const clanFilter = input.clanId ? clanMatchFilter(input.clanId) : Prisma.empty

  const pending = await client.$queryRaw<Array<{ id: string; mapName: string; createdAt: Date }>>(Prisma.sql`
    SELECT sm.id, sm.mapName, sm.createdAt
    FROM SquadMatch sm
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success'
      ${clanFilter}
      AND NOT EXISTS (SELECT 1 FROM SafeZonePhaseStat s WHERE s.squadMatchId = sm.id)
    ORDER BY sm.createdAt ASC
    LIMIT ${limit}
  `)

  let rowsWritten = 0
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize)
    const snapshots = await client.$queryRaw<
      Array<{ squadMatchId: string; phaseSnapshots: unknown; phaseSnapshotsGz: unknown }>
    >(Prisma.sql`
      SELECT t.squadMatchId, t.phaseSnapshotsGz, t.phaseSnapshots
      FROM SquadMatchTelemetry t
      WHERE t.squadMatchId IN (${Prisma.join(batch.map((match) => match.id))})
    `)
    const snapshotsByMatch = new Map(
      snapshots.map((row) => [row.squadMatchId, decodeTelemetryRow(row).phaseSnapshots])
    )
    const rows = batch.flatMap((match) => buildSafeZonePhaseStatRows(match, snapshotsByMatch.get(match.id)))
    // `skipDuplicates` : une synchronisation concurrente a pu écrire le même match entre-temps.
    const result = await client.safeZonePhaseStat.createMany({ data: rows, skipDuplicates: true })
    rowsWritten += result.count
    input.onProgress?.(Math.min(offset + batch.length, pending.length), pending.length)
  }

  return { matchesProcessed: pending.length, rowsWritten }
}
