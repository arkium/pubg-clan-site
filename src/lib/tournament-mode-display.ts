/**
 * Présentation d'un tournoi selon son mode (docs/features/tournois.md, « Pages joueurs ») : ce qu'une ligne représente,
 * comment appeler le lecteur, où il se trouve dans le classement, sa forme manche par manche. Module pur, partagé par
 * la liste `/tournaments` et la page d'un tournoi. Libellés et textes des modes : `tournament-guide.ts`.
 */
import { TOURNAMENT_MODE_DESCRIPTIONS } from '@/lib/tournament-guide'
import type { TournamentMode, TournamentParticipant } from '@/lib/tournament-service'
import { tournamentWindowEnd } from '@/lib/tournament-schedule'

export type TournamentModeDisplay = {
  mode: TournamentMode
  /** Libellé court (« Inter-clans »). */
  label: string
  /** « classe les clans ». */
  ranks: string
  help: string
  /** En-tête de colonne : Clan, Équipe, Joueur, Escouade. */
  column: string
  unit: { one: string; many: string }
  /** Le lecteur, dans ce mode : « Ton clan », « Toi »… */
  viewer: string
}

const EXTRA: Record<TournamentMode, Pick<TournamentModeDisplay, 'column' | 'unit' | 'viewer'>> = {
  inter_clan: { column: 'Clan', unit: { one: 'clan', many: 'clans' }, viewer: 'Ton clan' },
  custom_teams: { column: 'Équipe', unit: { one: 'équipe', many: 'équipes' }, viewer: 'Ton équipe' },
  solo_ffa: { column: 'Joueur', unit: { one: 'joueur', many: 'joueurs' }, viewer: 'Toi' },
  intra_clan: { column: 'Escouade', unit: { one: 'escouade', many: 'escouades' }, viewer: 'Ton escouade' },
}

export const TOURNAMENT_MODE_DISPLAY = Object.fromEntries(
  TOURNAMENT_MODE_DESCRIPTIONS.map((description) => [
    description.value,
    {
      mode: description.value,
      label: description.shortLabel,
      ranks: description.ranks,
      help: description.help,
      ...EXTRA[description.value],
    },
  ])
) as Record<TournamentMode, TournamentModeDisplay>

/** « 6 clans », « 1 joueur ». */
export function participantCountLabel(mode: TournamentMode, count: number) {
  const unit = TOURNAMENT_MODE_DISPLAY[mode].unit
  return `${count} ${count > 1 ? unit.many : unit.one}`
}

const pointsFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** Les points deviennent décimaux avec le partage au prorata : la décimale n'apparaît que si elle existe. */
export const formatTournamentPoints = (value: number) => pointsFormat.format(value)

// ── Le lecteur dans un classement ───────────────────────────────────────────────────────────────────

/** Joueurs et clans du compte connecté (`useAuthSession().members`). Vide en visiteur. */
export type TournamentViewer = { memberIds: number[]; clanIds: number[] }

/** Le lecteur est-il ce participant ? Son clan en inter-clans, lui-même en solo, un de ses joueurs sinon. */
export function isViewerParticipant(participant: TournamentParticipant, viewer: TournamentViewer) {
  if (participant.kind === 'clan') return viewer.clanIds.includes(participant.clanId)
  if (participant.kind === 'player') return viewer.memberIds.includes(participant.memberId)
  return participant.memberIds.some((memberId) => viewer.memberIds.includes(memberId))
}

export type ViewerPosition = {
  /** « Ton clan », « Toi »… */
  who: string
  rank: number
  /** Points de retard sur le premier ; 0 en tête. */
  gapToLeader: number
  /** Avance sur le deuxième quand le lecteur est en tête. */
  leadOverSecond: number | null
  leaderLabel: string | null
}

type RankedLike = { participant: TournamentParticipant; totalPoints: number; label?: string }

/** Place du lecteur dans un classement déjà trié ; `null` s'il n'y figure pas. */
export function viewerPosition(standings: RankedLike[], viewer: TournamentViewer, mode: TournamentMode): ViewerPosition | null {
  const index = standings.findIndex((standing) => isViewerParticipant(standing.participant, viewer))
  if (index < 0) return null
  const mine = standings[index]
  const leader = standings[0]
  return {
    who: TOURNAMENT_MODE_DISPLAY[mode].viewer,
    rank: index + 1,
    gapToLeader: Math.max(0, leader.totalPoints - mine.totalPoints),
    leadOverSecond: index === 0 && standings[1] ? mine.totalPoints - standings[1].totalPoints : null,
    leaderLabel: index === 0 ? null : (leader.label ?? null),
  }
}

