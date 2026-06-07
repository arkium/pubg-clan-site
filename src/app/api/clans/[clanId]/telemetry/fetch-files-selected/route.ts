import path from 'node:path'
import { readdir } from 'node:fs/promises'

import { NextResponse } from 'next/server'

import { fetchTelemetryFilesForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
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

async function findAlreadyCapturedMatchIds(squadMatchIds: string[]) {
  const captureDir = resolveCaptureDirectory()

  let files: string[] = []
  try {
    files = await readdir(captureDir)
  } catch {
    return {
      captureDir,
      alreadyCapturedMatchIds: [] as string[],
    }
  }

  const alreadyCapturedMatchIds = squadMatchIds.filter((squadMatchId) => {
    const suffix = `-${sanitizeFileSegment(squadMatchId)}.json`
    return files.some((fileName) => fileName.endsWith(suffix))
  })

  return {
    captureDir,
    alreadyCapturedMatchIds,
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

    const body = (await request.json().catch(() => null)) as { squadMatchIds?: unknown } | null

    if (!Array.isArray(body?.squadMatchIds)) {
      return NextResponse.json({ error: 'squadMatchIds must be an array' }, { status: 400 })
    }

    const squadMatchIds = body.squadMatchIds.filter(
      (value): value is string => typeof value === 'string'
    )

    if (squadMatchIds.length === 0) {
      return NextResponse.json({ error: 'No squad match selected' }, { status: 400 })
    }

    const { captureDir, alreadyCapturedMatchIds } = await findAlreadyCapturedMatchIds(squadMatchIds)
    const alreadyCapturedSet = new Set(alreadyCapturedMatchIds)
    const idsToFetch = squadMatchIds.filter((id) => !alreadyCapturedSet.has(id))

    if (idsToFetch.length === 0) {
      return NextResponse.json({
        ok: true,
        clanId: parsedClanId,
        requestedCount: squadMatchIds.length,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        skippedExistingCount: alreadyCapturedMatchIds.length,
        alreadyCapturedMatchIds,
        captureDirectory: captureDir,
        captureEnabled: true,
        captureMaxBytes: null,
        capturedCount: 0,
        captureErrorCount: 0,
        results: [],
      })
    }

    const result = await fetchTelemetryFilesForSelectedSquadMatches(parsedClanId, idsToFetch)

    const capturedCount = result.results.filter((item) => !!item.captureFilePath).length
    const captureErrorCount = result.results.filter((item) => !!item.captureError).length

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      requestedCount: squadMatchIds.length,
      processedCount: result.processedCount,
      successCount: result.successCount,
      failedCount: result.failedCount,
      skippedExistingCount: alreadyCapturedMatchIds.length,
      alreadyCapturedMatchIds,
      captureDirectory: captureDir,
      captureEnabled: result.captureEnabled,
      captureMaxBytes: result.captureMaxBytes,
      capturedCount,
      captureErrorCount,
      results: result.results,
    })
  } catch (error) {
    console.error('Fetch telemetry files from PUBG failed:', error)
    return NextResponse.json(
      { error: 'Failed to fetch telemetry files for selected matches' },
      { status: 500 }
    )
  }
}
