import { NextResponse } from 'next/server'

import {
  syncTelemetryForSquadMatchFromStream,
} from '@/lib/pubg-telemetry/manual-sync'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseBooleanLike(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function parseOptionalIsoDate(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
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

    const formData = await request.formData()
    const squadMatchIdRaw = formData.get('squadMatchId')
    const fileValue = formData.get('file')

    const squadMatchId = typeof squadMatchIdRaw === 'string' ? squadMatchIdRaw.trim() : ''
    if (!squadMatchId) {
      return NextResponse.json({ error: 'squadMatchId is required' }, { status: 400 })
    }

    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    if (fileValue.size <= 0) {
      return NextResponse.json({ error: 'file is empty' }, { status: 400 })
    }

    const shouldRecalculateAggregates = parseBooleanLike(formData.get('recalculateAggregates'))
    const sourceGeneratedAt = parseOptionalIsoDate(formData.get('sourceGeneratedAt'))

    const result = await syncTelemetryForSquadMatchFromStream({
      clanId: parsedClanId,
      squadMatchId,
      stream: fileValue.stream() as ReadableStream<Uint8Array>,
      contentLength: fileValue.size,
      sourceGeneratedAt: sourceGeneratedAt?.toISOString() ?? null,
    })

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
      ok: result.status === 'success',
      clanId: parsedClanId,
      aggregatesRecalculated: shouldRecalculateAggregates,
      aggregates: aggregateSummary,
      aggregatesWarning: aggregateWarning,
      processedCount: 1,
      successCount: result.status === 'success' ? 1 : 0,
      failedCount: result.status === 'failed' ? 1 : 0,
      results: [result],
      file: {
        name: fileValue.name,
        size: fileValue.size,
        type: fileValue.type || null,
      },
    })
  } catch (error) {
    console.error('Telemetry file import failed:', error)
    return NextResponse.json({ error: 'Failed to import telemetry file' }, { status: 500 })
  }
}
