import type { DiscordEmbedField, DiscordWebhookPayload } from '@/lib/discord/discord-client'
import { matchTournamentDebriefPath } from '@/lib/match-links'
import type { MixedSquadRule, TournamentMode } from '@/lib/tournament-service'

export const TOURNAMENT_COLOR = 0x5865f2

const MAX_TITLE_LENGTH = 256
const MAX_FIELD_VALUE_LENGTH = 1024
const MAX_DESCRIPTION_LENGTH = 4096
const MAX_FOOTER_LENGTH = 2048

const RANK_MEDALS = ['🥇', '🥈', '🥉']

/**
 * Résultat d'un participant sur une manche. Le participant est un clan, une équipe ou un joueur selon le mode du
 * tournoi : l'embed ne connaît que son libellé, déjà résolu par le service.
 */
export type TournamentRoundParticipantResult = {
  label: string
  bestPlacement: number
  totalKills: number
  placementScore: number
  killScore: number
  winBonus: number
  points: number
  /** Composition, affichée sous le libellé pour une équipe ou une escouade interne. */
  memberLabels?: string[]
}

/** Vocabulaire et intitulés propres à chaque mode. */
const MODE_WORDING: Record<TournamentMode, { roundField: string; standingsField: string; participants: string }> = {
  inter_clan: {
    roundField: 'Scores de la manche',
    standingsField: 'Classement général provisoire',
    participants: 'clan(s) classé(s)',
  },
  custom_teams: {
    roundField: 'Scores de la manche (équipes)',
    standingsField: 'Classement général des équipes',
    participants: 'équipe(s) classée(s)',
  },
  solo_ffa: {
    roundField: 'Classement de la manche (joueurs)',
    standingsField: 'Classement général individuel',
    participants: 'joueur(s) classé(s)',
  },
  intra_clan: {
    roundField: 'Scores de la manche (escouades internes)',
    standingsField: 'Classement interne provisoire',
    participants: 'escouade(s) classée(s)',
  },
}

export type TournamentRoundMvp = {
  displayName: string
  clanLabel: string
  kills: number
  damage: number
}

export type TournamentStandingLine = {
  label: string
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
  /** Mode du tournoi : change le vocabulaire de l'embed, pas sa structure. */
  mode: TournamentMode
  mixedSquadRule: MixedSquadRule
  results: TournamentRoundParticipantResult[]
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

function formatResultLine(result: TournamentRoundParticipantResult, index: number) {
  const parts = [
    `${formatPlacement(result.bestPlacement)} (+${formatPoints(result.placementScore)} pts)`,
    `${result.totalKills} kills (+${formatPoints(result.killScore)} pts)`,
  ]

  if (result.winBonus > 0) {
    parts.push(`bonus +${formatPoints(result.winBonus)}`)
  }

  return `${rankPrefix(index)} **${result.label}** : ${parts.join(' · ')} = **${formatPoints(result.points)} pts**`
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
  const wording = MODE_WORDING[input.mode] ?? MODE_WORDING.inter_clan
  const fields: DiscordEmbedField[] = [
    {
      name: wording.roundField,
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
      name: wording.standingsField,
      value: joinBoundedLines(
        input.standings.map(
          (line, index) =>
            `${rankPrefix(index)} **${line.label}** — ${formatPoints(line.totalPoints)} pts · ${line.totalKills} kills`
        ),
        MAX_FIELD_VALUE_LENGTH
      ),
    })
  }

  const descriptionLines = [`🗺️ **${input.mapLabel}** — ${input.gameModeLabel}`]

  // Le prorata produit des points décimaux : sans cette note, un lecteur croirait à une erreur de calcul.
  if (input.mode === 'inter_clan' && input.mixedSquadRule === 'prorata') {
    descriptionLines.push('⚖️ Escouades mixtes : placement et bonus partagés au prorata de l’effectif de chaque clan.')
  }

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
            `Manche ${input.roundNumber}/${input.totalRounds} · ${input.results.length} ${wording.participants}`,
            MAX_FOOTER_LENGTH
          ),
        },
        timestamp: input.playedAt.toISOString(),
      },
    ],
  }
}
