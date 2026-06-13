import { Prisma } from '@prisma/client'

import type { ParsedTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import { prisma } from '@/lib/prisma'

export async function persistTelemetryJsonFieldsWithSql(input: {
  squadMatchId: string
  parsed: ParsedTelemetrySnapshot
}) {
  const summaryJson = JSON.stringify(input.parsed.summary)
  const weaponStatsJson = JSON.stringify(input.parsed.weaponStats)
  const memberStatsJson = JSON.stringify(input.parsed.memberStats)
  const positionSamplesJson = JSON.stringify(input.parsed.positionSamples)
  const trajectorySegmentsJson = JSON.stringify(input.parsed.trajectorySegments)
  const deathSamplesJson = JSON.stringify(input.parsed.deathSamples)
  const landingSamplesJson = JSON.stringify(input.parsed.landingSamples)
  const phaseSnapshotsJson = JSON.stringify(input.parsed.phaseSnapshots)
  const killSamplesJson = JSON.stringify(input.parsed.killSamples)
  const shotSamplesJson = JSON.stringify(input.parsed.shotSamples)
  const damageSamplesJson = JSON.stringify(input.parsed.damageSamples)
  const knockoutSamplesJson = JSON.stringify(input.parsed.knockoutSamples)
  const reviveSamplesJson = JSON.stringify(input.parsed.reviveSamples)
  const vehicleSamplesJson = JSON.stringify(input.parsed.vehicleSamples)

  const totalBytes =
    summaryJson.length + weaponStatsJson.length + memberStatsJson.length +
    positionSamplesJson.length + trajectorySegmentsJson.length +
    deathSamplesJson.length + landingSamplesJson.length + phaseSnapshotsJson.length +
    killSamplesJson.length + shotSamplesJson.length + damageSamplesJson.length +
    knockoutSamplesJson.length + reviveSamplesJson.length + vehicleSamplesJson.length

  console.info('[TelemetrySync][Sql] json-sizes', {
    squadMatchId: input.squadMatchId,
    summary: summaryJson.length,
    weaponStats: weaponStatsJson.length,
    memberStats: memberStatsJson.length,
    positionSamples: positionSamplesJson.length,
    trajectorySegments: trajectorySegmentsJson.length,
    deathSamples: deathSamplesJson.length,
    landingSamples: landingSamplesJson.length,
    phaseSnapshots: phaseSnapshotsJson.length,
    killSamples: killSamplesJson.length,
    shotSamples: shotSamplesJson.length,
    damageSamples: damageSamplesJson.length,
    knockoutSamples: knockoutSamplesJson.length,
    reviveSamples: reviveSamplesJson.length,
    vehicleSamples: vehicleSamplesJson.length,
    totalBytes,
  })

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE SquadMatchTelemetry
      SET
        summary = ${summaryJson},
        weaponStats = ${weaponStatsJson},
        memberStats = ${memberStatsJson},
        positionSamples = ${positionSamplesJson},
        trajectorySegments = ${trajectorySegmentsJson},
        deathSamples = ${deathSamplesJson},
        landingSamples = ${landingSamplesJson},
        phaseSnapshots = ${phaseSnapshotsJson},
        killSamples = ${killSamplesJson},
        shotSamples = ${shotSamplesJson},
        damageSamples = ${damageSamplesJson},
        knockoutSamples = ${knockoutSamplesJson},
        reviveSamples = ${reviveSamplesJson},
        vehicleSamples = ${vehicleSamplesJson},
        updatedAt = NOW()
      WHERE squadMatchId = ${input.squadMatchId}
    `
  )
}
