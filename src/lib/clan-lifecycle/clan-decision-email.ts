import { sendEmail } from '@/lib/email-service'

/**
 * Notification par email de la décision SuperUser sur une demande de création de
 * clan — chantier 4.
 *
 * `SMTP_URL` est optionnel : sans lui, `email-service` bascule en mode `stub` et
 * rien ne part réellement. Ce n'est pas une erreur, et surtout ça ne doit jamais
 * faire échouer l'approbation ou le refus — la décision reste visible dans l'UI
 * SuperUser quoi qu'il arrive.
 */

export type ClanDecisionEmailResult =
  | { sent: true }
  | { sent: false; reason: 'no_contact' | 'failed'; error?: string }

type ClanDecisionInput = {
  contactEmail: string | null
  clanName: string
  clanTag: string
  playerName: string
}

export async function sendClanApprovedEmail(
  input: ClanDecisionInput
): Promise<ClanDecisionEmailResult> {
  if (!input.contactEmail) {
    return { sent: false, reason: 'no_contact' }
  }

  try {
    await sendEmail({
      to: input.contactEmail,
      subject: `Votre clan [${input.clanTag}] ${input.clanName} a été validé`,
      text:
        `Bonjour ${input.playerName},\n\n` +
        `Votre demande de création du clan "${input.clanName}" [${input.clanTag}] a été validée.\n` +
        `Le clan est désormais actif : ses matchs, statistiques et télémétrie sont suivis.\n\n` +
        `Vous en êtes le propriétaire (Owner) et pouvez dès maintenant y ajouter vos membres.\n`,
    })
    return { sent: true }
  } catch (error) {
    return { sent: false, reason: 'failed', error: error instanceof Error ? error.message : 'inconnu' }
  }
}

export async function sendClanRejectedEmail(
  input: ClanDecisionInput & { reason?: string | null }
): Promise<ClanDecisionEmailResult> {
  if (!input.contactEmail) {
    return { sent: false, reason: 'no_contact' }
  }

  try {
    await sendEmail({
      to: input.contactEmail,
      subject: `Votre demande de clan [${input.clanTag}] ${input.clanName} n'a pas été retenue`,
      text:
        `Bonjour ${input.playerName},\n\n` +
        `Votre demande de création du clan "${input.clanName}" [${input.clanTag}] n'a pas été retenue.\n` +
        (input.reason ? `\nMotif : ${input.reason}\n` : '') +
        `\nVous pouvez soumettre une nouvelle demande, ou rejoindre un clan déjà présent sur le site.\n`,
    })
    return { sent: true }
  } catch (error) {
    return { sent: false, reason: 'failed', error: error instanceof Error ? error.message : 'inconnu' }
  }
}
