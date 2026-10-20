import type { DiscordEmbedField, DiscordWebhookPayload } from '@/lib/discord/discord-client'
import { boldName, joinLinkedLines, truncate } from '@/lib/discord/embed-lines'
import { matchShortUrl, playerShortUrl, type ShortLinkContext } from '@/lib/short-links'

export const CHICKEN_DINNER_COLOR = 0xf1c40f

// Limites imposees par l'API Discord sur un embed.
const MAX_TITLE_LENGTH = 256
const MAX_FIELD_VALUE_LENGTH = 1024
const MAX_FOOTER_LENGTH = 2048

export type Top1EmbedMember = {
  /** Fiche `ClanMember` : le nom devient un lien court vers le tableau de bord du joueur. */
  memberId?: number | null
  displayName: string
  kills: number
  damage: number
  assists: number
  revives: number
  timeSurvived: number
}

export type Top1EmbedInput = {
  clanId: number
  clanName: string
  clanTag: string
  squadMatchId: string
  mapKey: string
  mapLabel: string
  gameModeLabel: string
  matchTypeLabel: string
  playedAt: Date
  members: Top1EmbedMember[]
  mention: string
  siteUrl: string
  /** Sous-domaine du clan et `CLAN_SUBDOMAIN_ROOT` : le lien du match passe alors par le sous-domaine. */
  clanSubdomain?: string | null
  subdomainRoot?: string | null
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  return `${minutes}m ${String(safe % 60).padStart(2, '0')}s`
}

function formatMemberLine(member: Top1EmbedMember, playerUrl: string | null) {
  const parts = [`${member.kills} kills`, `${Math.round(member.damage)} dégâts`]

  if (member.assists > 0) parts.push(`${member.assists} assists`)
  if (member.revives > 0) parts.push(`${member.revives} revives`)

  return `🎖️ ${boldName(member.displayName, playerUrl)} — ${parts.join(' · ')}`
}

/** Noms en liens courts vers le tableau de bord ; au-delà de 1 024 caractères, les derniers perdent leur lien. */
function buildSquadField(members: Top1EmbedMember[], links: ShortLinkContext): DiscordEmbedField {
  const lines = members.map((member) => ({
    linked: formatMemberLine(member, playerShortUrl(links, member.memberId)),
    plain: formatMemberLine(member, null),
  }))

  return { name: 'Escouade', value: joinLinkedLines(lines, MAX_FIELD_VALUE_LENGTH) }
}

export function buildTop1WebhookPayload(input: Top1EmbedInput): DiscordWebhookPayload {
  const siteUrl = input.siteUrl.replace(/\/+$/, '')
  const links: ShortLinkContext = { siteUrl, subdomainRoot: input.subdomainRoot }
  const matchUrl = matchShortUrl(links, input.squadMatchId, input.clanSubdomain)
  const totals = input.members.reduce(
    (acc, member) => {
      acc.kills += member.kills
      acc.damage += member.damage
      acc.timeSurvived = Math.max(acc.timeSurvived, member.timeSurvived)
      return acc
    },
    { kills: 0, damage: 0, timeSurvived: 0 }
  )

  const fields: DiscordEmbedField[] = [
    buildSquadField(input.members, links),
    { name: 'Kills totaux', value: String(totals.kills), inline: true },
    { name: 'Dégâts cumulés', value: String(Math.round(totals.damage)), inline: true },
    { name: 'Survie', value: formatDuration(totals.timeSurvived), inline: true },
  ]

  return {
    ...(input.mention ? { content: input.mention } : {}),
    embeds: [
      {
        title: truncate(
          `🍗 CHICKEN DINNER ! Top 1 pour [${input.clanTag}] ${input.clanName}`,
          MAX_TITLE_LENGTH
        ),
        // Lien court (/m/<match>) : le site le résout vers le débriefing de ce clan (docs/TODO/url-masking.md).
        ...(matchUrl ? { url: matchUrl } : {}),
        color: CHICKEN_DINNER_COLOR,
        description: `🗺️ **${input.mapLabel}** — ${input.gameModeLabel}`,
        fields,
        ...(siteUrl ? { thumbnail: { url: `${siteUrl}/maps/pubg/${input.mapKey}.webp` } } : {}),
        footer: {
          text: truncate(
            `${input.matchTypeLabel} · ${input.members.length} membre(s) du clan`,
            MAX_FOOTER_LENGTH
          ),
        },
        timestamp: input.playedAt.toISOString(),
      },
    ],
  }
}
