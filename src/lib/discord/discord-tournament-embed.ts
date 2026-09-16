import type { DiscordEmbedField, DiscordWebhookPayload } from '@/lib/discord/discord-client'
import { matchTournamentDebriefPath } from '@/lib/match-links'

export const TOURNAMENT_COLOR = 0x5865f2

const MAX_TITLE_LENGTH = 256
const MAX_FIELD_VALUE_LENGTH = 1024
const MAX_DESCRIPTION_LENGTH = 4096
const MAX_FOOTER_LENGTH = 2048

const RANK_MEDALS = ['🥇', '🥈', '🥉']

export type TournamentRoundClanResult = {
  clanId: number
  clanLabel: string
  bestPlacement: number
  totalKills: number
  placementScore: number
  killScore: number
  winBonus: number
  points: number
}

export type TournamentRoundMvp = {
  displayName: string
  clanLabel: string
  kills: number
  damage: number
}

export type TournamentStandingLine = {
  clanLabel: string
  totalPoints: number
  totalKills: number
}

export type TournamentRoundEmbedInput = {
  tournamentId: string
  tournamentTitle: string
  roundNumber: number
  totalRounds: number
  squadMatchId: string
  telemetryClanId: number | null
  mapLabel: string
  gameModeLabel: string
  playedAt: Date
  results: TournamentRoundClanResult[]
  mvp: TournamentRoundMvp | null
  /** null masque le bloc « Classement general provisoire ». */
  standings: TournamentStandingLine[] | null
  mention: string
  siteUrl: string
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

export function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatPlacement(placement: number) {
  return placement === 1 ? '1er' : `${placement}e`
}

function rankPrefix(index: number) {
  return RANK_MEDALS[index] ?? `#${index + 1}`
}

function formatResultLine(result: TournamentRoundClanResult, index: number) {
  const parts = [
    `${formatPlacement(result.bestPlacement)} (+${formatPoints(result.placementScore)} pts)`,
    `${result.totalKills} kills (+${formatPoints(result.killScore)} pts)`,
  ]

  if (result.winBonus > 0) {
    parts.push(`bonus +${formatPoints(result.winBonus)}`)
  }

  return `${rankPrefix(index)} **${result.clanLabel}** : ${parts.join(' · ')} = **${formatPoints(result.points)} pts**`
}

/**
 * Empile des lignes tant qu'elles tiennent dans la limite Discord, puis signale
 * le reliquat au lieu de tronquer une ligne en plein milieu.
 */
function joinBoundedLines(lines: string[], max: number) {
  const kept: string[] = []

  for (const line of lines) {
    if ([...kept, line].join('\n').length > max) {
      const overflow = `… et ${lines.length - kept.length} autre(s)`
      if ([...kept, overflow].join('\n').length <= max) kept.push(overflow)
      break
    }

    kept.push(line)
  }

  return truncate(kept.join('\n') || '—', max)
}

export function buildTournamentRoundWebhookPayload(
  input: TournamentRoundEmbedInput
): DiscordWebhookPayload {
  const siteUrl = input.siteUrl.replace(/\/+$/, '')
  const fields: DiscordEmbedField[] = [
    {
      name: 'Scores de la manche',
      value: joinBoundedLines(input.results.map(formatResultLine), MAX_FIELD_VALUE_LENGTH),
    },
  ]

  if (input.mvp) {
    fields.push({
      name: '⭐ MVP de la manche',
      value: truncate(
        `**${input.mvp.displayName}** (${input.mvp.clanLabel}) — ${input.mvp.kills} kills · ${Math.round(input.mvp.damage)} dégâts`,
        MAX_FIELD_VALUE_LENGTH
      ),
    })
  }

  if (input.standings) {
    fields.push({
      name: 'Classement général provisoire',
      value: joinBoundedLines(
        input.standings.map(
          (line, index) =>
            `${rankPrefix(index)} **${line.clanLabel}** — ${formatPoints(line.totalPoints)} pts · ${line.totalKills} kills`
        ),
        MAX_FIELD_VALUE_LENGTH
      ),
    })
  }

  const descriptionLines = [`🗺️ **${input.mapLabel}** — ${input.gameModeLabel}`]

  if (siteUrl) {
    descriptionLines.push(
      // Débriefing en vue tournoi : Replay 2D de la manche, ouvert à tout utilisateur connecté.
      `[▶️ Replay 2D de la manche](${siteUrl}${matchTournamentDebriefPath(input.tournamentId, input.squadMatchId)})`
    )
  }

  return {
    ...(input.mention ? { content: input.mention } : {}),
    embeds: [
      {
        title: truncate(
          `🏆 Tournoi : ${input.tournamentTitle} — Résultats Manche #${input.roundNumber}`,
          MAX_TITLE_LENGTH
        ),
        ...(siteUrl ? { url: `${siteUrl}/tournaments/${input.tournamentId}` } : {}),
        color: TOURNAMENT_COLOR,
        description: truncate(descriptionLines.join('\n'), MAX_DESCRIPTION_LENGTH),
        fields,
        footer: {
          text: truncate(
            `Manche ${input.roundNumber}/${input.totalRounds} · ${input.results.length} clan(s) classé(s)`,
            MAX_FOOTER_LENGTH
          ),
        },
        timestamp: input.playedAt.toISOString(),
      },
    ],
  }
}
