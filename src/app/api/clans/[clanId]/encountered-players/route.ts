import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)

  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const roleError = await requireRole(['Owner', 'Admin'])(request, {
    clanId: parsedClanId,
  })

  if (roleError) {
    return roleError
  }

  try {
    const rows = await prisma.encounteredPlayer.findMany({
      where: { clanId: parsedClanId },
      orderBy: [{ encounterCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: 300,
    })

    const resolvedClanTags = new Map<string, number>()
    let resolvedCount = 0

    for (const row of rows) {
      if (row.clanResolvedAt) {
        resolvedCount += 1
      }

      if (row.pubgClanTag) {
        resolvedClanTags.set(row.pubgClanTag, (resolvedClanTags.get(row.pubgClanTag) ?? 0) + row.encounterCount)
      }
    }

    const topRivalClans = Array.from(resolvedClanTags.entries())
      .map(([tag, encounterCount]) => ({ tag, encounterCount }))
      .sort((left, right) => right.encounterCount - left.encounterCount)
      .slice(0, 5)

    return Response.json({
      data: {
        summary: {
          totalPlayers: rows.length,
          resolvedCount,
          pendingCount: rows.length - resolvedCount,
          distinctClansIdentified: resolvedClanTags.size,
        },
        topRivalClans,
        players: rows.map((row) => ({
          id: row.id,
          pubgAccountId: row.pubgAccountId,
          pubgPlayerName: row.pubgPlayerName,
          pubgClanTag: row.pubgClanTag,
          pubgClanName: row.pubgClanName,
          clanResolvedAt: row.clanResolvedAt ? row.clanResolvedAt.toISOString() : null,
          encounterCount: row.encounterCount,
          firstSeenAt: row.firstSeenAt.toISOString(),
          lastSeenAt: row.lastSeenAt.toISOString(),
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching encountered players:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
