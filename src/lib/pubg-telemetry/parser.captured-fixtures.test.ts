import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { createReadStream } from 'node:fs'

import { parseTelemetrySnapshotFromStream } from '@/lib/pubg-telemetry/parser'

function getCapturedFixturesDir() {
  const configured = process.env.TELEMETRY_CAPTURE_FIXTURES_DIR?.trim()
  if (configured && configured.length > 0) {
    return path.resolve(process.cwd(), configured)
  }

  return path.join(process.cwd(), '.telemetry-captured')
}

function getCapturedFixtureTestLimit() {
  const raw = Number(process.env.TELEMETRY_TEST_CAPTURED_FIXTURES_MAX_FILES ?? '3')
  if (!Number.isFinite(raw) || raw <= 0) {
    return 3
  }

  return Math.floor(raw)
}

function getCapturedFixtureParseBudgetMs() {
  const raw = Number(process.env.TELEMETRY_TEST_CAPTURED_FIXTURE_MAX_PARSE_MS ?? '2000')
  if (!Number.isFinite(raw) || raw <= 0) {
    return 2000
  }

  return Math.floor(raw)
}

function formatMiB(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

function computeAverage(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  const total = values.reduce((acc, value) => acc + value, 0)
  return total / values.length
}

function computeP95(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil(0.95 * sorted.length) - 1
  const index = Math.min(Math.max(rank, 0), sorted.length - 1)
  return sorted[index]
}

describe('parser captured fixtures integration', () => {
  const runCapturedFixturesTest = process.env.TELEMETRY_TEST_CAPTURED_FIXTURES === 'true'
  const capturedFixtureTest = runCapturedFixturesTest ? it : it.skip

  capturedFixtureTest(
    'parses captured telemetry fixtures from disk without throwing',
    async () => {
      const parseBudgetMs = getCapturedFixtureParseBudgetMs()
      const capturedFixturesDir = getCapturedFixturesDir()
      const entries = await readdir(capturedFixturesDir, { withFileTypes: true })
      const fixtureFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))

      expect(fixtureFiles.length).toBeGreaterThan(0)

      const selectedFiles = fixtureFiles.slice(0, getCapturedFixtureTestLimit())
      const parseResults: Array<{
        fileName: string
        fileSizeBytes: number
        bytesRead: number
        totalEvents: number
        durationMs: number
      }> = []

      for (const fileName of selectedFiles) {
        const filePath = path.join(capturedFixturesDir, fileName)
        const startedAt = Date.now()
        const fileStats = await stat(filePath)
        const nodeStream = createReadStream(filePath)
        const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

        const { snapshot, bytesRead } = await parseTelemetrySnapshotFromStream(
          webStream,
          250 * 1024 * 1024
        )
        const durationMs = Date.now() - startedAt

        expect(bytesRead).toBeGreaterThan(0)
        expect(snapshot.summary.totalEvents).toBeGreaterThan(0)
        expect(durationMs).toBeLessThanOrEqual(parseBudgetMs)

        parseResults.push({
          fileName,
          fileSizeBytes: fileStats.size,
          bytesRead,
          totalEvents: snapshot.summary.totalEvents,
          durationMs,
        })
      }

      for (const result of parseResults) {
        console.info(
          `[CapturedFixtureTest] ${result.fileName} size=${formatMiB(result.fileSizeBytes)} read=${formatMiB(result.bytesRead)} events=${result.totalEvents} parseMs=${result.durationMs} budgetMs=${parseBudgetMs}`
        )
      }

      const durations = parseResults.map((result) => result.durationMs)
      const averageMs = computeAverage(durations)
      const p95Ms = computeP95(durations)

      console.info(
        `[CapturedFixtureTestSummary] files=${parseResults.length} avgParseMs=${averageMs.toFixed(1)} p95ParseMs=${p95Ms} budgetMs=${parseBudgetMs}`
      )
    },
    120_000
  )
})
