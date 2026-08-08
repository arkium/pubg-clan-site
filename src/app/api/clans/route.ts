import { prisma } from '@/lib/prisma'

/**
 * GET /api/clans
 * Récupère tous les clans actifs avec agrégats
 */
export async function GET() {
  try {
    const clans = await prisma.clan.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            members: {
              where: { isActive: true },
            },
          },
        },
      },
    })

    const activeMembers = await prisma.clanMember.findMany({
      where: { isActive: true, clanId: { not: null } },
      select: { id: true, clanId: true },
    })

    const memberClanById = new Map(activeMembers.map((member) => [member.id, member.clanId]))

    const matchAggregates = await prisma.match.groupBy({
      by: ['memberId'],
      where: { memberId: { in: activeMembers.map((member) => member.id) } },
      _count: { _all: true },
      _max: { pubgCreatedAt: true },
    })

    const playerStats = await prisma.playerStats.findMany({
      where: {
        period: 'all-time',
        member: { isActive: true, clanId: { not: null } },
      },
      select: {
        member: { select: { clanId: true } },
        timePlayedSeconds: true,
        activeDays: true,
      },
    })

    const statsByClanId = new Map<number, { matchesCount: number; lastMatchAt: Date | null; timePlayedSeconds: number; activeDays: number }>()
    for (const aggregate of matchAggregates) {
      const clanId = memberClanById.get(aggregate.memberId)
      if (clanId === null || clanId === undefined) {
        continue
      }

      const current = statsByClanId.get(clanId) ?? { matchesCount: 0, lastMatchAt: null, timePlayedSeconds: 0, activeDays: 0 }
      current.matchesCount += aggregate._count._all
      const aggregateLastMatch = aggregate._max.pubgCreatedAt
      if (aggregateLastMatch && (!current.lastMatchAt || aggregateLastMatch > current.lastMatchAt)) {
        current.lastMatchAt = aggregateLastMatch
      }
      statsByClanId.set(clanId, current)
    }
    
    for (const ps of playerStats) {
      if (!ps.member?.clanId) continue
      const clanId = ps.member.clanId
      const current = statsByClanId.get(clanId) ?? { matchesCount: 0, lastMatchAt: null, timePlayedSeconds: 0, activeDays: 0 }
      current.timePlayedSeconds += ps.timePlayedSeconds
      current.activeDays = Math.max(current.activeDays, ps.activeDays) // Approximation for clan active days based on max member active days
      statsByClanId.set(clanId, current)
    }

    const clansWithStats = clans.map((clan) => {
      const stats = statsByClanId.get(clan.id) ?? { matchesCount: 0, lastMatchAt: null, timePlayedSeconds: 0, activeDays: 0 }

      return {
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        platformShard: clan.platformShard,
        membersCount: clan._count.members,
        matchesCount: stats.matchesCount,
        lastMatchAt: stats.lastMatchAt ? stats.lastMatchAt.toISOString() : null,
        timePlayedSeconds: stats.timePlayedSeconds,
        activeDays: stats.activeDays,
      }
    })

    return Response.json(clansWithStats)
  } catch (error) {
    console.error('Error fetching clans:', error)
    return Response.json({ error: 'Failed to fetch clans' }, { status: 500 })
  }
}
