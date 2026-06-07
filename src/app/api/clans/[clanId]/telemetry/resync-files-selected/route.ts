import { NextResponse } from 'next/server'

import type { ManualTelemetrySyncItemResult } from '@/lib/pubg-telemetry/manual-sync'
import { getTelemetryFixtureCaptureMaxBytes } from '@/lib/pubg-telemetry/fixture-capture'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'
import { resolveCaptureDirectory, resyncTelemetryFromCapturedFile } from '@/lib/pubg-telemetry/resync-files'
import { prisma } from '@/lib/prisma'
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

    const body = (await request.json().catch(() => null)) as
      | {
          squadMatchIds?: unknown
          recalculateAggregates?: unknown
          validateOnly?: unknown
          onlyRecalculateAggregates?: unknown
          resetBeforeSync?: unknown
        }
      | null

    const shouldRecalculateAggregates = body?.recalculateAggregates !== false
    const validateOnly = body?.validateOnly === true
    const onlyRecalculateAggregates = body?.onlyRecalculateAggregates === true
    const resetBeforeSync = body?.resetBeforeSync === true

    if (onlyRecalculateAggregates) {
      if (!shouldRecalculateAggregates) {
        return NextResponse.json({
          ok: true,
          clanId: parsedClanId,
          aggregatesRecalculated: false,
          aggregates: null,
          aggregatesWarning: null,
          requestedCount: 0,
          processedCount: 0,
          successCount: 0,
          failedCount: 0,
          missingFiles: [],
          oversizedFiles: [],
          maxResyncFileBytes: getTelemetryFixtureCaptureMaxBytes(),
          captureDirectory: resolveCaptureDirectory(),
          results: [],
        })
      }

      let aggregateSummary:
        | {
            periodsUpdated: number
            memberTelemetryRows: number
            memberWeaponRows: number
            clanSynergyRows: number
          }
        | null = null
      let aggregateWarning: string | null = null

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

      return NextResponse.json({
        ok: true,
        clanId: parsedClanId,
        validateOnly: false,
        onlyRecalculateAggregates: true,
        canProceed: true,
        aggregatesRecalculated: true,
        aggregates: aggregateSummary,
        aggregatesWarning: aggregateWarning,
        requestedCount: 0,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        missingFiles: [],
        oversizedFiles: [],
        maxResyncFileBytes: getTelemetryFixtureCaptureMaxBytes(),
        captureDirectory: resolveCaptureDirectory(),
        results: [],
      })
    }

    if (!Array.isArray(body?.squadMatchIds)) {
      return NextResponse.json({ error: 'squadMatchIds must be an array' }, { status: 400 })
    }

    const squadMatchIds = body.squadMatchIds.filter(
      (value): value is string => typeof value === 'string'
    )

    if (squadMatchIds.length === 0) {
      return NextResponse.json({ error: 'No squad match selected' }, { status: 400 })
    }

    const captureDir = resolveCaptureDirectory()
    const maxResyncFileBytes = getTelemetryFixtureCaptureMaxBytes()

    if (resetBeforeSync && !validateOnly) {
      await prisma.squadMatchTelemetry.deleteMany({
        where: {
          squadMatchId: {
            in: squadMatchIds,
          },
        },
      })
    }

    const missingFiles: string[] = []
    const oversizedFiles: string[] = []
    const results: ManualTelemetrySyncItemResult[] = []

    for (const squadMatchId of squadMatchIds) {
      const syncFromFile = await resyncTelemetryFromCapturedFile({
        clanId: parsedClanId,
        squadMatchId,
        captureDir,
        maxResyncFileBytes,
      })

      if (syncFromFile.status === 'missing') {
        missingFiles.push(squadMatchId)
        continue
      }

      if (syncFromFile.status === 'oversized') {
        oversizedFiles.push(squadMatchId)
        results.push({
          squadMatchId,
          pubgMatchId: 'unknown',
          status: 'failed',
          bytesDownloaded: 0,
          contentLength: syncFromFile.size,
          errorCode: 'CAPTURE_FILE_TOO_LARGE',
          errorMessage: `Captured file exceeds size limit (${syncFromFile.size} > ${maxResyncFileBytes} bytes)`,
        })
        continue
      }

      if (validateOnly) {
        results.push({
          squadMatchId,
          pubgMatchId: 'unknown',
          status: 'success',
          bytesDownloaded: syncFromFile.size,
          contentLength: syncFromFile.size,
          errorCode: null,
          errorMessage: null,
        })
        continue
      }

      results.push(syncFromFile.result)
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

    if (shouldRecalculateAggregates && !validateOnly) {
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
      validateOnly,
      onlyRecalculateAggregates: false,
      canProceed: missingFiles.length === 0 && oversizedFiles.length === 0,
      resetBeforeSync,
      aggregatesRecalculated: shouldRecalculateAggregates && !validateOnly,
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
