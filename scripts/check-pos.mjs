import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const rows = await p.$queryRawUnsafe(
  `SELECT status, parserVersion, parsedAt,
   JSON_LENGTH(positionSamples) AS posCount,
   JSON_LENGTH(trajectorySegments) AS trajCount,
   JSON_LENGTH(deathSamples) AS deathCount
   FROM SquadMatchTelemetry WHERE squadMatchId = ? LIMIT 1`,
  'cmpufzh12008l04q437bfkmww'
)
console.log(JSON.stringify(rows, null, 2))
await p.$disconnect()
