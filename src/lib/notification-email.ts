import { SITE_DOMAIN } from '@/lib/legal/legal-info'
import { notificationUnsubscribeLinks } from '@/lib/notification-unsubscribe'
import { siteUrl } from '@/lib/seo/page-seo'

/**
 * E-mail d'une notification — texte brut, comme les autres e-mails du site. Une seule fonction pour l'envoi
 * (`notification-service.ts`) et pour l'aperçu de la page des préférences (route GET des préférences) : l'aperçu montre
 * exactement ce qui part, liens compris.
 *
 * Pied de l'e-mail : la raison de l'envoi, le lien vers les préférences et — si un secret de lien est configuré — le lien
 * « Ne plus recevoir ces e-mails », doublé des en-têtes `List-Unsubscribe` / `List-Unsubscribe-Post` (désabonnement en
 * un clic depuis la messagerie, RFC 8058).
 */

export type NotificationEmail = {
  subject: string
  text: string
  headers: Record<string, string>
}

/** Exemple montré dans la page des préférences : une partie en escouade, telle que `notifySquadDetected` l'écrit. */
export const NOTIFICATION_EMAIL_EXAMPLE = {
  title: 'Nouvelle partie en escouade',
  message: 'Ton escouade a joué ensemble sur Erangel — top 3.',
}

export function buildNotificationEmail(
  input: { memberId: number; displayName: string; title: string; message: string },
  base: URL = siteUrl(),
  unsubscribe = notificationUnsubscribeLinks(input.memberId, base)
): NotificationEmail {
  const notificationsUrl = new URL(`/members/${input.memberId}/notifications`, base).toString()
  const preferencesUrl = new URL(`/members/${input.memberId}/notification-preferences`, base).toString()

  const text = [
    `Bonjour ${input.displayName},`,
    '',
    input.title,
    input.message,
    '',
    `Voir mes notifications : ${notificationsUrl}`,
    '',
    '—',
    `Tu reçois cet e-mail parce que les notifications par e-mail sont activées pour ${input.displayName} sur ${SITE_DOMAIN}.`,
    `Choisir ce qui te prévient : ${preferencesUrl}`,
    ...(unsubscribe ? [`Ne plus recevoir ces e-mails : ${unsubscribe.pageUrl}`] : []),
  ].join('\n')

  return {
    subject: input.title,
    text,
    headers: unsubscribe
      ? { 'List-Unsubscribe': `<${unsubscribe.oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      : {},
  }
}
