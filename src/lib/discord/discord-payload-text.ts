/**
 * Message Discord en texte à coller (2026-10-24) : sans webhook configuré, l'organisateur copie le message et le colle
 * lui-même dans son salon. Discord interprète le Markdown d'un message ordinaire : titres (`## `), gras, liens masqués,
 * petit texte (`-# `). Module pur, lisible côté navigateur.
 */
import type { DiscordWebhookPayload } from '@/lib/discord/discord-client'

/** Limite d'un message Discord sans Nitro. */
export const DISCORD_MESSAGE_LIMIT = 2000

/** Un crochet du titre fermerait le lien masqué avant l'heure. */
function escapeLinkText(text: string) {
  return text.replace(/[[\]]/g, (char) => `\\${char}`)
}

export function discordPayloadToText(payload: DiscordWebhookPayload): string {
  const blocks: string[] = []
  if (payload.content?.trim()) blocks.push(payload.content.trim())

  for (const embed of payload.embeds) {
    const lines: string[] = []
    if (embed.title) lines.push(embed.url ? `## [${escapeLinkText(embed.title)}](${embed.url})` : `## ${embed.title}`)
    if (embed.description) lines.push(embed.description)
    for (const field of embed.fields ?? []) lines.push('', `**${field.name}**`, field.value)
    if (embed.footer?.text) lines.push('', `-# ${embed.footer.text}`)
    blocks.push(lines.join('\n'))
  }

  return blocks.join('\n\n').trim()
}

/**
 * Découpe un texte trop long pour un seul message, entre deux lignes (une ligne plus longue que la limite est coupée
 * net). Chaque partie se colle à la suite de la précédente.
 */
export function splitDiscordMessage(text: string, limit = DISCORD_MESSAGE_LIMIT): string[] {
  if (text.length <= limit) return [text]
  const parts: string[] = []
  let current = ''
  for (const rawLine of text.split('\n')) {
    let line = rawLine
    while (line.length > limit) {
      if (current) {
        parts.push(current)
        current = ''
      }
      parts.push(line.slice(0, limit))
      line = line.slice(limit)
    }
    const candidate = current ? `${current}\n${line}` : line
    if (candidate.length > limit) {
      parts.push(current)
      current = line
    } else {
      current = candidate
    }
  }
  if (current.trim()) parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}
