import { NextRequest } from 'next/server'
import { readdir, unlink } from 'node:fs/promises'
import path from 'node:path'

import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function sanitizeSquadMatchIds(ids: string[]) {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)))
  return unique.slice(0, 50)
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function resolveCaptureOutputDir() {
  const configuredDir = process.env.TELEMETRY_CAPTURE_FIXTURES_DIR?.trim()
  return configuredDir && configuredDir.length > 0
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), configuredDir)
    : path.join(
        /*turbopackIgnore: true*/ process.cwd(),
        'src',
        'lib',
        'pubg-telemetry',
        '__fixtures__',
        'captured'
      )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    const body = (await request.json().catch(() => null)) as
      | { squadMatchIds?: unknown }
      | null

    if (!Array.isArray(body?.squadMatchIds)) {
      return Response.json({ error: 'squadMatchIds must be an array' }, { status: 400 })
    }

    const squadMatchIds = sanitizeSquadMatchIds(
      body.squadMatchIds.filter((value): value is string => typeof value === 'string')
    )

    if (squadMatchIds.length === 0) {
      return Response.json({ error: 'No squad match selected' }, { status: 400 })
    }

    const allowedMatches = await prisma.squadMatch.findMany({
      where: {
        id: { in: squadMatchIds },
        members: {
          some: {
            member: {
              clanId: parsedClanId,
            },
          },
        },
      },
      select: {
        id: true,
        pubgMatchId: true,
      },
    })

    const allowedIds = allowedMatches.map((match) => match.id)

    const existingSuccessRows = await prisma.squadMatchTelemetry.findMany({
      where: {
        squadMatchId: { in: allowedIds },
        status: 'success',
      },
      select: {
        squadMatchId: true,
      },
    })

    const existingSuccessIds = existingSuccessRows.map((row) => row.squadMatchId)

    const deleted =
      existingSuccessIds.length > 0
        ? await prisma.squadMatchTelemetry.deleteMany({
            where: {
              squadMatchId: { in: existingSuccessIds },
              status: 'success',
            },
          })
        : { count: 0 }

    const captureDir = resolveCaptureOutputDir()
    let deletedFileCount = 0

    try {
      const allEntries = await readdir(captureDir, { withFileTypes: true })
      const files = allEntries.filter((entry) => entry.isFile()).map((entry) => entry.name)

      const matchFileTargets = new Set<string>()
      for (const match of allowedMatches) {
        const safeSquadMatchId = sanitizeFileSegment(match.id)
        const safePubgMatchId = sanitizeFileSegment(match.pubgMatchId)
        const token = `-${safePubgMatchId}-${safeSquadMatchId}.json`

        for (const fileName of files) {
          if (fileName.endsWith(token)) {
            matchFileTargets.add(fileName)
          }
        }
      }

      for (const fileName of matchFileTargets) {
        await unlink(path.join(/*turbopackIgnore: true*/ captureDir, fileName))
        deletedFileCount += 1
      }
    } catch {
      // Ignore missing capture directory or transient file deletion errors.
    }

    return Response.json({
      ok: true,
      clanId: parsedClanId,
      requestedCount: body.squadMatchIds.length,
      selectedCount: squadMatchIds.length,
      allowedCount: allowedIds.length,
      deletedCount: deleted.count,
      deletedFileCount,
      alreadyMissingCount: Math.max(0, allowedIds.length - existingSuccessIds.length),
      outOfScopeCount: Math.max(0, squadMatchIds.length - allowedIds.length),
      statusCleared: 'success',
    })
  } catch (error) {
    console.error('Clear telemetry selected failed:', error)
    return Response.json(
      { error: 'Failed to clear telemetry for selected matches' },
      { status: 500 }
    )
  }
}
