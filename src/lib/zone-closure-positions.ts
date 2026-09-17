/**
 * Densité des positions en fin de zone : où les membres encore en vie terminent leur rotation quand un
 * rétrécissement s'achève et que le nouveau cercle devient stable.
 *
 * **Fin de zone** : dans `phaseSnapshots`, `isGame` alterne `x` (cercle annoncé, zone bleue stable) et `x.5`
 * (zone bleue en train de se refermer). Au premier instantané où `isGame` redevient entier, la zone sûre vaut
 * exactement le cercle qui était annoncé — vérifié sur des matchs réels : à `isGame = 2`, `safetyZoneRadius` reprend
 * le `poisonGasWarningRadius` de `isGame = 1`. C'est donc l'instant de fermeture, et la zone sûre de cet instantané
 * est le nouveau cercle stable. La ligne est enregistrée sous le numéro de phase qui commence (2 à 9), ce qui la
 * range dans les mêmes plages tactiques que `PositionMetricCell`.
 *
 * **Une seule position par membre, par match et par fermeture** (contrainte unique en base) : le dernier échantillon
 * connu avant l'instant de fermeture, s'il n'est pas trop ancien. Un membre mort avant la fermeture ne produit
 * aucune ligne — d'où le biais de survie assumé : les phases tardives ne décrivent que les survivants.
 *
 * Les lignes sont persistées au parsing : elles survivent à la purge des positions brutes, contrairement à un calcul
 * à la volée sur `positionSamples`.
 */
import { Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { toMapPercent } from '@/lib/pubg-telemetry/position-heatmap'
import type { ParsedTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'

export const ZONE_CLOSURE_GRID_SIZE = 40

/** Au-delà, l'échantillon est trop vieux pour dire où était le joueur à la fermeture (échantillonnage ~10 s). */
export const MAX_POSITION_AGE_SECONDS = 180

/** Position relative au nouveau cercle stable. */
export type ZoneBand = 'center' | 'edge' | 'outside'

export type ZoneClosure = {
  /** Phase qui commence à la fermeture (2 à 9) : le cercle stable est celui de cette phase. */
  phase: number
  timestampSeconds: number
  centerX: number
  centerY: number
  radius: number
  survivorCount: number
}

export type ZoneClosurePositionRow = {
  squadMatchId: string
  clanId: number
  memberId: number
  mapName: string
  matchDate: Date
  phase: number
  xIndex: number
  yIndex: number
  xPercent: number
  yPercent: number
  distanceRatio: number
  zoneBand: ZoneBand
  survivorCount: number
}

type ZoneClosureMatch = {
  id: string
  mapName: string
  createdAt: Date
  members: Array<{
    memberId: number
    member: { clanId: number | null; pubgAccountId: string | null; pubgPlayerName: string | null }
  }>
}

type PositionSample = ParsedTelemetrySnapshot['positionSamples'][number]

function normalizeKey(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Fermetures de zone du match, de la plus ancienne à la plus récente. */
export function detectZoneClosures(phaseSnapshots: unknown): ZoneClosure[] {
  const snapshots = asArray<Record<string, unknown>>(phaseSnapshots)
    .filter((snapshot) => isNumber(snapshot.isGame) && isNumber(snapshot.timestampSeconds))
    .sort((left, right) => (left.timestampSeconds as number) - (right.timestampSeconds as number))

  const closures: ZoneClosure[] = []
  let previousIsGame: number | null = null

  for (const snapshot of snapshots) {
    const isGame = snapshot.isGame as number
    const wasShrinking = previousIsGame !== null && !Number.isInteger(previousIsGame)
    previousIsGame = isGame

    // Fermeture = passage d'un rétrécissement (x.5) à une phase entière. La phase 1 n'en est pas une : la zone
    // sûre y vaut encore toute la carte.
    if (!Number.isInteger(isGame) || isGame < 2 || !wasShrinking) continue

    const centerX = snapshot.safetyZoneX
    const centerY = snapshot.safetyZoneY
    const radius = snapshot.safetyZoneRadiusMeters
    if (!isNumber(centerX) || !isNumber(centerY) || !isNumber(radius) || radius <= 0) continue
    if (closures.some((closure) => closure.phase === isGame)) continue

    closures.push({
      phase: isGame,
      timestampSeconds: snapshot.timestampSeconds as number,
      centerX,
      centerY,
      radius,
      survivorCount: isNumber(snapshot.numAlivePlayers) ? snapshot.numAlivePlayers : 0,
    })
  }

  return closures
}

export function zoneBandForRatio(ratio: number): ZoneBand {
  if (ratio <= 0.5) return 'center'
  if (ratio <= 1) return 'edge'
  return 'outside'
}

/**
 * Phase de mort par joueur : `deathSamples.timestampSeconds` est un horodatage absolu, pas une durée de match —
 * on se fie donc à `phase`, comparable à celle des fermetures.
 */
function buildDeathPhaseByKey(deathSamples: PositionSample[]) {
  const deathPhase = new Map<string, number>()
  for (const sample of deathSamples) {
    const key = normalizeKey(sample.memberKey)
    if (!key || !isNumber(sample.phase)) continue
    const current = deathPhase.get(key)
    if (current === undefined || sample.phase < current) deathPhase.set(key, sample.phase)
  }
  return deathPhase
}

export function buildZoneClosurePositionRows(
  match: ZoneClosureMatch,
  snapshot: Pick<ParsedTelemetrySnapshot, 'positionSamples' | 'deathSamples' | 'phaseSnapshots'>
): ZoneClosurePositionRow[] {
  const closures = detectZoneClosures(snapshot.phaseSnapshots)
  if (closures.length === 0) return []

  const memberByKey = new Map<string, { memberId: number; clanId: number }>()
  for (const squadMember of match.members) {
    const clanId = squadMember.member.clanId
    if (!clanId) continue
    const entry = { memberId: squadMember.memberId, clanId }
    const accountId = normalizeKey(squadMember.member.pubgAccountId)
    const playerName = normalizeKey(squadMember.member.pubgPlayerName)
    if (accountId) memberByKey.set(accountId, entry)
    if (playerName) memberByKey.set(playerName, entry)
  }
  if (memberByKey.size === 0) return []

  const deathPhase = buildDeathPhaseByKey(asArray<PositionSample>(snapshot.deathSamples))

  // Échantillons des seuls membres suivis, triés dans le temps : un balayage suffit ensuite par fermeture.
  const samplesByMember = new Map<number, Array<{ timestampSeconds: number; x: number; y: number; key: string }>>()
  for (const sample of asArray<PositionSample>(snapshot.positionSamples)) {
    const key = normalizeKey(sample.memberKey)
    const member = key ? memberByKey.get(key) : undefined
    if (!key || !member || !isNumber(sample.x) || !isNumber(sample.y) || !isNumber(sample.timestampSeconds)) continue
    const list = samplesByMember.get(member.memberId) ?? []
    list.push({ timestampSeconds: sample.timestampSeconds, x: sample.x, y: sample.y, key })
    samplesByMember.set(member.memberId, list)
  }
  for (const list of samplesByMember.values()) {
    list.sort((left, right) => left.timestampSeconds - right.timestampSeconds)
  }

  const rows: ZoneClosurePositionRow[] = []

  for (const closure of closures) {
    for (const [memberId, samples] of samplesByMember) {
      let last: (typeof samples)[number] | null = null
      for (const sample of samples) {
        if (sample.timestampSeconds > closure.timestampSeconds) break
        last = sample
      }
      if (!last) continue
      if (closure.timestampSeconds - last.timestampSeconds > MAX_POSITION_AGE_SECONDS) continue

      // Mort avant la fermeture : aucune position d'arrivée à compter (biais de survie assumé).
      const died = deathPhase.get(last.key)
      if (died !== undefined && died < closure.phase) continue

      const percent = toMapPercent(match.mapName, last.x, last.y)
      const ratio = Math.hypot(last.x - closure.centerX, last.y - closure.centerY) / closure.radius
      const clanId = memberByKey.get(last.key)?.clanId
      if (!clanId) continue

      rows.push({
        squadMatchId: match.id,
        clanId,
        memberId,
        mapName: match.mapName,
        matchDate: match.createdAt,
        phase: closure.phase,
        xIndex: Math.min(ZONE_CLOSURE_GRID_SIZE - 1, Math.floor((percent.x / 100) * ZONE_CLOSURE_GRID_SIZE)),
        yIndex: Math.min(ZONE_CLOSURE_GRID_SIZE - 1, Math.floor((percent.y / 100) * ZONE_CLOSURE_GRID_SIZE)),
        xPercent: percent.x,
        yPercent: percent.y,
        distanceRatio: Number(ratio.toFixed(4)),
        zoneBand: zoneBandForRatio(ratio),
        survivorCount: closure.survivorCount,
      })
    }
  }

  return rows.sort((left, right) => left.phase - right.phase || left.memberId - right.memberId)
}

export async function persistZoneClosurePositionsForMatch(
  squadMatchId: string,
  snapshot: Pick<ParsedTelemetrySnapshot, 'positionSamples' | 'deathSamples' | 'phaseSnapshots'>,
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
          member: { select: { clanId: true, pubgAccountId: true, pubgPlayerName: true } },
        },
      },
    },
  })
  if (!match) return 0

  const rows = buildZoneClosurePositionRows(match, snapshot)
  await client.$transaction(async (transaction) => {
    await transaction.zoneClosurePosition.deleteMany({ where: { squadMatchId } })
    if (rows.length > 0) await transaction.zoneClosurePosition.createMany({ data: rows })
  })

  return rows.length
}