/** « 1er », « 2e ». */
export const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`)

/** « Ton clan est 2e, à 6 pts de [LMT] La Meute » ; « Tu es 1er, 4 pts d'avance ». */
export function viewerSentence(position: ViewerPosition) {
  const subject = position.who === 'Toi' ? 'Tu es' : `${position.who} est`
  const rank = ordinal(position.rank)
  if (position.rank === 1) {
    return position.leadOverSecond !== null
      ? `${subject} ${rank}, ${formatTournamentPoints(position.leadOverSecond)} pts d’avance`
      : `${subject} ${rank}`
  }
  const target = position.leaderLabel ? ` de ${position.leaderLabel}` : ' du 1er'
  return `${subject} ${rank}, à ${formatTournamentPoints(position.gapToLeader)} pts${target}`
}

// ── Forme : la place à chaque manche ────────────────────────────────────────────────────────────────

type RoundLike = { index: number; scores: Array<{ key: string; bestPlacement: number }> }

/** Place du participant à chaque manche, `null` quand il n'y a pas joué. */
export function participantForm(key: string, rounds: RoundLike[]) {
  return rounds.map((round) => ({
    round: round.index,
    placement: round.scores.find((score) => score.key === key)?.bestPlacement ?? null,
  }))
}

// ── Phase ───────────────────────────────────────────────────────────────────────────────────────────

/** État réellement affiché, dérivé du statut et des dates. */
export type TournamentPhase = 'draft' | 'live' | 'upcoming' | 'finished'

/**
 * Un tournoi `active` dont la période est à venir reste « à venir », et un tournoi dont la période est passée n'est
 * plus « en direct », même resté `active`. La fin est celle de la capture des manches (src/lib/tournament-schedule.ts) :
 * l'heure précisée (« 03:00 »), ou la fin du dernier jour pour un tournoi en journées entières.
 */
export function resolveTournamentPhase(
  tournament: { status: string; startDate: Date | string; endDate: Date | string },
  now = new Date()
): TournamentPhase {
  if (tournament.status === 'draft') return 'draft'
  if (tournament.status === 'finished') return 'finished'
  if (now < new Date(tournament.startDate)) return 'upcoming'
  if (now > tournamentWindowEnd(tournament.endDate)) return 'finished'
  return 'live'
}

// ── Temps ───────────────────────────────────────────────────────────────────────────────────────────

// Libellés génériques (« dans 5 h », « il y a 22 min ») : src/lib/relative-time.ts.
export { countdownLabel, elapsedLabel } from '@/lib/relative-time'

/** Clans représentés par un participant : le sien, celui du joueur, ceux d'une équipe. */
export function participantClanIds(participant: TournamentParticipant): number[] {
  if (participant.kind === 'clan') return [participant.clanId]
  if (participant.kind === 'player') return participant.clanId === null ? [] : [participant.clanId]
  return [...new Set(participant.clanIds)]
}

// ── Barème ──────────────────────────────────────────────────────────────────────────────────────────

/** Barres du barème, Top 1 d'abord ; `ratio` rapporte chaque place au meilleur score de placement. */
export function placementScale(placementPoints: Record<number | string, number>) {
  const entries = Object.entries(placementPoints)
    .map(([placement, points]) => ({ placement: Number(placement), points }))
    .filter((entry) => Number.isInteger(entry.placement) && entry.placement > 0)
    .sort((left, right) => left.placement - right.placement)
  const max = Math.max(0, ...entries.map((entry) => entry.points))
  return entries.map((entry) => ({ ...entry, ratio: max > 0 ? entry.points / max : 0 }))
}

type RulesLike = {
  mode: TournamentMode
  mixedSquadRule: 'full_share' | 'prorata'
  killPoints: number
  winBonus: number
  bestOfRounds: number | null
}

const plural = (value: number, word: string) => `${formatTournamentPoints(value)} ${word}${Math.abs(value) > 1 ? 's' : ''}`

/** Ce que rapporte une manche, hors placement : kill, bonus, manches retenues, escouades mixtes (inter-clans). */
export function tournamentRuleLines(rules: RulesLike) {
  const lines = [
    { label: 'Par kill', value: plural(rules.killPoints, 'pt') },
    { label: 'Bonus Top 1', value: `+${plural(rules.winBonus, 'pt')}` },
    {
      label: 'Manches retenues',
      value: !rules.bestOfRounds ? 'toutes' : rules.bestOfRounds === 1 ? 'la meilleure' : `les ${rules.bestOfRounds} meilleures`,
    },
  ]
  if (rules.mode === 'inter_clan') {
    lines.push({
      label: 'Escouades mixtes',
      value: rules.mixedSquadRule === 'prorata' ? 'au prorata de l’effectif' : 'partage intégral',
    })
  }
  return lines
}
