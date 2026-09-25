import { ARCHIVED_CLAN_WHERE } from '@/lib/clan-archive-state'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * Onglet « Clans archivés » — docs/TODO/clan-archive.md §4.C.
 *
 * Les clans qu'on ne suit plus (décision SuperUser) ou dont la demande a été refusée. La
 * réactivation passe par `PATCH /api/settings/clans/[id]`.
 */
export async function GET(request: Request) {
  try {
    const permissionError = await requireSuperUser(request)
    if (permissionError) return permissionError

    const clans = await prisma.clan.findMany({
      where: ARCHIVED_CLAN_WHERE,
      select: {
        id: true,
        name: true,
        tag: true,
        platformShard: true,
        archivedAt: true,
        archivedReason: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
      orderBy: { archivedAt: 'desc' },
    })

    return Response.json({
      clans: clans.map((clan) => ({
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        platformShard: clan.platformShard,
        archivedAt: clan.archivedAt?.toISOString() ?? null,
        archivedReason: clan.archivedReason,
        createdAt: clan.createdAt.toISOString(),
        // Fiches encore rattachées : membres désactivés, ou demandeur d'un clan refusé.
        attachedMembers: clan._count.members,
      })),
    })
  } catch (error) {
    console.error('Error loading archived clans:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
