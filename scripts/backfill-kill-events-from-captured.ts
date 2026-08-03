import 'dotenv/config'
import fs from 'fs'
import path from 'path'

import { prisma } from '@/lib/prisma'
import { parseTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import { persistKillEventsForMatch } from '@/lib/kill-event-persistence'

const CAPTURED_DIR = path.join(process.cwd(), '.telemetry-captured')
const SQUAD_MATCH_ID_PATTERN = /-([a-z0-9]{20,})\.json$/i

function readPositiveInteger(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} requires a positive integer`)
  }
  return value
}

async function main() {
  const limit = readPositiveInteger('--limit')
  const dryRun = process.argv.includes('--dry-run')

  if (!fs.existsSync(CAPTURED_DIR)) {
    console.info('[KillEventCapturedBackfill] No .telemetry-captured directory found, nothing to do.')
    return
  }

  const files = fs
    .readdirSync(CAPTURED_DIR)
    .filter((file) => file.endsWith('.json'))
    .slice(0, limit ?? Infinity)

  console.info('[KillEventCapturedBackfill] Found', files.length, 'captured files to process')

  let matched = 0
  let notFound = 0
  let parseErrors = 0
  let totalRowsWritten = 0

  for (const [index, file] of files.entries()) {
    const match = file.match(SQUAD_MATCH_ID_PATTERN)
    const squadMatchId = match?.[1]

    if (!squadMatchId) {
      console.warn('[KillEventCapturedBackfill] Could not extract squadMatchId from filename', file)
      continue
    }

    const squadMatch = await prisma.squadMatch.findUnique({
      where: { id: squadMatchId },
      select: { id: true },
    })

    if (!squadMatch) {
      notFound += 1
      continue
    }

    matched += 1

    try {
      const filePath = path.join(CAPTURED_DIR, file)
      const raw = fs.readFileSync(filePath, 'utf8')
      const events = JSON.parse(raw) as unknown
      const snapshot = parseTelemetrySnapshot(events)

      if (!dryRun) {
        const rowsWritten = await persistKillEventsForMatch(squadMatchId, snapshot.killFeedSamples)
        totalRowsWritten += rowsWritten
      } else {
        totalRowsWritten += snapshot.killFeedSamples.length
      }
    } catch (error) {
      parseErrors += 1
      console.error('[KillEventCapturedBackfill] Failed to process', file, error)
    }

    if ((index + 1) % 50 === 0) {
      console.info('[KillEventCapturedBackfill] Progress', {
        processed: index + 1,
        total: files.length,
        matched,
        notFound,
        parseErrors,
        totalRowsWritten,
      })
    }
  }

  const totalKillEvents = await prisma.killEvent.count()

  console.info('[KillEventCapturedBackfill] Done', {
    filesProcessed: files.length,
    matched,
    notFound,
    parseErrors,
    totalRowsWritten,
    dryRun,
    totalKillEventsInDb: totalKillEvents,
  })
}

main()
  .catch((error) => {
    console.error('[KillEventCapturedBackfill] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
