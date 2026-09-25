import { Prisma } from '@prisma/client'

import { encodeJsonColumn } from '@/lib/pubg-telemetry/json-codec'
import type { ParsedTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import { prisma } from '@/lib/prisma'

/**
 * Écriture des sections JSON en SQL brut, utilisée quand le chemin Prisma échoue.
 *
 * Comme le chemin nominal (`persistence-payload.ts`), tout part compressé sauf `summary`, que cinq
 * routes interrogent par `JSON_EXTRACT`. Les colonnes en clair sont explicitement mises à `NULL` :
 * laisser une valeur dans les deux formats doublerait le stockage et ferait diverger les lectures.
 */
export async function persistTelemetryJsonFieldsWithSql(input: {
  squadMatchId: string
  parsed: ParsedTelemetrySnapshot
}) {
  const summaryJson = JSON.stringify(input.parsed.summary)

  const weaponStatsGz = encodeJsonColumn(input.parsed.weaponStats)
  const memberStatsGz = encodeJsonColumn(input.parsed.memberStats)
  const positionSamplesGz = encodeJsonColumn(input.parsed.positionSamples)
  const trajectorySegmentsGz = encodeJsonColumn(input.parsed.trajectorySegments)
  const deathSamplesGz = encodeJsonColumn(input.parsed.deathSamples)
  const landingSamplesGz = encodeJsonColumn(input.parsed.landingSamples)
  const phaseSnapshotsGz = encodeJsonColumn(input.parsed.phaseSnapshots)
  const killSamplesGz = encodeJsonColumn(input.parsed.killSamples)
  const shotSamplesGz = encodeJsonColumn(input.parsed.shotSamples)
  const damageSamplesGz = encodeJsonColumn(input.parsed.damageSamples)
  const knockoutSamplesGz = encodeJsonColumn(input.parsed.knockoutSamples)
  const reviveSamplesGz = encodeJsonColumn(input.parsed.reviveSamples)
  const vehicleSamplesGz = encodeJsonColumn(input.parsed.vehicleSamples)
  const killFeedSamplesGz = encodeJsonColumn(input.parsed.killFeedSamples)
  const carePackageSamplesGz = encodeJsonColumn(input.parsed.carePackageSamples ?? [])

  const totalBytes =
    summaryJson.length +
    [
      weaponStatsGz,
      memberStatsGz,
      positionSamplesGz,
      trajectorySegmentsGz,
      deathSamplesGz,
      landingSamplesGz,
      phaseSnapshotsGz,
      killSamplesGz,
      shotSamplesGz,
      damageSamplesGz,
      knockoutSamplesGz,
      reviveSamplesGz,
      vehicleSamplesGz,
      killFeedSamplesGz,
      carePackageSamplesGz,
    ].reduce((somme, buffer) => somme + (buffer?.length ?? 0), 0)

  console.info('[TelemetrySync][Sql] json-sizes', {
    squadMatchId: input.squadMatchId,
    summary: summaryJson.length,
    memberStatsGz: memberStatsGz?.length ?? 0,
    positionSamplesGz: positionSamplesGz?.length ?? 0,
    trajectorySegmentsGz: trajectorySegmentsGz?.length ?? 0,
    vehicleSamplesGz: vehicleSamplesGz?.length ?? 0,
    totalBytes,
  })

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE SquadMatchTelemetry
      SET
        summary = ${summaryJson},
        weaponStats = NULL,
        memberStats = NULL,
        positionSamples = NULL,
        trajectorySegments = NULL,
        deathSamples = NULL,
        landingSamples = NULL,
        phaseSnapshots = NULL,
        killSamples = NULL,
        shotSamples = NULL,
        damageSamples = NULL,
        knockoutSamples = NULL,
        reviveSamples = NULL,
        vehicleSamples = NULL,
        killFeedSamples = NULL,
        carePackageSamples = NULL,
        weaponStatsGz = ${weaponStatsGz},
        memberStatsGz = ${memberStatsGz},
        positionSamplesGz = ${positionSamplesGz},
        trajectorySegmentsGz = ${trajectorySegmentsGz},
        deathSamplesGz = ${deathSamplesGz},
        landingSamplesGz = ${landingSamplesGz},
        phaseSnapshotsGz = ${phaseSnapshotsGz},
        killSamplesGz = ${killSamplesGz},
        shotSamplesGz = ${shotSamplesGz},
        damageSamplesGz = ${damageSamplesGz},
        knockoutSamplesGz = ${knockoutSamplesGz},
        reviveSamplesGz = ${reviveSamplesGz},
        vehicleSamplesGz = ${vehicleSamplesGz},
        killFeedSamplesGz = ${killFeedSamplesGz},
        carePackageSamplesGz = ${carePackageSamplesGz},
        updatedAt = NOW()
      WHERE squadMatchId = ${input.squadMatchId}
    `
  )
}
