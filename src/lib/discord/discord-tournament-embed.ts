import type { DiscordEmbedField, DiscordWebhookPayload } from '@/lib/discord/discord-client'
import { boldName, joinBoundedLines, truncate } from '@/lib/discord/embed-lines'
import { playerShortUrl, tournamentShortUrl } from '@/lib/short-links'
import { compactSquadLabel } from '@/lib/tournament-mode-display'
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
    roundField: 'Scores de la manche (squads internes)',
    standingsField: 'Classement interne provisoire',
    participants: 'squad(s) classée(s)',
  },
}

export type TournamentRoundMvp = {
  /** Fiche `ClanMember` : le nom devient un lien court vers le tableau de bord du joueur. */
  memberId?: number | null
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

/** Une escouade du classement final, ses joueurs déjà libellés « [TAG] Pseudo », les plus réguliers d'abord. */
export type TournamentSquadStandingLine = {
  memberLabels: string[]
  totalPoints: number
  totalKills: number
  wins: number
  /** Place à chaque manche, dans l'ordre ; `null` quand l'escouade n'y a pas joué. */
  form: Array<number | null>
}

export type TournamentSquadStandingsEmbedInput = {
  tournamentId: string
  tournamentTitle: string
  totalRounds: number
  killPoints: number
  winBonus: number
  squads: TournamentSquadStandingLine[]
  /** Date de la dernière manche. */
  playedAt: Date
  mention: string
  siteUrl: string
}

function formatSquadForm(form: Array<number | null>) {
  return form.map((placement) => (placement === null ? '–' : placement === 1 ? '#1' : String(placement))).join(' · ')
}

/**
 * Classement final par escouade d'un tournoi inter-clans (demande du 2026-10-11) : même barème que le cumul par clan,
 * mais chaque escouade marque tous ses points, remplaçants rattachés à leur escouade. La liste tient dans la
 * description (4 096 caractères), plus large qu'un champ.
 */
export function buildTournamentSquadStandingsWebhookPayload(
  input: TournamentSquadStandingsEmbedInput
): DiscordWebhookPayload {
  const siteUrl = input.siteUrl.replace(/\/+$/, '')
  const header = [
    `🎮 ${input.squads.length} squad(s) · ${input.totalRounds} manche(s)`,
    `Barème : placement, ${formatPoints(input.killPoints)} pt par kill, +${formatPoints(input.winBonus)} pour un Top 1. Chaque squad marque tous ses points.`,
    '',
  ]
  const lines = input.squads.map(
    (squad, index) =>
      `${rankPrefix(index)} **${compactSquadLabel(squad.memberLabels)}**\n` +
      `**${formatPoints(squad.totalPoints)} pts** · ${squad.totalKills} kills · ${squad.wins} Top 1 · manches : ${formatSquadForm(squad.form)}`
  )
  const tournamentUrl = tournamentShortUrl({ siteUrl }, input.tournamentId)
  const footerLink = tournamentUrl ? [`\n[📊 Classement complet sur le site](${tournamentUrl})`] : []
  // Place gardée pour annoncer les escouades qui ne tiennent pas, plutôt que de couper la liste sans le dire.
  const budget = MAX_DESCRIPTION_LENGTH - header.join('\n').length - footerLink.join('\n').length - 60
  const kept: string[] = []
  for (const line of lines) {
    if ([...kept, line].join('\n').length > budget) break
    kept.push(line)
  }
  if (kept.length < lines.length) kept.push(`… et ${lines.length - kept.length} autre(s) squad(s)`)

  return {
    ...(input.mention ? { content: input.mention } : {}),
    embeds: [
      {
        title: truncate(`🏆 Tournoi : ${input.tournamentTitle} — Classement par squad`, MAX_TITLE_LENGTH),
        ...(tournamentUrl ? { url: tournamentUrl } : {}),
        color: TOURNAMENT_COLOR,
        description: truncate([...header, ...kept, ...footerLink].join('\n'), MAX_DESCRIPTION_LENGTH),
        footer: {
          text: truncate('Places à chaque manche dans l’ordre · remplaçants rattachés à leur squad', MAX_FOOTER_LENGTH),
        },
        timestamp: input.playedAt.toISOString(),
      },
    ],
  }
}

export function buildTournamentRoundWebhookPayload(
  input: TournamentRoundEmbedInput
): DiscordWebhookPayload {
  const siteUrl = input.siteUrl.replace(/\/+$/, '')
  const tournamentUrl = tournamentShortUrl({ siteUrl }, input.tournamentId)
  const replayUrl = tournamentShortUrl({ siteUrl }, input.tournamentId, { squadMatchId: input.squadMatchId, replay: true })
  const wording = MODE_WORDING[input.mode] ?? MODE_WORDING.inter_clan
  const fields: DiscordEmbedField[] = [
    {
      name: wording.roundField,
      value: joinBoundedLines(input.results.map(formatResultLine), MAX_FIELD_VALUE_LENGTH),
    },
  ]

  if (input.mvp) {
    const mvp = input.mvp
    const line = (url: string | null) =>
      `${boldName(mvp.displayName, url)} (${mvp.clanLabel}) — ${mvp.kills} kills · ${Math.round(mvp.damage)} dégâts`
    const linked = line(playerShortUrl({ siteUrl }, mvp.memberId))
    fields.push({
      name: '⭐ MVP de la manche',
      // Trop long avec le lien : le nom reste en gras, sans lien, plutôt qu'un lien coupé.
      value: truncate(linked.length <= MAX_FIELD_VALUE_LENGTH ? linked : line(null), MAX_FIELD_VALUE_LENGTH),
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
    descriptionLines.push('⚖️ Squads mixtes : placement et bonus partagés au prorata de l’effectif de chaque clan.')
  }

  if (replayUrl) {
    // Débriefing en vue tournoi, ouvert sur le Replay 2D de la manche (tout utilisateur connecté).
    descriptionLines.push(`[▶️ Replay 2D de la manche](${replayUrl})`)
  }

  return {
    ...(input.mention ? { content: input.mention } : {}),
    embeds: [
      {
        title: truncate(
          `🏆 Tournoi : ${input.tournamentTitle} — Résultats Manche #${input.roundNumber}`,
          MAX_TITLE_LENGTH
        ),
        ...(tournamentUrl ? { url: tournamentUrl } : {}),
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
