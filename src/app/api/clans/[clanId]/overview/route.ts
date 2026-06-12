import { prisma } from '@/lib/prisma'
import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'

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

    const permissionError = await requirePermission('manage_members')(request, {
      clanId: parsedClanId,
      allowMissingActor: true,
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
            identities: { select: { id: true } },
            lifetimeStats: { select: { lastRefreshedAt: true } },
          },
        },
      },
    })

    if (!clan) {
      return Response.json({ error: 'Clan not found' }, { status: 404 })
    }

    const roster = clan.members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      pubgPlayerName: member.pubgPlayerName,
      pubgAccountId: member.pubgAccountId,
      role: resolvePrimaryRole(member.roles.map((r) => r.role.name)),
      joinedAt: member.createdAt,
      hasAccount: member.identities.length > 0,
      lastRefreshedAt: member.lifetimeStats?.lastRefreshedAt ?? null,
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
