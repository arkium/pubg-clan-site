import { PENDING_CLAN_WHERE } from '@/lib/clan-archive-state'
import { countPendingPromotionsForClan } from '@/lib/clan-lifecycle/pending-promotions'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * Onglet « Clans en attente » — chantier 5, complété par le chantier 4.
 *
 * `GET /api/clans?all=true` ne suffisait pas : il ne porte ni le demandeur, ni son
 * email de contact, ni le nombre de joueurs qui attendent l'activation de ce clan.
 * Ces trois informations sont ce qui permet de décider en connaissance de cause.
 */

export async function GET(request: Request) {
  try {
    const permissionError = await requireSuperUser(request)
    if (permissionError) return permissionError

    // `archivedAt: null` : un clan archivé (suivi arrêté ou demande refusée) a lui aussi
    // isActive = false, mais n'attend plus aucune décision (docs/TODO/clan-archive.md §3).
    const clans = await prisma.clan.findMany({
      where: PENDING_CLAN_WHERE,
      select: {
        id: true,
        name: true,
        tag: true,
        platformShard: true,
        pubgClanId: true,
        createdAt: true,
        members: {
          select: {
            id: true,
            displayName: true,
            pubgPlayerName: true,
            contactEmail: true,
            joinStatus: true,
            roles: { select: { role: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const enriched = await Promise.all(
      clans.map(async (clan) => {
        const owner = clan.members.find((m) => m.roles.some((r) => r.role.name === 'Owner'))
        const pendingPromotions = await countPendingPromotionsForClan(clan.id)

        return {
          id: clan.id,
          name: clan.name,
          tag: clan.tag,
          platformShard: clan.platformShard,
          createdAt: clan.createdAt.toISOString(),
          // Un clan cree par la detection automatique n'a pas de demandeur : il a
          // ete decouvert, pas demande. La distinction change la decision.
          origin: owner ? 'join_request' : 'auto_detected',
          requester: owner
            ? {
                memberId: owner.id,
                playerName: owner.pubgPlayerName,
                contactEmail: owner.contactEmail,
                joinStatus: owner.joinStatus,
              }
            : null,
          /** Joueurs qui rejoindront ce clan dès son activation (cas B du chantier 2). */
          pendingPromotions,
        }
      })
    )

    return Response.json({ clans: enriched })
  } catch (error) {
    console.error('Error loading pending clans:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
