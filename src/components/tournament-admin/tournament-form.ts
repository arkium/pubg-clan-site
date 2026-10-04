import { TOURNAMENT_MODE_DESCRIPTIONS } from '@/lib/tournament-guide'
import { normalizeTournamentGameMode, normalizeTournamentMapName } from '@/lib/tournament-filters'
import type { MixedSquadRule, TournamentMode } from '@/lib/tournament-service'

/**
 * État et corps du formulaire de la page d'administration des tournois (docs/features/tournois.md, « Page
 * d'administration »). Repris tels quels de l'ancienne page : mêmes valeurs par défaut, même lecture des règles, même
 * corps envoyé à `POST` / `PATCH /api/clans/[clanId]/tournaments[/id]`.
 */

export type AdminTournament = {
  id: string
  title: string
  description: string | null
  status: string
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
  rules: unknown
  discordWebhookUrl: string | null
  organizerClan: { id: number; name: string } | null
}

export type TournamentStatus = 'draft' | 'active' | 'finished'

export type TournamentFormState = {
  title: string
  description: string
  startDate: string
  endDate: string
  gameMode: string
  mapName: string
  status: TournamentStatus
  mode: TournamentMode
  mixedSquadRule: MixedSquadRule
  placementPoints: Record<string, number>
  killPoints: number
  winBonus: number
  bestOfRounds: number | null
  discordWebhookUrl: string
}

/** Erreurs de saisie, affichées sous leur champ (charte : erreur au jeton négatif). */
export type TournamentFormErrors = Partial<Record<'title' | 'startDate' | 'endDate', string>>

export type AdminTab = 'tournaments' | 'editor' | 'guide'
export type StatusFilter = 'all' | 'active' | 'finished' | 'draft'

export const DEFAULT_PLACEMENT_POINTS: Record<string, number> = {
  '1': 15, '2': 12, '3': 10, '4': 8, '5': 6,
  '6': 4, '7': 2, '8': 1, '9': 1, '10': 1,
}

export const STATUS_OPTIONS: Array<{ value: TournamentStatus; label: string }> = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'active', label: 'Actif' },
  { value: 'finished', label: 'Terminé' },
]

export const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'finished', label: 'Terminés' },
  { value: 'draft', label: 'Brouillons' },
]

export function getRulesForm(rules: unknown) {
  const value = rules && typeof rules === 'object' ? (rules as Record<string, unknown>) : {}
  const placementValues =
    value.placementPoints && typeof value.placementPoints === 'object'
      ? (value.placementPoints as Record<string, unknown>)
      : {}
  const asNonNegativeNumber = (entry: unknown, fallback: number) => {
    const parsed = Number(entry)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }
  const bestOfRounds = Number(value.bestOfRounds)
  const mode = TOURNAMENT_MODE_DESCRIPTIONS.some((option) => option.value === value.mode)
    ? (value.mode as TournamentMode)
    : 'inter_clan'

  return {
    mode,
    mixedSquadRule: (value.mixedSquadRule === 'prorata' ? 'prorata' : 'full_share') as MixedSquadRule,
    placementPoints: Object.fromEntries(
      Object.entries(DEFAULT_PLACEMENT_POINTS).map(([placement, points]) => [
        placement,
        asNonNegativeNumber(placementValues[placement], points),
      ])
    ),
    killPoints: asNonNegativeNumber(value.killPoints, 1),
    winBonus: asNonNegativeNumber(value.winBonus, 5),
    bestOfRounds: Number.isInteger(bestOfRounds) && bestOfRounds > 0 ? bestOfRounds : null,
  }
}

export function getDefaultForm(): TournamentFormState {
  const today = new Date()
  return {
    title: '',
    description: '',
    startDate: today.toISOString().slice(0, 10),
    endDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    gameMode: '',
    mapName: '',
    status: 'draft',
    mode: 'inter_clan',
    mixedSquadRule: 'full_share',
    placementPoints: { ...DEFAULT_PLACEMENT_POINTS },
    killPoints: 1,
    winBonus: 5,
    bestOfRounds: null,
    discordWebhookUrl: '',
  }
}

/** Formulaire pré-rempli pour modifier un tournoi existant. */
export function formFromTournament(tournament: AdminTournament): TournamentFormState {
  return {
    title: tournament.title,
    description: tournament.description ?? '',
    startDate: tournament.startDate.slice(0, 10),
    endDate: tournament.endDate.slice(0, 10),
    // Un tournoi enregistré avant le 2026-09-18 peut porter « Erangel » ou « squad » : on le ramène à la valeur
    // réellement utilisée par les matchs, sinon le formulaire afficherait une option vide.
    gameMode: normalizeTournamentGameMode(tournament.gameMode) ?? '',
    mapName: normalizeTournamentMapName(tournament.mapName) ?? '',
    status: tournament.status as TournamentStatus,
    discordWebhookUrl: tournament.discordWebhookUrl ?? '',
    ...getRulesForm(tournament.rules),
  }
}

/** Contrôles avant envoi — mêmes règles et mêmes messages qu'avant, rattachés à leur champ. */
export function validateTournamentForm(form: TournamentFormState): TournamentFormErrors {
  if (!form.title.trim()) return { title: 'Le titre du tournoi est obligatoire.' }
  if (!form.startDate || !form.endDate) {
    return form.startDate
      ? { endDate: 'Les dates de début et de fin sont obligatoires.' }
      : { startDate: 'Les dates de début et de fin sont obligatoires.' }
  }
  if (new Date(form.endDate).getTime() < new Date(form.startDate).getTime()) {
    return { endDate: 'La date de fin doit être après la date de début.' }
  }
  return {}
}

/** Corps de `POST` (création) et `PATCH` (modification). */
export function tournamentRequestBody(form: TournamentFormState) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    startDate: form.startDate,
    endDate: form.endDate,
    gameMode: form.gameMode || null,
    mapName: form.mapName || null,
    status: form.status,
    rules: {
      mode: form.mode,
      mixedSquadRule: form.mixedSquadRule,
      placementPoints: form.placementPoints,
      killPoints: form.killPoints,
      winBonus: form.winBonus,
      bestOfRounds: form.bestOfRounds,
    },
    discordWebhookUrl: form.discordWebhookUrl.trim() || null,
  }
}
