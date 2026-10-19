import { adminAlertDefinition, type AdminAlertEvent } from '@/lib/admin-alerts/catalog'
import { getAdminAlertEvents, getAdminAlertMention, getClanLifecycleDiscordWebhookUrl } from '@/lib/clan-lifecycle/config'
import { sendDiscordWebhook, type DiscordEmbed } from '@/lib/discord/discord-client'
import { renderDiscordMention } from '@/lib/discord/discord-config'

/**
 * Envoi d'une alerte au salon Discord d'administration (catalogue : `catalog.ts`, contenu : `messages.ts`).
 *
 * Ne lève jamais : l'alerte suit une action déjà faite (demande enregistrée, passage écrit) qu'un Discord en panne ne
 * doit pas faire échouer. Un événement coupé ou un webhook vide sont des cas normaux, renvoyés comme tels.
 */

export const ADMIN_ALERT_USERNAME = 'Administration'

export type AdminAlertResult =
  | { sent: true; status: number }
  | { sent: false; reason: 'disabled' | 'no_webhook' | 'failed'; error?: string }

export async function sendAdminAlert(
  event: AdminAlertEvent,
  embed: DiscordEmbed,
  options: { username?: string } = {}
): Promise<AdminAlertResult> {
  try {
    const events = await getAdminAlertEvents()
    if (!events[event]) return { sent: false, reason: 'disabled' }

    const webhookUrl = await getClanLifecycleDiscordWebhookUrl()
    if (!webhookUrl) return { sent: false, reason: 'no_webhook' }

    // La mention ne sonne que pour ce qui attend une décision : un compte rendu ne réveille personne.
    const mention = adminAlertDefinition(event).toAct ? renderDiscordMention(await getAdminAlertMention()) : ''

    const result = await sendDiscordWebhook(webhookUrl, {
      username: options.username ?? ADMIN_ALERT_USERNAME,
      ...(mention ? { content: mention } : {}),
      embeds: [{ ...embed, timestamp: embed.timestamp ?? new Date().toISOString() }],
    })

    return result.ok ? { sent: true, status: result.status } : { sent: false, reason: 'failed', error: result.error }
  } catch (error) {
    return { sent: false, reason: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Variante « tire et oublie » pour les routes : n'attend pas Discord (jusqu'à 5 s par tentative) avant de répondre,
 * et note un échec dans le journal du serveur.
 */
export function fireAdminAlert(event: AdminAlertEvent, buildEmbed: () => DiscordEmbed | Promise<DiscordEmbed>) {
  void Promise.resolve()
    .then(buildEmbed)
    .then((embed) => sendAdminAlert(event, embed))
    .then((result) => {
      if (!result.sent && result.reason === 'failed') console.warn(`[admin-alert] ${event} non envoyée :`, result.error)
    })
    .catch((error: unknown) => console.warn(`[admin-alert] ${event} non construite :`, error))
}
