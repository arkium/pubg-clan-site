/**
 * Valeurs de filtre d'un tournoi (carte et mode de jeu), alignées sur ce que contient réellement `SquadMatch`.
 *
 * Bug corrigé le 2026-09-18 : le formulaire proposait des noms d'affichage (« Erangel ») et des modes inventés
 * (« squad », « trio »), alors que les matchs personnalisés stockent `Baltic_Main` et `normal-squad`. Un tournoi
 * filtré sur ces valeurs ne retenait donc **aucune** manche, sans le moindre message. Les normaliseurs ci-dessous
 * traduisent les anciennes valeurs, et sont appliqués côté serveur à chaque enregistrement.
 */
import { mapName as MAP_LABELS } from '@/lib/pubg-assets'

export type TournamentFilterOption = { value: string; label: string }

/** Cartes jouables en partie personnalisée, valeur interne telle que stockée dans `SquadMatch.mapName`. */
const TOURNAMENT_MAP_NAMES = [
  'Baltic_Main',
  'Desert_Main',
  'Savage_Main',
  'DihorOtok_Main',
  'Summerland_Main',
  'Chimera_Main',
  'Tiger_Main',
  'Kiki_Main',
  'Heaven_Main',
  'Neon_Main',
]

export const TOURNAMENT_MAP_OPTIONS: TournamentFilterOption[] = [
  { value: '', label: 'Toutes les cartes' },
  ...TOURNAMENT_MAP_NAMES.map((value) => ({
    value,
    // `Baltic_Main` est libellé « Erangel (Remastered) » : dans une liste de filtres, « Erangel » suffit.
    label: (MAP_LABELS[value] ?? value).replace(' (Remastered)', ''),
  })).sort((left, right) => left.label.localeCompare(right.label)),
]

/**
 * Modes observés sur les matchs personnalisés en production (2026-09-18) : `normal-squad`, `normal-duo`,
 * `normal-solo` et `tdm`. Les modes publics (`squad`, `duo`, `squad-fpp`…) n'apparaissent jamais sur un match
 * `custom`, ils ne sont donc pas proposés.
 */
export const TOURNAMENT_GAME_MODE_OPTIONS: TournamentFilterOption[] = [
  { value: '', label: 'Tous les modes' },
  { value: 'normal-squad', label: 'Squad (partie perso)' },
  { value: 'normal-duo', label: 'Duo (partie perso)' },
  { value: 'normal-solo', label: 'Solo (partie perso)' },
  { value: 'tdm', label: 'Deathmatch' },
]

/**
 * Noms d'affichage proposés par l'ancien formulaire, ramenés à la carte réellement jouée. Attention : le
 * dictionnaire officiel associe « Erangel » à `Erangel_Main` (la carte d'origine, retirée du jeu) alors que les
 * matchs se jouent sur `Baltic_Main`, libellé « Erangel (Remastered) ». Une simple recherche inverse par libellé
 * enverrait donc vers une carte qui ne sort jamais.
 */
const LEGACY_MAP_NAMES: Record<string, string> = {
  erangel: 'Baltic_Main',
  'erangel (remastered)': 'Baltic_Main',
  miramar: 'Desert_Main',
  sanhok: 'Savage_Main',
  vikendi: 'DihorOtok_Main',
  karakin: 'Summerland_Main',
  paramo: 'Chimera_Main',
  taego: 'Tiger_Main',
  deston: 'Kiki_Main',
  haven: 'Heaven_Main',
  rondo: 'Neon_Main',
  'camp jackal': 'Range_Main',
}

/** Traduit un nom d'affichage hérité (« Erangel ») vers la valeur interne ; laisse passer ce qui est déjà correct. */
export function normalizeTournamentMapName(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (MAP_LABELS[trimmed]) return trimmed
  return LEGACY_MAP_NAMES[trimmed.toLowerCase()] ?? trimmed
}

const LEGACY_GAME_MODES: Record<string, string | null> = {
  squad: 'normal-squad',
  duo: 'normal-duo',
  solo: 'normal-solo',
  // « Trio » n'existe pas côté PUBG : c'est une taille d'escouade, pas un mode. On retombe sur « tous les modes »
  // plutôt que de filtrer sur une valeur qui ne sortira jamais.
  trio: null,
}

export function normalizeTournamentGameMode(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed in LEGACY_GAME_MODES) return LEGACY_GAME_MODES[trimmed]
  return trimmed
}

export function tournamentMapLabel(value: string | null | undefined) {
  const normalized = normalizeTournamentMapName(value)
  if (!normalized) return 'Toutes les cartes'
  return (MAP_LABELS[normalized] ?? normalized).replace(' (Remastered)', '')
}

export function tournamentGameModeLabel(value: string | null | undefined) {
  const normalized = normalizeTournamentGameMode(value)
  if (!normalized) return 'Tous les modes'
  return TOURNAMENT_GAME_MODE_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized
}
