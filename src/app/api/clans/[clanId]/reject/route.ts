import { z } from 'zod'

import { CLAN_ARCHIVE_REASONS } from '@/lib/clan-archive-state'
import { sendClanRejectedEmail } from '@/lib/clan-lifecycle/clan-decision-email'
import { PLAYER_CLAN_CHANGE_STATUSES } from '@/lib/player-clan-change'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * Refus d'une demande de création de clan — chantier 4.
 *
 * Pendant du `approve` existant, qui n'avait pas de contrepartie : un clan en
 * attente ne pouvait jusqu'ici qu'être validé ou rester indéfiniment en suspens.
 *
 * Le clan **n'est pas supprimé** : il reste inactif, avec son historique, et passe
 * archivé (`archivedReason: 'rejected'`) pour quitter la liste d'attente. Le
 * demandeur passe en `joinStatus: 'rejected'`, un état qui autorise explicitement
 * la ré-adhésion (voir « Cycle de vie des membres rejetés » en P1) : une nouvelle
 * demande `/join` remet le clan en attente (`decideJoinTarget`).
 */

const RejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

function parsePositiveInt(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  try {
    const superUserError = await requireSuperUser(request)
    if (superUserError) return superUserError

    const { clanId } = await params
    const parsedClanId = parsePositiveInt(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'ID de clan invalide' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const { reason } = RejectSchema.parse(body ?? {})

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      include: {
        members: { include: { roles: { include: { role: true } } } },
      },
    })

    if (!clan) {
      return Response.json({ error: 'Clan introuvable' }, { status: 404 })
    }

    if (clan.isActive) {
      return Response.json(
        { error: "Ce clan est déjà actif : il ne peut plus être refusé." },
        { status: 409 }
      )
    }

    if (clan.isSystem) {
      return Response.json(
        { error: "Le clan technique du site ne peut pas être refusé." },
        { status: 400 }
      )
    }

    if (clan.archivedAt) {
      return Response.json(
        { error: 'Ce clan est déjà archivé : il n’attend plus de décision.', code: 'clan_archived' },
        { status: 409 }
      )
    }

    const owner = clan.members.find((m) => m.roles.some((r) => r.role.name === 'Owner'))

    // Le demandeur passe en `rejected` — etat qui autorise une nouvelle demande —
    // plutot que d'etre supprime.
    if (owner) {
      await prisma.clanMember.update({
        where: { id: owner.id },
        data: { isActive: false, joinStatus: 'rejected' },
      })
    }

    // Les mouvements que le cron avait laisses en attente vers ce clan n'ont plus
    // lieu d'etre : on les clot sans deplacer personne.
    const { count: closedPromotions } = await prisma.playerClanChange.updateMany({
      where: { newClanId: parsedClanId, status: PLAYER_CLAN_CHANGE_STATUSES.pending },
      data: { status: PLAYER_CLAN_CHANGE_STATUSES.ignored },
    })

    // Le clan sort de la liste d'attente : sans cet état final, un clan refusé y restait
    // indéfiniment (docs/TODO/clan-archive.md §3). Écrit en dernier : si une étape
    // précédente échoue, le clan reste en attente et le refus peut être rejoué.
    await prisma.clan.update({
      where: { id: parsedClanId },
      data: { archivedAt: new Date(), archivedReason: CLAN_ARCHIVE_REASONS.rejected },
    })

    // Hors chemin critique : un SMTP absent ou en panne ne doit pas empecher le refus.
    const emailResult = await sendClanRejectedEmail({
      contactEmail: owner?.contactEmail ?? null,
      clanName: clan.name,
      clanTag: clan.tag,
      playerName: owner?.pubgPlayerName ?? 'joueur',
      reason: reason ?? null,
    }).catch((error) => {
      console.error('[clan-reject] Email failed:', error)
      return { sent: false as const, reason: 'failed' as const }
    })

    return Response.json({
      success: true,
      message:
        `La demande du clan "${clan.name}" a été refusée.` +
        (closedPromotions > 0 ? ` ${closedPromotions} mouvement(s) en attente annulé(s).` : '') +
        (emailResult.sent
          ? ' Le demandeur a été notifié par email.'
          : ' Aucun email envoyé (contact absent ou SMTP non configuré).'),
      emailSent: emailResult.sent,
      closedPromotions,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Requête invalide', details: error.issues }, { status: 400 })
    }
    console.error('Error rejecting clan:', error)
    return Response.json({ error: 'Erreur lors du refus du clan' }, { status: 500 })
  }
}
