import type { DistinctionBadgeKey } from '@/lib/distinction-badges'

/**
 * Distinctions d'un classement — calcul unique côté client (docs/TODO/refonte-ui.md §3).
 *
 * Mêmes règles que les badges enregistrés par `assignBadges` (`stats-calculator.ts`) : win rate à partir de
 * 3 matchs, MVP = kills et dégâts normalisés + win rate. La différence : ici, le calcul porte sur les lignes
 * affichées, donc sur les filtres de la page (type de match, mode d'escouade), et un joueur peut cumuler
 * plusieurs distinctions. Le `badgeType` enregistré reste celui du profil du joueur.
 */

export type DistinctionEntry = {
  memberId: number
  displayName: string
  totalKills: number
  totalDamage: number
  matchesPlayed: number
  winRate: number
}

export type Distinction<E extends DistinctionEntry = DistinctionEntry> = {
  key: DistinctionBadgeKey
  entry: E
  /** Valeur affichée (vide pour le MVP, qui combine plusieurs critères). */
  value: string
}

/** Nombre minimal de matchs pour le win rate et le K/M (en deçà, un seul match gagné ferait 100 %). */
export const DISTINCTION_MIN_MATCHES = 3

export const DISTINCTION_ORDER: readonly DistinctionBadgeKey[] = ['top_killer', 'top_damage', 'best_wr', 'mvp', 'best_kpm']

const number = new Intl.NumberFormat('fr-FR')
const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const killsPerMatch = (entry: DistinctionEntry) => (entry.matchesPlayed > 0 ? entry.totalKills / entry.matchesPlayed : 0)

function best<E>(candidates: E[], score: (entry: E) => number): E | null {
  let winner: E | null = null
  let winnerScore = Number.NEGATIVE_INFINITY
  for (const entry of candidates) {
    const value = score(entry)
    // Égalité : le premier rencontré garde la distinction (ordre du classement).
    if (value > winnerScore) {
      winner = entry
      winnerScore = value
    }
  }
  return winner
}

export function computeDistinctions<E extends DistinctionEntry>(entries: readonly E[]): Distinction<E>[] {
  const withMatches = entries.filter((entry) => entry.matchesPlayed > 0)
  const withMinMatches = withMatches.filter((entry) => entry.matchesPlayed >= DISTINCTION_MIN_MATCHES)
  const kpmCandidates = withMinMatches.length > 0 ? withMinMatches : withMatches

  const maxKills = Math.max(...withMatches.map((entry) => entry.totalKills), 1)
  const maxDamage = Math.max(...withMatches.map((entry) => entry.totalDamage), 1)

  const winners: Record<DistinctionBadgeKey, E | null> = {
    top_killer: best(
      entries.filter((entry) => entry.totalKills > 0),
      (entry) => entry.totalKills
    ),
    top_damage: best(
      withMatches.filter((entry) => entry.totalDamage > 0),
      (entry) => entry.totalDamage
    ),
    best_wr: best(withMinMatches, (entry) => entry.winRate),
    mvp: best(
      withMatches,
      (entry) => entry.totalKills / maxKills + entry.totalDamage / maxDamage + entry.winRate
    ),
    best_kpm: best(kpmCandidates, killsPerMatch),
  }

  const format: Record<DistinctionBadgeKey, (entry: E) => string> = {
    top_killer: (entry) => number.format(entry.totalKills),
    top_damage: (entry) => number.format(Math.round(entry.totalDamage)),
    best_wr: (entry) => `${percent.format(entry.winRate * 100)} %`,
    mvp: () => '',
    best_kpm: (entry) => decimal.format(killsPerMatch(entry)),
  }

  return DISTINCTION_ORDER.flatMap((key) => {
    const entry = winners[key]
    return entry ? [{ key, entry, value: format[key](entry) }] : []
  })
}

/** Distinctions de chaque joueur (icônes à côté du nom). */
export function distinctionsByMember(distinctions: readonly Distinction[]): Map<number, DistinctionBadgeKey[]> {
  const byMember = new Map<number, DistinctionBadgeKey[]>()
  for (const distinction of distinctions) {
    const keys = byMember.get(distinction.entry.memberId) ?? []
    keys.push(distinction.key)
    byMember.set(distinction.entry.memberId, keys)
  }
  return byMember
}