/** Rattrapage depuis les JSON encore présents : les matchs dont les positions ont été purgées sont ignorés. */
export async function backfillZoneClosurePositions(input: {
  clanId?: number
  limit?: number
  batchSize?: number
  client?: PrismaClient
  onProgress?: (processed: number, total: number) => void
} = {}) {
  const client = input.client ?? prisma
  const limit = Math.max(1, Math.min(input.limit ?? 100_000, 100_000))
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 50, 200))
  const clanFilter = input.clanId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM SquadMember sdm INNER JOIN ClanMember cm ON cm.id = sdm.memberId
        WHERE sdm.squadMatchId = sm.id AND cm.clanId = ${input.clanId})`
    : Prisma.empty

  const pending = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT sm.id
    FROM SquadMatch sm
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success'
      AND JSON_LENGTH(t.positionSamples) > 0
      AND JSON_LENGTH(t.phaseSnapshots) > 0
      ${clanFilter}
      AND NOT EXISTS (SELECT 1 FROM ZoneClosurePosition z WHERE z.squadMatchId = sm.id)
    ORDER BY sm.createdAt ASC
    LIMIT ${limit}
  `)

  let rowsWritten = 0
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize)
    const snapshots = await client.$queryRaw<Array<{
      squadMatchId: string
      positionSamples: unknown
      deathSamples: unknown
      phaseSnapshots: unknown
    }>>(Prisma.sql`
      SELECT t.squadMatchId, t.positionSamples, t.deathSamples, t.phaseSnapshots
      FROM SquadMatchTelemetry t
      WHERE t.squadMatchId IN (${Prisma.join(batch.map((match) => match.id))})
    `)

    for (const row of snapshots) {
      rowsWritten += await persistZoneClosurePositionsForMatch(
        row.squadMatchId,
        {
          positionSamples: asArray(row.positionSamples),
          deathSamples: asArray(row.deathSamples),
          phaseSnapshots: asArray(row.phaseSnapshots),
        } as Pick<ParsedTelemetrySnapshot, 'positionSamples' | 'deathSamples' | 'phaseSnapshots'>,
        client
      )
    }
    input.onProgress?.(Math.min(offset + batch.length, pending.length), pending.length)
  }

  return { matchesProcessed: pending.length, rowsWritten }
}
