import { prisma } from '@/lib/prisma'
import { calculateLifetimeMedalCounts } from '@/lib/lifetime-medals'
import { getActorMemberId, requireNavPermission } from '@/middleware/auth-permission'

const ROLE_PRIORITY: Record<string, number> = {
  Owner: 4,
  Admin: 3,
  Moderator: 2,
  Member: 1,
}

function resolvePrimaryRole(roleNames: string[]) {
  if (roleNames.length === 0) return 'Member'
  return [...roleNames].sort((a, b) => (ROLE_PRIORITY[b] ?? 0) - (ROLE_PRIORITY[a] ?? 0))[0]
}

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requireNavPermission('clan.overview')(request, {
      clanId: parsedClanId,
    })
    if (permissionError) return permissionError

    const actorMemberId = await getActorMemberId(request)
    if (!actorMemberId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: {
        id: true,
        name: true,
        tag: true,
        pubgClanId: true,
        platformShard: true,
        clanStats: true,
        members: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            displayName: true,
            pubgPlayerName: true,
            pubgAccountId: true,
            createdAt: true,
            roles: {
              include: { role: { select: { name: true } } },
              orderBy: { assignedAt: 'desc' },
            },
            identities: {
              select: {
                id: true,
                user: { select: { avatarUrl: true } },
              },
              take: 1,
            },
            lifetimeStats: {
              select: {
                lastRefreshedAt: true,
                combat: true,
                victory: true,
                support: true,
                vehicle: true,
                movement: true,
                other: true,
              },
            },
          },
        },
      },
    })

    if (!clan) {
      return Response.json({ error: 'Clan not found' }, { status: 404 })
    }

    const medalCountsByMemberId = calculateLifetimeMedalCounts(
      clan.members.flatMap((member) =>
        member.lifetimeStats
          ? [{
              memberId: member.id,
              clanId: clan.id,
              combat: member.lifetimeStats.combat as Record<string, number>,
              victory: member.lifetimeStats.victory as Record<string, number>,
              support: member.lifetimeStats.support as Record<string, number>,
              vehicle: member.lifetimeStats.vehicle as Record<string, number>,
              movement: member.lifetimeStats.movement as Record<string, number>,
              other: member.lifetimeStats.other as Record<string, number>,
            }]
          : []
      )
    )

    const roster = clan.members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      pubgPlayerName: member.pubgPlayerName,
      pubgAccountId: member.pubgAccountId,
      role: resolvePrimaryRole(member.roles.map((r) => r.role.name)),
      joinedAt: member.createdAt,
      hasAccount: member.identities.length > 0,
      avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
      lastRefreshedAt: member.lifetimeStats?.lastRefreshedAt ?? null,
      medalCounts: medalCountsByMemberId.get(member.id) ?? { gold: 0, silver: 0, bronze: 0 },
    }))

    return Response.json({
      clan: {
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        pubgClanId: clan.pubgClanId,
        platformShard: clan.platformShard,
      },
      clanStats: clan.clanStats,
      roster,
    })
  } catch (error) {
    console.error('[overview] Error fetching clan overview:', error)
    return Response.json({ error: 'Failed to fetch clan overview' }, { status: 500 })
  }
}
