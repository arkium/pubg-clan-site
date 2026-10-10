import { TournamentInputError } from '@/lib/tournament-schedule'

/**
 * Titre d'un tournoi — docs/features/tournois.md, « Horaires et aperçu de la vitrine ». Il s'affiche sur la vitrine
 * publique (`/`), sur `/tournaments` et dans les messages Discord : toujours en texte (React échappe tout, rien n'est
 * interprété), mais un lien ou une balise y serait au mieux du bruit, au pire de la publicité ou de l'hameçonnage. Le
 * formulaire et l'API appliquent la même règle.
 */

export const TOURNAMENT_TITLE_MAX_LENGTH = 80

const HTML_PATTERN = /[<>]/
// Adresse de site : schéma, « www. », invitation Discord, ou nom de domaine courant (« monclan.fr »).
const LINK_PATTERN = /(https?:\/\/|www\.|discord\.gg\/|\b[a-z0-9-]+\.(com|fr|net|org|gg|io|be|eu|tv|ly)\b)/i

/** Message d'erreur du titre, ou `null` s'il est acceptable. */
export function tournamentTitleProblem(title: string): string | null {
  const trimmed = title.trim()
  if (!trimmed) return 'Le titre du tournoi est obligatoire.'
  if (trimmed.length > TOURNAMENT_TITLE_MAX_LENGTH) return `Le titre ne peut pas dépasser ${TOURNAMENT_TITLE_MAX_LENGTH} caractères.`
  if (HTML_PATTERN.test(trimmed)) return 'Le titre ne peut contenir ni chevron ni balise HTML : il s’affiche sur la vitrine publique.'
  if (LINK_PATTERN.test(trimmed)) return 'Le titre ne peut contenir ni lien ni adresse de site : il s’affiche sur la vitrine publique.'
  return null
}

/** Titre nettoyé, ou erreur de saisie (400) s'il est refusé. */
export function normalizeTournamentTitle(title: string | null | undefined) {
  const problem = tournamentTitleProblem(title ?? '')
  if (problem) throw new TournamentInputError(problem)
  return (title ?? '').trim()
}
