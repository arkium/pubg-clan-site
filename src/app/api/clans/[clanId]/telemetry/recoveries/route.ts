import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireRole } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 100
  }

  return Math.min(parsed, 300)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json(buildTelemetryErrorResponse('Invalid clan id', 'INVALID_CLAN_ID'), {
        status: 400,
      })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const url = new URL(request.url)
    const limit = parseLimit(url.searchParams.get('limit'))

    const rows = await prisma.$queryRaw<Array<{
      id: string
      squadMatchId: string
      pubgMatchId: string
      gameMode: string
      mapName: string
      placement: number
      squadCreatedAt: Date
      status: string
      parserVersion: string
      parsedAt: Date
      sourceGeneratedAt: Date | null
      contentLength: number | null
      bytesDownloaded: number | null
      errorCode: string | null
      errorMessage: string | null
      createdAt: Date
      updatedAt: Date
      hasParsedPayload: number
    }>>(Prisma.sql`
      SELECT
        t.id,
        t.squadMatchId,
        sm.pubgMatchId,
        sm.gameMode,
        sm.mapName,
        sm.placement,
        sm.createdAt AS squadCreatedAt,
        t.status,
        t.parserVersion,
        t.parsedAt,
        t.sourceGeneratedAt,
        t.contentLength,
        t.bytesDownloaded,
        t.errorCode,
        t.errorMessage,
        t.createdAt,
        t.updatedAt,
        CASE
          WHEN t.summary IS NOT NULL OR t.weaponStats IS NOT NULL OR t.memberStats IS NOT NULL THEN 1
          ELSE 0
        END AS hasParsedPayload
      FROM SquadMatchTelemetry t
      INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
      WHERE EXISTS (
        SELECT 1
        FROM SquadMember sdm
        INNER JOIN ClanMember cm ON cm.id = sdm.memberId
        WHERE sdm.squadMatchId = sm.id
          AND cm.clanId = ${parsedClanId}
      )
      ORDER BY t.updatedAt DESC
      LIMIT ${limit}
    `)

    const counts = rows.reduce(
      (acc, row) => {
        const normalizedStatus =
          row.status === 'success' || row.status === 'failed' ? row.status : 'pending'

        if (normalizedStatus === 'success') {
          acc.success += 1
        } else if (normalizedStatus === 'failed') {
          // Data past PUBG's ~14-15 day retention window is permanently gone —
          // counted separately so "failed" reflects actual pipeline problems to fix.
          if (isTelemetryDataExpiredError(row.errorCode, row.errorMessage)) {
            acc.expired += 1
          } else {
            acc.failed += 1
          }
        } else {
          acc.pending += 1
        }

        if (row.hasParsedPayload === 1) {
          acc.withParsedPayload += 1
        }

        return acc
      },
      {
        success: 0,
        failed: 0,
        expired: 0,
        pending: 0,
        withParsedPayload: 0,
      }
    )

    const summary = {
      total: rows.length,
      success: counts.success,
      failed: counts.failed,
      expired: counts.expired,
      pending: counts.pending,
      withParsedPayload: counts.withParsedPayload,
    }

    const normalizedRows = rows.map((row) => ({
      id: row.id,
      squadMatchId: row.squadMatchId,
      pubgMatchId: row.pubgMatchId,
      gameMode: row.gameMode,
      mapName: row.mapName,
      placement: row.placement,
      squadCreatedAt: row.squadCreatedAt.toISOString(),
      status: row.status === 'success' || row.status === 'failed' ? row.status : 'pending',
      parserVersion: row.parserVersion,
      parsedAt: row.parsedAt.toISOString(),
      sourceGeneratedAt: row.sourceGeneratedAt?.toISOString() ?? null,
      contentLength: row.contentLength,
      bytesDownloaded: row.bytesDownloaded,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      hasParsedPayload: row.hasParsedPayload === 1,
    }))

    return Response.json(
      buildTelemetrySuccessResponse(
        {
          scope: 'clan',
          clanId: parsedClanId,
          limit,
          count: normalizedRows.length,
        },
        {
          summary,
          rows: normalizedRows,
        },
        {
          clanId: parsedClanId,
          limit,
          summary,
          rows: normalizedRows,
        }
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry recoveries status failed:', error)
    return Response.json(
      buildTelemetryErrorResponse('Failed to load telemetry recoveries status'),
      { status: 500 }
    )
  }
}