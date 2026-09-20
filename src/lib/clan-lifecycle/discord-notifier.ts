import { sendDiscordWebhook, type DiscordEmbedField } from '@/lib/discord/discord-client'
import { getClanLifecycleDiscordWebhookUrl } from '@/lib/clan-lifecycle/config'
import { PLAYER_CLAN_CHANGE_SOURCES } from '@/lib/player-clan-change'
import type { MembershipSyncSummary, PlannedMovement } from '@/lib/clan-lifecycle/membership-sync'

/**
 * Notification Discord des mouvements automatiques — chantier 1.
 *
 * Le webhook est **global** (`AppConfig.clan_lifecycle_discord_webhook_url`), pas par
 * clan : une mutation concerne toute la ligue, et le salon d'administration n'est pas
 * celui des annonces d'un clan.
 *
 * Aucune notification n'est un cas normal, pas une erreur : tant que le webhook n'est
 * pas renseigné, la fonction ne fait rien et le dit clairement à l'appelant.
 */

const COLOR_APPLIED = 0xf59e0b // ambre — un mouvement a eu lieu
const COLOR_OBSERVED = 0x64748b // ardoise — mode observation, rien appliqué
const COLOR_ABORTED = 0xdc2626 // rouge — coupe-circuit

export type LifecycleNotifyResult =
  | { sent: true; status: number }
  | { sent: false; reason: 'no_webhook' | 'nothing_to_report' | 'failed'; error?: string }

function describeMovement(movement: PlannedMovement) {
  const from = movement.previousClanTag ? `[${movement.previousClanTag}]` : 'aucun clan'
  const to = movement.targetClanTag ? `[${movement.targetClanTag}]` : 'aucun clan'
  const verb =
    movement.source === PLAYER_CLAN_CHANGE_SOURCES.autoTransfer ? 'transféré' : 'basculé'

  return `**${movement.memberName}** ${verb} ${from} → ${to}`
}

export async function notifyLifecyclePass(
  summary: MembershipSyncSummary,
  movements: PlannedMovement[]
): Promise<LifecycleNotifyResult> {
  // Rien d'intéressant à dire : un passage sans écart n'a pas à réveiller le salon.
  if (movements.length === 0 && !summary.circuitBreakerTripped) {
    return { sent: false, reason: 'nothing_to_report' }
  }

  const webhookUrl = await getClanLifecycleDiscordWebhookUrl()
  if (!webhookUrl) {
    return { sent: false, reason: 'no_webhook' }
  }

  const applied = summary.movementsApplied > 0
  const color = summary.circuitBreakerTripped
    ? COLOR_ABORTED
    : applied
      ? COLOR_APPLIED
      : COLOR_OBSERVED

  const title = summary.circuitBreakerTripped
    ? '🛑 Cycle de vie des clans — passage abandonné'
    : applied
      ? '🔄 Cycle de vie des clans — mouvements appliqués'
      : '👁️ Cycle de vie des clans — observation'

  const fields: DiscordEmbedField[] = [
    { name: 'Membres examinés', value: String(summary.membersScanned), inline: true },
    { name: 'Écarts détectés', value: String(summary.discrepanciesFound), inline: true },
    {
      name: 'En attente de confirmation',
      value: String(summary.awaitingConfirmation),
      inline: true,
    },
    { name: 'Mouvements prévus', value: String(summary.movementsPlanned), inline: true },
    { name: 'Mouvements appliqués', value: String(summary.movementsApplied), inline: true },
    { name: 'Mode', value: summary.mode, inline: true },
  ]

  if (summary.statesUnknown > 0) {
    fields.push({
      name: 'États indéterminés',
      value: `${summary.statesUnknown} — aucun mouvement déclenché sur ces comptes`,
      inline: false,
    })
  }

  // Discord plafonne un embed a 4096 caracteres : on borne la liste et on annonce
  // le reste plutot que de risquer un rejet silencieux.
  const MAX_LISTED = 15
  const listed = movements.slice(0, MAX_LISTED).map(describeMovement)
  const overflow = movements.length - listed.length
  const description = [
    ...listed,
    overflow > 0 ? `_… et ${overflow} autre(s)_` : null,
    summary.message ? `\n${summary.message}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const result = await sendDiscordWebhook(webhookUrl, {
    username: 'Cycle de vie des clans',
    embeds: [
      {
        title,
        description: description.length > 0 ? description : undefined,
        color,
        timestamp: new Date().toISOString(),
        fields,
        footer: { text: summary.runId ? `Passage ${summary.runId}` : 'Passage manuel' },
      },
    ],
  })

  return result.ok
    ? { sent: true, status: result.status }
    : { sent: false, reason: 'failed', error: result.error }
}
