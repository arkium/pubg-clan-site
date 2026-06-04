import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { syncTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseLimit(value: unknown) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 100
  }

  return Math.min(parsed, 500)
}

function parseDryRun(value: unknown) {
  return value === true
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
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
          limit?: unknown
          dryRun?: unknown
        }
      | null

    const limit = parseLimit(body?.limit)
    const dryRun = parseDryRun(body?.dryRun)

    const candidates = await prisma.$queryRaw<Array<{ squadMatchId: string }>>(Prisma.sql`
      SELECT t.squadMatchId
      FROM SquadMatchTelemetry t
      INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
      WHERE t.status = 'success'
        AND t.summary IS NULL
        AND t.weaponStats IS NULL
        AND t.memberStats IS NULL
        AND EXISTS (
          SELECT 1
          FROM SquadMember sdm
          INNER JOIN ClanMember cm ON cm.id = sdm.memberId
          WHERE sdm.squadMatchId = sm.id
            AND cm.clanId = ${parsedClanId}
        )
      ORDER BY t.updatedAt DESC
      LIMIT ${limit}
    `)

    const squadMatchIds = candidates.map((row) => row.squadMatchId)

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        clanId: parsedClanId,
        dryRun: true,
        limit,
        candidateCount: squadMatchIds.length,
        squadMatchIds,
      })
    }

    if (squadMatchIds.length === 0) {
      return NextResponse.json({
        ok: true,
        clanId: parsedClanId,
        dryRun: false,
        limit,
        candidateCount: 0,
        batchCount: 0,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        results: [],
      })
    }

    const batches = chunk(squadMatchIds, 50)
    const mergedResults: Awaited<ReturnType<typeof syncTelemetryForSelectedSquadMatches>>['results'] = []

    let processedCount = 0
    let successCount = 0
    let failedCount = 0
    let skippedCount = 0

    for (const batch of batches) {
      const result = await syncTelemetryForSelectedSquadMatches(parsedClanId, batch)
      processedCount += result.processedCount
      successCount += result.successCount
      failedCount += result.failedCount
      skippedCount += result.skippedCount
      mergedResults.push(...result.results)
    }

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      dryRun: false,
      limit,
      candidateCount: squadMatchIds.length,
      batchCount: batches.length,
      processedCount,
      successCount,
      failedCount,
      skippedCount,
      results: mergedResults,
    })
  } catch (error) {
    console.error('Telemetry backfill null json failed:', error)
    return NextResponse.json({ error: 'Failed to backfill telemetry null json snapshots' }, { status: 500 })
  }
}
