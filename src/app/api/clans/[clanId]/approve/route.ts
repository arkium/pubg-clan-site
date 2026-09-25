import { getSessionFromRequest } from '@/lib/auth-session'
import { sendClanApprovedEmail } from '@/lib/clan-lifecycle/clan-decision-email'
import { applyPendingPromotionsForClan } from '@/lib/clan-lifecycle/pending-promotions'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'
import { createNotificationForMember } from '@/lib/notification-service'

function parsePositiveInt(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const superUserError = await requireSuperUser(request)
    if (superUserError) {
      return superUserError
    }

    const { clanId } = await params
    const parsedClanId = parsePositiveInt(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'ID de clan invalide' }, { status: 400 })
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      include: {
        members: {
          include: {
            roles: {
              include: { role: true },
            },
          },
        },
      },
    })

    if (!clan) {
      return Response.json({ error: 'Clan introuvable' }, { status: 404 })
    }

    // Un clan archivé n'attend plus de validation : la réactivation a sa propre action, qui
    // ne réactive ni l'ancien Owner ni des promotions closes (docs/TODO/clan-archive.md §4.B).
    if (clan.archivedAt) {
      return Response.json(
        {
          error: "Ce clan n'est plus suivi : réactivez-le depuis l'onglet « Clans archivés » du cycle de vie.",
          code: 'clan_archived',
        },
        { status: 409 }
      )
    }

    // Activer le clan
    const updatedClan = await prisma.clan.update({
      where: { id: parsedClanId },
      data: { isActive: true },
    })

    // Chantier 2 : le clan vient d'entrer dans la ligue, les mouvements que le cron
    // avait laisses en attente peuvent maintenant s'appliquer. Hors transaction de
    // l'activation : un echec ici ne doit pas empecher le clan d'exister.
    let appliedPromotions: Awaited<ReturnType<typeof applyPendingPromotionsForClan>> = []
    try {
      const session = await getSessionFromRequest(request)
      appliedPromotions = await applyPendingPromotionsForClan(parsedClanId, session?.userId ?? null)
    } catch (promotionError) {
      console.error('[clan-approve] Failed to apply pending promotions:', promotionError)
    }

    // Activer le(s) membre(s) Owner en attente
    const ownerMember = clan.members.find((m) =>
      m.roles.some((r) => r.role.name === 'Owner')
    )

    if (ownerMember) {
      await prisma.clanMember.update({
        where: { id: ownerMember.id },
        data: {
          isActive: true,
          joinStatus: 'active',
        },
      })

      // Notifier le créateur du clan
      await createNotificationForMember({
        memberId: ownerMember.id,
        type: 'join_request',
        title: 'Votre clan a été validé !',
        message: `Félicitations ! Votre clan "${clan.name}" [${clan.tag}] a été validé par le SuperUser et est désormais actif dans la ligue.`,
        data: {
          clanId: clan.id,
          clanName: clan.name,
        },
      }).catch((err: unknown) => console.error('[clan-approve] Error notifying owner:', err))
    }

    // Chantier 4 : prevenir le demandeur. Hors chemin critique — un SMTP absent ne
    // doit pas empecher l'activation du clan, qui est deja faite a ce stade.
    const emailResult = await sendClanApprovedEmail({
      contactEmail: ownerMember?.contactEmail ?? null,
      clanName: updatedClan.name,
      clanTag: updatedClan.tag,
      playerName: ownerMember?.pubgPlayerName ?? 'joueur',
    }).catch((emailError) => {
      console.error('[clan-approve] Email failed:', emailError)
      return { sent: false as const, reason: 'failed' as const }
    })

    const promotionSuffix =
      appliedPromotions.length > 0
        ? ` ${appliedPromotions.length} joueur(s) en attente y ont été rattachés : ${appliedPromotions
            .map((p) => p.memberName)
            .join(', ')}.`
        : ''

    return Response.json({
      success: true,
      message: `Le clan "${updatedClan.name}" a été validé et activé avec succès dans la ligue.${promotionSuffix}`,
      clan: {
        id: updatedClan.id,
        name: updatedClan.name,
        tag: updatedClan.tag,
        isActive: updatedClan.isActive,
      },
      appliedPromotions,
      emailSent: emailResult.sent,
    })
  } catch (error) {
    console.error('Error approving clan:', error)
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ error: 'Erreur lors de la validation du clan' }, { status: 500 })
  }
}
