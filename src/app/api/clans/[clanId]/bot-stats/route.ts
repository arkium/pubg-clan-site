import { prisma } from '@/lib/prisma'
import { requireNavPermission } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type Period = 'week' | 'month' | 'all'

function parsePeriod(value: string | null): Period {
  return value === 'week' || value === 'month' ? value : 'all'
}

function getPeriodStart(period: Period): Date | null {
  if (period === 'week') {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  }

  if (period === 'month') {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  }

  return null
}

// Lecture seule, ouverte à tout membre du clan (même permission que la page
// stats générale) — contrairement à /api/clans/[clanId]/encountered-players
// (Owner/Admin), cet indicateur n'expose aucune donnée sensible sur des
// adversaires, juste une ambiance de lobby.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)

  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const roleError = await requireNavPermission('clan.stats')(request, { clanId: parsedClanId })
  if (roleError) return roleError

  try {
    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get('period'))
    const periodStart = getPeriodStart(period)

    const clanMembers = await prisma.clanMember.findMany({
      where: { clanId: parsedClanId },
      select: { id: true },
    })
    const memberIds = clanMembers.map((member) => member.id)

    const botStats =
      memberIds.length > 0
        ? await prisma.match.aggregate({
            where: {
              memberId: { in: memberIds },
              botCount: { not: null },
              ...(periodStart ? { pubgCreatedAt: { gte: periodStart } } : {}),
            },
            _avg: { botCount: true },
            _count: { botCount: true },
          })
        : null

    return Response.json({
      data: {
        period,
        avgBotsPerMatch: botStats?._avg.botCount ?? null,
        matchesWithData: botStats?._count.botCount ?? 0,
      },
    })
  } catch (error) {
    console.error('Error fetching clan bot stats:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
