import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth-session'

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || !session.isSuperUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const olderParam = searchParams.get('olderThanDays')
    const olderThanDays =
      olderParam === 'all' || olderParam === '0'
        ? null
        : !olderParam
        ? 14
        : Number(olderParam) || 14
    const cutoffDate = olderThanDays ? new Date(Date.now() - olderThanDays * 24 * 3600 * 1000) : null

    const [totalRowsRes, toPurgeRowsRes] = await Promise.all([
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*) as total FROM SquadMatchTelemetry`,
      cutoffDate
        ? prisma.$queryRaw<Array<{ toPurge: bigint }>>`
            SELECT COUNT(*) as toPurge FROM SquadMatchTelemetry 
            WHERE (positionSamples IS NOT NULL OR trajectorySegments IS NOT NULL)
              AND COALESCE(sourceGeneratedAt, parsedAt, createdAt) < ${cutoffDate}
          `
        : prisma.$queryRaw<Array<{ toPurge: bigint }>>`
            SELECT COUNT(*) as toPurge FROM SquadMatchTelemetry 
            WHERE positionSamples IS NOT NULL OR trajectorySegments IS NOT NULL
          `,
    ])

    const totalMatches = Number(totalRowsRes[0]?.total ?? 0)
    const matchesToPurge = Number(toPurgeRowsRes[0]?.toPurge ?? 0)
    const purgedMatches = Math.max(0, totalMatches - matchesToPurge)
    const percentPurged = totalMatches > 0 ? Math.round((purgedMatches / totalMatches) * 100) : 100

    return Response.json({
      totalMatches,
      matchesToPurge,
      purgedMatches,
      percentPurged,
      olderThanDays: olderThanDays ?? 'all',
    })
  } catch (err: any) {
    console.error('Error fetching purge status:', err)
    return Response.json({ error: err.message || 'Erreur lors de la lecture du statut de purge' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || !session.isSuperUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as {
      batchSize?: number
      olderThanDays?: number | string
    }
    const batchSize = Math.min(Math.max(Number(body?.batchSize) || 250, 50), 1000)
    const olderParam = body?.olderThanDays
    const olderThanDays =
      olderParam === 'all' || olderParam === '0' || olderParam === 0
        ? null
        : Number(olderParam) || 14
    const cutoffDate = olderThanDays ? new Date(Date.now() - olderThanDays * 24 * 3600 * 1000) : null

    // 1. Fetch batch IDs by indexed primary key
    const candidateRows = cutoffDate
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM SquadMatchTelemetry 
          WHERE (positionSamples IS NOT NULL OR trajectorySegments IS NOT NULL)
            AND COALESCE(sourceGeneratedAt, parsedAt, createdAt) < ${cutoffDate}
          LIMIT ${batchSize}
        `
      : await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM SquadMatchTelemetry 
          WHERE positionSamples IS NOT NULL OR trajectorySegments IS NOT NULL 
          LIMIT ${batchSize}
        `

    if (!candidateRows || candidateRows.length === 0) {
      return Response.json({
        ok: true,
        purgedInBatch: 0,
        remaining: 0,
        done: true,
      })
    }

    const ids = candidateRows.map((r) => r.id)

    // 2. Perform fast primary key update
    await prisma.$executeRaw`
      UPDATE SquadMatchTelemetry 
      SET positionSamples = NULL, trajectorySegments = NULL 
      WHERE id IN (${Prisma.join(ids)})
    `

    // 3. Count remaining
    const remainingRes = cutoffDate
      ? await prisma.$queryRaw<Array<{ remaining: bigint }>>`
          SELECT COUNT(*) as remaining FROM SquadMatchTelemetry 
          WHERE (positionSamples IS NOT NULL OR trajectorySegments IS NOT NULL)
            AND COALESCE(sourceGeneratedAt, parsedAt, createdAt) < ${cutoffDate}
        `
      : await prisma.$queryRaw<Array<{ remaining: bigint }>>`
          SELECT COUNT(*) as remaining FROM SquadMatchTelemetry 
          WHERE positionSamples IS NOT NULL OR trajectorySegments IS NOT NULL
        `
    const remaining = Number(remainingRes[0]?.remaining ?? 0)

    return Response.json({
      ok: true,
      purgedInBatch: ids.length,
      remaining,
      done: remaining === 0,
    })
  } catch (err: any) {
    console.error('Error purging telemetry chunk:', err)
    return Response.json({ error: err.message || 'Erreur lors de la purge' }, { status: 500 })
  }
}
