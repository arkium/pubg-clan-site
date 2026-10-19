import { withAdminActionLog } from '@/lib/admin-action-log'
import { adminAlertTestMessage } from '@/lib/admin-alerts/messages'
import { ADMIN_ALERT_USERNAME } from '@/lib/admin-alerts/send'
import { getAdminAlertEvents, getAdminAlertMention, getClanLifecycleDiscordWebhookUrl } from '@/lib/clan-lifecycle/config'
import { sendDiscordWebhook } from '@/lib/discord/discord-client'
import { renderDiscordMention } from '@/lib/discord/discord-config'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * `POST` — « Envoyer un test » de l'onglet Paramètres du cycle de vie : un message de contrôle dans le salon Discord
 * d'administration, **avec** la mention réglée, pour vérifier d'un coup l'adresse et la sonnerie. Rien n'est écrit en
 * base ; la route passe tout de même par le journal des actions, comme toute écriture d'administration (un message
 * part chez un tiers).
 */
async function handlePost(request: Request) {
  try {
    const permissionError = await requireSuperUser(request)
    if (permissionError) return permissionError

    const webhookUrl = await getClanLifecycleDiscordWebhookUrl()
    if (!webhookUrl) {
      return Response.json({ error: 'Aucun webhook enregistré : renseigne l’adresse du salon d’abord.' }, { status: 400 })
    }

    const [events, mention] = await Promise.all([getAdminAlertEvents(), getAdminAlertMention()])
    const content = renderDiscordMention(mention)
    const result = await sendDiscordWebhook(webhookUrl, {
      username: ADMIN_ALERT_USERNAME,
      ...(content ? { content } : {}),
      embeds: [{ ...adminAlertTestMessage(events), timestamp: new Date().toISOString() }],
    })

    if (!result.ok) {
      return Response.json({ error: `Discord a refusé le message : ${result.error}` }, { status: 502 })
    }
    return Response.json({ success: true, message: 'Message de test envoyé dans le salon d’administration.' })
  } catch (error) {
    console.error('Error sending the admin webhook test:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export const POST = withAdminActionLog('settings/clan-lifecycle/webhook-test', handlePost)
