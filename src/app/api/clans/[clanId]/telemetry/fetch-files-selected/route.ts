import { NextResponse } from 'next/server'

import { fetchTelemetryFilesForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
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

    const result = await fetchTelemetryFilesForSelectedSquadMatches(parsedClanId, squadMatchIds)

    const capturedCount = result.results.filter((item) => !!item.captureFilePath).length
    const captureErrorCount = result.results.filter((item) => !!item.captureError).length

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      requestedCount: result.requestedCount,
      processedCount: result.processedCount,
      successCount: result.successCount,
      failedCount: result.failedCount,
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
