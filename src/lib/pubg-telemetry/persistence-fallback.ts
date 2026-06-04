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

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE SquadMatchTelemetry
      SET
        summary = ${summaryJson},
        weaponStats = ${weaponStatsJson},
        memberStats = ${memberStatsJson},
        updatedAt = NOW()
      WHERE squadMatchId = ${input.squadMatchId}
    `
  )
}
