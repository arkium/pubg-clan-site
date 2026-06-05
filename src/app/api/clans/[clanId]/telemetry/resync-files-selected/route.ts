import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'

import { syncTelemetryForSquadMatchFromStream } from '@/lib/pubg-telemetry/manual-sync'
import { getTelemetryFixtureCaptureMaxBytes } from '@/lib/pubg-telemetry/fixture-capture'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function resolveCaptureDirectory() {
  const configuredDir = process.env.TELEMETRY_CAPTURE_FIXTURES_DIR?.trim()
  return configuredDir && configuredDir.length > 0
    ? path.resolve(process.cwd(), configuredDir)
    : path.join(process.cwd(), '.telemetry-captured')
}

async function findLatestCapturedFileForSquadMatch(
  captureDir: string,
  squadMatchId: string
): Promise<{ filePath: string; size: number } | null> {
  const fileSuffix = `-${sanitizeFileSegment(squadMatchId)}.json`

  let files: string[] = []
  try {
    files = await readdir(captureDir)
  } catch {
    return null
  }

  const candidates = files.filter((fileName) => fileName.endsWith(fileSuffix))
  if (candidates.length === 0) {
    return null
  }

  let bestFile: { filePath: string; size: number; mtimeMs: number } | null = null

  for (const fileName of candidates) {
    const filePath = path.join(captureDir, fileName)
    try {
      const details = await stat(filePath)
      if (!details.isFile()) {
        continue
      }

      if (!bestFile || details.mtimeMs > bestFile.mtimeMs) {
        bestFile = {
          filePath,
          size: details.size,
          mtimeMs: details.mtimeMs,
        }
      }
    } catch {
      // Ignore inaccessible candidate and continue.
    }
  }

  if (!bestFile) {
    return null
  }

  return {
    filePath: bestFile.filePath,
    size: bestFile.size,
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const body = (await request.json().catch(() => null)) as
      | { squadMatchIds?: unknown; recalculateAggregates?: unknown }
      | null

    if (!Array.isArray(body?.squadMatchIds)) {
      return NextResponse.json({ error: 'squadMatchIds must be an array' }, { status: 400 })
    }

    const squadMatchIds = body.squadMatchIds.filter(
      (value): value is string => typeof value === 'string'
    )
    const shouldRecalculateAggregates = body?.recalculateAggregates !== false

    if (squadMatchIds.length === 0) {
      return NextResponse.json({ error: 'No squad match selected' }, { status: 400 })
    }

    const captureDir = resolveCaptureDirectory()
    const maxResyncFileBytes = getTelemetryFixtureCaptureMaxBytes()
    const missingFiles: string[] = []
    const oversizedFiles: string[] = []
    const results: Array<Awaited<ReturnType<typeof syncTelemetryForSquadMatchFromStream>>> = []

    for (const squadMatchId of squadMatchIds) {
      const capturedFile = await findLatestCapturedFileForSquadMatch(captureDir, squadMatchId)
      if (!capturedFile) {
        missingFiles.push(squadMatchId)
        continue
      }

      if (capturedFile.size > maxResyncFileBytes) {
        oversizedFiles.push(squadMatchId)
        results.push({
          squadMatchId,
          pubgMatchId: 'unknown',
          status: 'failed',
          bytesDownloaded: 0,
          contentLength: capturedFile.size,
          errorCode: 'CAPTURE_FILE_TOO_LARGE',
          errorMessage: `Captured file exceeds size limit (${capturedFile.size} > ${maxResyncFileBytes} bytes)`,
        })
        continue
      }

      try {
        const nodeStream = createReadStream(capturedFile.filePath)
        const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

        const syncResult = await syncTelemetryForSquadMatchFromStream({
          clanId: parsedClanId,
          squadMatchId,
          stream: webStream,
          contentLength: capturedFile.size,
        })

        results.push(syncResult)
      } catch (error) {
        results.push({
          squadMatchId,
          pubgMatchId: 'unknown',
          status: 'failed',
          bytesDownloaded: 0,
          contentLength: capturedFile.size,
          errorCode: 'FILE_RESYNC_FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const successCount = results.filter((result) => result.status === 'success').length
    const failedCount = results.length - successCount

    let aggregateSummary:
      | {
          periodsUpdated: number
          memberTelemetryRows: number
          memberWeaponRows: number
          clanSynergyRows: number
        }
      | null = null
    let aggregateWarning: string | null = null

    if (shouldRecalculateAggregates) {
      try {
        const aggregateResult = await recalculateTelemetryPeriodAggregatesForClan(parsedClanId)
        aggregateSummary = {
          periodsUpdated: aggregateResult.summaries.length,
          memberTelemetryRows: aggregateResult.summaries.reduce(
            (sum, summary) => sum + summary.memberTelemetryRows,
            0
          ),
          memberWeaponRows: aggregateResult.summaries.reduce(
            (sum, summary) => sum + summary.memberWeaponRows,
            0
          ),
          clanSynergyRows: aggregateResult.summaries.reduce(
            (sum, summary) => sum + summary.clanSynergyRows,
            0
          ),
        }
      } catch (aggregateError) {
        aggregateWarning =
          aggregateError instanceof Error
            ? aggregateError.message
            : 'Recalcul des aggregates telemetry en echec'
      }
    }

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      aggregatesRecalculated: shouldRecalculateAggregates,
      aggregates: aggregateSummary,
      aggregatesWarning: aggregateWarning,
      requestedCount: squadMatchIds.length,
      processedCount: results.length,
      successCount,
      failedCount,
      missingFiles,
      oversizedFiles,
      maxResyncFileBytes,
      captureDirectory: captureDir,
      results,
    })
  } catch (error) {
    console.error('Resync telemetry from files failed:', error)
    return NextResponse.json(
      { error: 'Failed to resync telemetry from local files' },
      { status: 500 }
    )
  }
}
