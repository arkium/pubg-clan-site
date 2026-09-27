import { sessionDateOf } from '@/lib/match-sessions'
import { elapsedLabel } from '@/lib/relative-time'

/**
 * Annuaire des membres d'un clan (`/clans/[clanId]/members`, docs/features/membres.md) : une fiche par joueur — rôle
 * dominant, activité, trois chiffres sur 30 jours, arme fétiche, médailles. Module pur, testé par
 * `member-roster.test.ts` ; la route prépare les données, la page les affiche.
 */

export type RosterRoleId = 'fragger' | 'medic' | 'ghost'

export const ROSTER_ROLES: Array<{ id: RosterRoleId; label: string; color: string; tint: string }> = [
  { id: 'fragger', label: 'Fragger', color: '#f87171', tint: 'rgba(239, 68, 68, 0.18)' },
  { id: 'medic', label: 'Medic', color: '#38bdf8', tint: 'rgba(14, 165, 233, 0.18)' },
  { id: 'ghost', label: 'Ghost', color: '#34d399', tint: 'rgba(16, 185, 129, 0.18)' },
]

export const rosterRole = (id: RosterRoleId) => ROSTER_ROLES.find((role) => role.id === id)!

/** Fenêtre des trois chiffres de la carte et seuil de la réserve. */
export const ROSTER_WINDOW_DAYS = 30

export type RosterMember = {
  memberId: number
  displayName: string
  pubgPlayerName: string
  avatarUrl: string | null
  /** Dernière partie importée, toutes périodes confondues. */
  lastMatchAt: string | null
  /** Rôle dominant depuis le début du suivi (scores de télémétrie `all-time`). */
  role: { id: RosterRoleId; score: number } | null
  /** Parties officielles des 30 derniers jours. */
  recent: { matches: number; kills: number; wins: number }
  favoriteWeapon: { id: string; label: string } | null
  medals: { gold: number; silver: number; bronze: number }
}

export type RosterSort = 'activity' | 'name' | 'kpm' | 'medals'
export type RosterRoleFilter = 'all' | RosterRoleId

/**
 * Rôle dominant : le plus haut des trois scores de style de jeu (Fragger = agressivité, Medic = support, Ghost =
 * discipline de zone). Aucun rôle tant que tous les scores sont nuls. Égalité : l'ordre Fragger, Medic, Ghost.
 */
export function dominantRole(scores: { aggression: number; support: number; zoneDiscipline: number }) {
  const candidates: Array<{ id: RosterRoleId; score: number }> = [
    { id: 'fragger', score: scores.aggression },
    { id: 'medic', score: scores.support },
    { id: 'ghost', score: scores.zoneDiscipline },
  ]
  let best: { id: RosterRoleId; score: number } | null = null
  for (const candidate of candidates) {
    if (Number.isFinite(candidate.score) && candidate.score > 0 && (!best || candidate.score > best.score)) best = candidate
  }
  return best
}

/**
 * « A joué ce soir » : sa dernière partie appartient à la soirée en cours (journée de jeu de Paris, 06:00 → 06:00).
 * Remplace le « en jeu » de la maquette : l'import est horaire, on ne sait pas qui joue à la minute près.
 */
export function playedTonight(lastMatchAt: string | null, now: Date) {
  return lastMatchAt !== null && sessionDateOf(lastMatchAt) === sessionDateOf(now)
}

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' })

/** « a joué ce soir », « vu il y a 3 h », « vu il y a 2 j » ; dans la réserve : « dernière partie le 21/08 ». */
export function lastSeenLabel(lastMatchAt: string | null, now: Date) {
  if (!lastMatchAt) return 'aucune partie suivie'
  if (playedTonight(lastMatchAt, now)) return 'a joué ce soir'
  if (isInReserve(lastMatchAt, now)) return `dernière partie le ${dayMonth.format(new Date(lastMatchAt))}`
  return `vu ${elapsedLabel(lastMatchAt, now)}`
}

/** En réserve : aucune partie depuis 30 jours (ou jamais). */
export function isInReserve(lastMatchAt: string | null, now: Date) {
  if (!lastMatchAt) return true
  return now.getTime() - new Date(lastMatchAt).getTime() > ROSTER_WINDOW_DAYS * 86_400_000
}

export const killsPerMatch = (member: RosterMember) => (member.recent.matches > 0 ? member.recent.kills / member.recent.matches : 0)
export const winRatePercent = (member: RosterMember) => (member.recent.matches > 0 ? (member.recent.wins / member.recent.matches) * 100 : 0)
/** Or = 3, argent = 2, bronze = 1. */
export const medalScore = (member: RosterMember) => member.medals.gold * 3 + member.medals.silver * 2 + member.medals.bronze

const byName = (left: RosterMember, right: RosterMember) => left.displayName.localeCompare(right.displayName, 'fr', { sensitivity: 'base' })
const lastMatchTime = (member: RosterMember) => (member.lastMatchAt ? new Date(member.lastMatchAt).getTime() : 0)

export function sortRoster(members: readonly RosterMember[], sort: RosterSort): RosterMember[] {
  const sorted = [...members]
  if (sort === 'name') return sorted.sort(byName)
  if (sort === 'kpm') {
    // Sans partie sur 30 jours, un K/M de 0 n'est pas un classement : ces joueurs passent derrière.
    return sorted.sort(
      (a, b) => Number(b.recent.matches > 0) - Number(a.recent.matches > 0) || killsPerMatch(b) - killsPerMatch(a) || byName(a, b)
    )
  }
  if (sort === 'medals') return sorted.sort((a, b) => medalScore(b) - medalScore(a) || byName(a, b))
  return sorted.sort((a, b) => lastMatchTime(b) - lastMatchTime(a) || byName(a, b))
}

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

export function filterRoster(members: readonly RosterMember[], role: RosterRoleFilter, query: string) {
  const needle = fold(query.trim())
  return members.filter(
    (member) =>
      (role === 'all' || member.role?.id === role) &&
      (!needle || fold(member.displayName).includes(needle) || fold(member.pubgPlayerName).includes(needle))
  )
}

/** Actifs (au moins une partie sur 30 jours) et réserve (repliée en bas, triée par dernière partie). */
export function splitRoster(members: readonly RosterMember[], now: Date) {
  const active: RosterMember[] = []
  const reserve: RosterMember[] = []
  for (const member of members) (isInReserve(member.lastMatchAt, now) ? reserve : active).push(member)
  return { active, reserve: sortRoster(reserve, 'activity') }
}

/** Deux lettres pour l'avatar sans image : « Joueur Alpha » → « JA », « xX_Kr4ken » → « XK », « Élodie » → « EL ». */
export function rosterInitials(name: string) {
  const words = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
  const letters = words.length === 1 ? words[0].slice(0, 2) : words.map((word) => word[0]).slice(0, 2).join('')
  return letters.toUpperCase() || name.trim().slice(0, 2).toUpperCase() || '??'
}
