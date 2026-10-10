import { sendEmail } from '@/lib/email-service'

/**
 * Notification par email des décisions sur les demandes de la page d'inscription (`/join`) — chantier 4, étendu le
 * 2026-10-09 : inscription d'un clan (décision du SuperUser) et demande d'accès à un clan déjà suivi (décision de son
 * Owner). Une demande peut venir d'un visiteur sans compte : l'acceptation lui envoie alors le lien de création de son
 * compte (`activationUrl`, invitation créée par `src/lib/join-request-access.ts`).
 *
 * `SMTP_URL` est optionnel : sans lui, `email-service` bascule en mode `stub` et rien ne part réellement — le résultat
 * le dit (`not_delivered`) pour que l'interface invite à renvoyer l'invitation à la main. Un email ne fait jamais échouer
 * l'approbation ou le refus : la décision reste visible dans l'interface quoi qu'il arrive.
 */

export type ClanDecisionEmailResult =
  | { sent: true }
  | { sent: false; reason: 'no_contact' | 'failed' | 'not_delivered'; error?: string }

type ClanDecisionInput = {
  contactEmail: string | null
  clanName: string
  clanTag: string
  playerName: string
}

type AccessInput = ClanDecisionInput & {
  /** Lien de création du compte (invitation), absent quand le demandeur a déjà un compte. */
  activationUrl?: string | null
}

/** Durée de validité d'une invitation (`INVITE_TTL_MS` de `auth-service.ts`), écrite dans les emails. */
export const INVITE_VALIDITY_LABEL = '48 heures'

async function deliver(contactEmail: string | null, subject: string, text: string): Promise<ClanDecisionEmailResult> {
  if (!contactEmail) {
    return { sent: false, reason: 'no_contact' }
  }

  try {
    const result = await sendEmail({ to: contactEmail, subject, text })
    // Mode stub (SMTP absent) : rien n'est parti, l'interface doit le savoir.
    if (result && result.delivered === false) {
      return { sent: false, reason: 'not_delivered' }
    }
    return { sent: true }
  } catch (error) {
    return { sent: false, reason: 'failed', error: error instanceof Error ? error.message : 'inconnu' }
  }
}

function accountParagraph(activationUrl: string | null | undefined, role: 'owner' | 'member') {
  if (!activationUrl) {
    return `Connectez-vous avec votre compte pour retrouver ${role === 'owner' ? 'la gestion de votre clan' : 'votre espace'}.\n`
  }
  return (
    `Pour créer votre compte${role === 'owner' ? ' d’Owner' : ''}, choisissez votre mot de passe avec ce lien ` +
    `(valable ${INVITE_VALIDITY_LABEL}) :\n${activationUrl}\n\n` +
    `Lien expiré ? ${role === 'owner' ? 'Écrivez à l’équipe du site' : 'Demandez à l’Owner du clan'} de vous renvoyer une invitation.\n`
  )
}

export async function sendClanApprovedEmail(input: AccessInput): Promise<ClanDecisionEmailResult> {
  return deliver(
    input.contactEmail,
    `Votre clan [${input.clanTag}] ${input.clanName} a été validé`,
    `Bonjour ${input.playerName},\n\n` +
      `Votre demande d'inscription du clan "${input.clanName}" [${input.clanTag}] a été validée.\n` +
      `Le clan est désormais suivi : ses matchs, statistiques et télémétrie arrivent sur le site.\n\n` +
      `Vous en êtes le propriétaire (Owner) et pouvez y ajouter vos membres.\n\n` +
      accountParagraph(input.activationUrl, 'owner')
  )
}

export async function sendClanRejectedEmail(
  input: ClanDecisionInput & { reason?: string | null }
): Promise<ClanDecisionEmailResult> {
  return deliver(
    input.contactEmail,
    `Votre demande de clan [${input.clanTag}] ${input.clanName} n'a pas été retenue`,
    `Bonjour ${input.playerName},\n\n` +
      `Votre demande d'inscription du clan "${input.clanName}" [${input.clanTag}] n'a pas été retenue.\n` +
      (input.reason ? `\nMotif : ${input.reason}\n` : '') +
      `\nVous pouvez soumettre une nouvelle demande depuis la page d'inscription du site.\n`
  )
}

/** Demande d'accès à un clan déjà suivi, acceptée par son Owner. */
export async function sendMemberApprovedEmail(input: AccessInput): Promise<ClanDecisionEmailResult> {
  return deliver(
    input.contactEmail,
    `Votre accès au clan [${input.clanTag}] ${input.clanName} est validé`,
    `Bonjour ${input.playerName},\n\n` +
      `L'Owner du clan "${input.clanName}" [${input.clanTag}] a accepté votre demande : vous en êtes membre sur le site.\n\n` +
      accountParagraph(input.activationUrl, 'member')
  )
}

/** Demande d'accès à un clan déjà suivi, refusée par son Owner. */
export async function sendMemberRejectedEmail(input: ClanDecisionInput): Promise<ClanDecisionEmailResult> {
  return deliver(
    input.contactEmail,
    `Votre demande pour le clan [${input.clanTag}] ${input.clanName} n'a pas été retenue`,
    `Bonjour ${input.playerName},\n\n` +
      `L'Owner du clan "${input.clanName}" [${input.clanTag}] n'a pas accepté votre demande d'accès.\n` +
      `S'il s'agit d'une erreur, contactez-le directement en jeu ou sur le Discord du clan.\n`
  )
}
