import { Prisma } from '@prisma/client'

import { encodeGeoColumn } from '@/lib/pubg-telemetry/geo-codec'
import type { ParsedTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import { prisma } from '@/lib/prisma'

export async function persistTelemetryJsonFieldsWithSql(input: {
  squadMatchId: string
  parsed: ParsedTelemetrySnapshot
}) {
  const summaryJson = JSON.stringify(input.parsed.summary)
  const weaponStatsJson = JSON.stringify(input.parsed.weaponStats)
  const memberStatsJson = JSON.stringify(input.parsed.memberStats)
  // Geolocalisation compressee (~8x) : la colonne en clair est mise a NULL.
  const positionSamplesGz = encodeGeoColumn(input.parsed.positionSamples)
  const trajectorySegmentsGz = encodeGeoColumn(input.parsed.trajectorySegments)
  const deathSamplesJson = JSON.stringify(input.parsed.deathSamples)
  const landingSamplesJson = JSON.stringify(input.parsed.landingSamples)
  const phaseSnapshotsJson = JSON.stringify(input.parsed.phaseSnapshots)
  const killSamplesJson = JSON.stringify(input.parsed.killSamples)
  const shotSamplesJson = JSON.stringify(input.parsed.shotSamples)
  const damageSamplesJson = JSON.stringify(input.parsed.damageSamples)
  const knockoutSamplesJson = JSON.stringify(input.parsed.knockoutSamples)
  const reviveSamplesJson = JSON.stringify(input.parsed.reviveSamples)
  const vehicleSamplesJson = JSON.stringify(input.parsed.vehicleSamples)
  const killFeedSamplesJson = JSON.stringify(input.parsed.killFeedSamples)
  const carePackageSamplesJson = JSON.stringify(input.parsed.carePackageSamples ?? [])

  const totalBytes =
    summaryJson.length + weaponStatsJson.length + memberStatsJson.length +
    (positionSamplesGz?.length ?? 0) + (trajectorySegmentsGz?.length ?? 0) +
    deathSamplesJson.length + landingSamplesJson.length + phaseSnapshotsJson.length +
    killSamplesJson.length + shotSamplesJson.length + damageSamplesJson.length +
    knockoutSamplesJson.length + reviveSamplesJson.length + vehicleSamplesJson.length +
    killFeedSamplesJson.length + carePackageSamplesJson.length

  console.info('[TelemetrySync][Sql] json-sizes', {
    squadMatchId: input.squadMatchId,
    summary: summaryJson.length,
    weaponStats: weaponStatsJson.length,
    memberStats: memberStatsJson.length,
    positionSamplesGz: positionSamplesGz?.length ?? 0,
    trajectorySegmentsGz: trajectorySegmentsGz?.length ?? 0,
    deathSamples: deathSamplesJson.length,
    landingSamples: landingSamplesJson.length,
    phaseSnapshots: phaseSnapshotsJson.length,
    killSamples: killSamplesJson.length,
    shotSamples: shotSamplesJson.length,
    damageSamples: damageSamplesJson.length,
    knockoutSamples: knockoutSamplesJson.length,
    reviveSamples: reviveSamplesJson.length,
    vehicleSamples: vehicleSamplesJson.length,
    killFeedSamples: killFeedSamplesJson.length,
    carePackageSamples: carePackageSamplesJson.length,
    totalBytes,
  })

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE SquadMatchTelemetry
      SET
        summary = ${summaryJson},
        weaponStats = ${weaponStatsJson},
        memberStats = ${memberStatsJson},
        positionSamples = NULL,
        trajectorySegments = NULL,
        positionSamplesGz = ${positionSamplesGz},
        trajectorySegmentsGz = ${trajectorySegmentsGz},
        deathSamples = ${deathSamplesJson},
        landingSamples = ${landingSamplesJson},
        phaseSnapshots = ${phaseSnapshotsJson},
        killSamples = ${killSamplesJson},
        shotSamples = ${shotSamplesJson},
        damageSamples = ${damageSamplesJson},
        knockoutSamples = ${knockoutSamplesJson},
        reviveSamples = ${reviveSamplesJson},
        vehicleSamples = ${vehicleSamplesJson},
        killFeedSamples = ${killFeedSamplesJson},
        carePackageSamples = ${carePackageSamplesJson},
        updatedAt = NOW()
      WHERE squadMatchId = ${input.squadMatchId}
    `
  )
}
