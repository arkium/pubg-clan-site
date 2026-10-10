import { createMemberInvite } from '@/lib/auth-service'
import type { ClanDecisionEmailResult } from '@/lib/clan-lifecycle/clan-decision-email'
import { prisma } from '@/lib/prisma'

/**
 * Demandes de la page d'inscription (`/join`) envoyées sans compte — décision du 2026-10-09 (docs/features/clans.md,
 * « Ajout d'un membre — flux auto-inscription »). Le site ne crée un compte que sur invitation : l'acceptation d'une
 * demande (Owner pour un clan déjà suivi, SuperUser pour un nouveau clan) crée cette invitation vers l'adresse de contact
 * laissée par le demandeur, et l'email de décision porte le lien de création du compte.
 */

/** Demandes en attente au plus par adresse de contact : borne les demandes anonymes répétées. */
export const JOIN_PENDING_PER_EMAIL_LIMIT = 3

export type RequesterInvitation =
  | { status: 'invited'; email: string; activationUrl: string }
  | { status: 'has_account' }
  | { status: 'no_contact' }
  | { status: 'failed'; email: string; reason: string }

/**
 * Invitation du demandeur accepté, quand il n'a pas encore de compte. À appeler **après** l'activation du membre :
 * l'activation d'un compte refuse un membre inactif. L'invitation n'envoie pas son propre email (`sendEmail: false`) :
 * le lien part dans l'email de décision, un seul message pour le demandeur.
 */
export async function inviteApprovedRequester(params: {
  clanId: number
  memberId: number
  contactEmail: string | null
  invitedByUserId: number | null
  invitedByMemberId: number | null
}): Promise<RequesterInvitation> {
  const identity = await prisma.memberIdentity.findUnique({
    where: { memberId: params.memberId },
    select: { userId: true },
  })
  if (identity) return { status: 'has_account' }

  const email = params.contactEmail?.trim()
  if (!email) return { status: 'no_contact' }

  try {
    const invite = await createMemberInvite({
      clanId: params.clanId,
      memberId: params.memberId,
      email,
      invitedByUserId: params.invitedByUserId,
      invitedByMemberId: params.invitedByMemberId,
      sendEmail: false,
    })
    return { status: 'invited', email, activationUrl: invite.activationUrl }
  } catch (error) {
    return { status: 'failed', email, reason: error instanceof Error ? error.message : 'inconnu' }
  }
}

/** Lien de création du compte à glisser dans l'email de décision (absent sans invitation). */
export function activationUrlOf(invitation: RequesterInvitation) {
  return invitation.status === 'invited' ? invitation.activationUrl : null
}

/**
 * Phrase ajoutée au message de l'acceptation, pour l'Owner ou le SuperUser : l'invitation est-elle partie, et sinon
 * que faire (la liste des membres du clan sait renvoyer une invitation).
 */
export function invitationNotice(invitation: RequesterInvitation, email: ClanDecisionEmailResult) {
  switch (invitation.status) {
    case 'invited':
      return email.sent
        ? `Lien de création du compte envoyé à ${invitation.email}.`
        : `L'email n'a pas pu partir : renvoyez l'invitation depuis la liste des membres du clan.`
    case 'failed':
      return `L'invitation n'a pas pu être créée : envoyez-la depuis la liste des membres du clan.`
    case 'has_account':
      return email.sent ? 'Il a déjà un compte ; il est prévenu par email.' : 'Il a déjà un compte.'
    case 'no_contact':
      return 'Aucune adresse de contact : invitez-le depuis la liste des membres du clan pour qu’il crée son compte.'
  }
}
