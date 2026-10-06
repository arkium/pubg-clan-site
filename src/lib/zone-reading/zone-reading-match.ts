/**
 * Lecture de zone — une ligne par partie (`ZoneReadingMatch`) : la ligne de vol du C-130 et les cercles stables
 * successifs, écrits au parsing de la télémétrie (docs/features/lecture-de-zone.md).
 *
 * - **Ligne de vol** : reconstituée depuis les sauts (`extractInitialJumps` → `computeFlightPathFromJumps`, écart nul aux
 *   points de saut), sinon depuis les atterrissages (`computeFlightPath`, repli approximatif).
 * - **Cercles** : `detectZoneClosures` — C1 est le cercle stable atteint à la fermeture de la phase 2, etc. La zone
 *   finale est le dernier cercle stable atteint.
 * - Seules les parties de battle royale classiques (`solo`, `duo`, `squad`, FPP compris) sont gardées ; le type de
 *   partie (officielle, classée…) est filtré à la lecture, depuis `SquadMatch`, qui peut être reclassé après coup.
 *
 * `vehicleSamples`, `landingSamples` et `phaseSnapshots` ne sont pas touchés par la purge géographique : le rattrapage
 * couvre tout l'historique.
 */
import { Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { computeFlightPath, computeFlightPathFromJumps } from '@/lib/pubg-telemetry/flight-path'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import { extractInitialJumps } from '@/lib/pubg-telemetry/match-replay'
import { detectZoneClosures } from '@/lib/zone-closure-positions'

export const ZONE_READING_GAME_MODE_PATTERN = /^(solo|duo|squad)(-fpp)?$/
/** Même règle en SQL (rattrapage). */
const GAME_MODE_REGEXP = '^(solo|duo|squad)(-fpp)?$'
/** Cartes jamais analysées : le camp d'entraînement n'a pas de zone. */
const EXCLUDED_MAPS = new Set(['Range_Main'])

export type ZoneReadingTeamMode = 'solo' | 'duo' | 'squad'

export function teamModeOfGameMode(gameMode: string): ZoneReadingTeamMode | null {
  const match = ZONE_READING_GAME_MODE_PATTERN.exec(gameMode.trim().toLowerCase())
  return match ? (match[1] as ZoneReadingTeamMode) : null
}

export type ZoneReadingMatchSource = { id: string; mapName: string; createdAt: Date; gameMode: string }

export type ZoneReadingMatchRow = {
  squadMatchId: string
  mapName: string
  matchDate: Date
  teamMode: ZoneReadingTeamMode
  flightSource: 'jumps' | 'landings'
  lineStartX: number
  lineStartY: number
  lineEndX: number
  lineEndY: number
  /** Cercles stables C1..Cn, en centimètres (repère de la télémétrie). */
  circles: Array<{ x: number; y: number; r: number }>
  circleCount: number
  finalX: number
  finalY: number
}

/** Ligne de la table pour une partie, ou `null` (mode hors battle royale, ni axe ni cercle exploitable). */
export function buildZoneReadingMatchRow(
  match: ZoneReadingMatchSource,
  snapshot: { vehicleSamples: unknown; landingSamples: unknown; phaseSnapshots: unknown }
): ZoneReadingMatchRow | null {
  const teamMode = teamModeOfGameMode(match.gameMode)
  if (!teamMode || EXCLUDED_MAPS.has(match.mapName)) return null

  const jumps = Array.from(extractInitialJumps(snapshot.vehicleSamples, match.createdAt.getTime() / 1000).values())
  const fromJumps = computeFlightPathFromJumps(jumps, match.mapName)
  const path = fromJumps ?? computeFlightPath(snapshot.landingSamples, match.mapName)
  if (!path) return null

  const circles = detectZoneClosures(snapshot.phaseSnapshots).map((closure) => ({
    x: Math.round(closure.centerX),
    y: Math.round(closure.centerY),
    r: Math.round(closure.radius),
  }))
  if (circles.length === 0) return null
  const final = circles[circles.length - 1]

  return {
    squadMatchId: match.id,
    mapName: match.mapName,
    matchDate: match.createdAt,
    teamMode,
    flightSource: fromJumps ? 'jumps' : 'landings',
    lineStartX: Math.round(path.start.x),
    lineStartY: Math.round(path.start.y),
    lineEndX: Math.round(path.end.x),
    lineEndY: Math.round(path.end.y),
    circles,
    circleCount: circles.length,
    finalX: final.x,
    finalY: final.y,
  }
}

/**
 * Écrit (ou remplace) la ligne d'une partie. Jamais bloquant : une erreur ici (table absente avant migration, par
 * exemple) est journalisée sans faire échouer la synchronisation de la télémétrie.
 */
export async function persistZoneReadingMatchForMatch(
  squadMatchId: string,
  snapshot: { vehicleSamples: unknown; landingSamples: unknown; phaseSnapshots: unknown },
  client: PrismaClient = prisma
) {
  try {
    const match = await client.squadMatch.findUnique({
      where: { id: squadMatchId },
      select: { id: true, mapName: true, createdAt: true, gameMode: true },
    })
    if (!match) return false
    const row = buildZoneReadingMatchRow(match, snapshot)
    if (!row) {
      await client.zoneReadingMatch.deleteMany({ where: { squadMatchId } })
      return false
    }
    const { squadMatchId: id, ...data } = row
    await client.zoneReadingMatch.upsert({ where: { squadMatchId: id }, create: row, update: data })
    return true
  } catch (error) {
    console.warn('[ZoneReading] Ligne de vol et cercles non enregistrés', {
      squadMatchId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/** Rattrapage des parties déjà analysées, des plus anciennes aux plus récentes. */
export async function backfillZoneReadingMatches(input: {
  limit?: number
  batchSize?: number
  client?: PrismaClient
  onProgress?: (processed: number, total: number, written: number) => void
} = {}) {
  const client = input.client ?? prisma
  const limit = Math.max(1, Math.min(input.limit ?? 100_000, 100_000))
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 50, 200))

  const pending = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT sm.id
    FROM SquadMatch sm
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success'
      AND sm.gameMode REGEXP ${GAME_MODE_REGEXP}
      AND (JSON_LENGTH(t.phaseSnapshots) > 0 OR t.phaseSnapshotsGz IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM ZoneReadingMatch z WHERE z.squadMatchId = sm.id)
    ORDER BY sm.createdAt ASC
    LIMIT ${limit}
  `)

  let written = 0
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize)
    const rows = await client.$queryRaw<Array<Record<string, unknown> & {
      id: string
      mapName: string
      createdAt: Date
      gameMode: string
    }>>(Prisma.sql`
      SELECT sm.id, sm.mapName, sm.createdAt, sm.gameMode,
             t.vehicleSamples, t.vehicleSamplesGz,
             t.landingSamples, t.landingSamplesGz,
             t.phaseSnapshots, t.phaseSnapshotsGz
      FROM SquadMatch sm
      INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
      WHERE sm.id IN (${Prisma.join(batch.map((match) => match.id))})
    `)

    const data: ZoneReadingMatchRow[] = []
    for (const raw of rows) {
      // Les deux formats (JSON en clair, colonnes `*Gz`) coexistent : une seule normalisation par ligne.
      const row = decodeTelemetryRow(raw)
      const built = buildZoneReadingMatchRow(row, {
        vehicleSamples: row.vehicleSamples,
        landingSamples: row.landingSamples,
        phaseSnapshots: row.phaseSnapshots,
      })
      if (built) data.push(built)
    }
    if (data.length > 0) {
      const result = await client.zoneReadingMatch.createMany({ data, skipDuplicates: true })
      written += result.count
    }
    input.onProgress?.(Math.min(offset + batch.length, pending.length), pending.length, written)
  }

  return { matchesProcessed: pending.length, rowsWritten: written }
}
