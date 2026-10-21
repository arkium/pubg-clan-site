import { describe, expect, it } from 'vitest'

import {
  buildPlayerStatusesWhere,
  buildPlayerStatusWhereClause,
  derivePlayerResolutionStatus,
  type EncounteredPlayerResolutionStatus,
  type PlayerStatusRow,
} from './encountered-player-status'

/**
 * Le Triage et le tableau de bord de résolution filtrent et comptent par `buildPlayerStatusWhereClause` (SQL), les
 * lignes affichées portent `derivePlayerResolutionStatus` : les deux doivent classer chaque joueur pareil.
 */

const thresholds = { minEncounters: 2, maxAttempts: 3 }
const STATUSES: EncounteredPlayerResolutionStatus[] = [
  'below_threshold',
  'never_attempted',
  'retry_pending',
  'failed',
  'resolved_with_clan',
  'resolved_without_clan',
]

type Filter = null | number | { not?: null; gt?: number; gte?: number; lt?: number }

/** Évalue le sous-ensemble de filtres Prisma produit par `buildPlayerStatusWhereClause` et `buildPlayerStatusesWhere`. */
function matches(row: PlayerStatusRow, where: Record<string, Filter> | { OR: Array<Record<string, Filter>> }): boolean {
  if ('OR' in where) return (where.OR as Array<Record<string, Filter>>).some((branch) => matches(row, branch))
  return Object.entries(where as Record<string, Filter>).every(([field, filter]) => {
    const value = row[field as keyof PlayerStatusRow] as number | string | Date | null
    if (filter === null) return value === null
    if (typeof filter === 'number') return value === filter
    if ('not' in filter) return value !== null
    const n = value as number
    return (
      (filter.gt === undefined || n > filter.gt) &&
      (filter.gte === undefined || n >= filter.gte) &&
      (filter.lt === undefined || n < filter.lt)
    )
  })
}

describe('statut de résolution d’une identité Player', () => {
  const rows: PlayerStatusRow[] = []
  for (const encounterCount of [1, 2, 5])
    for (const resolveAttempts of [0, 1, 2, 3, 4])
      for (const clanResolvedAt of [null, new Date('2026-10-21T00:00:00Z')])
        for (const opponentClanId of [null, 'oc-1']) rows.push({ encounterCount, resolveAttempts, clanResolvedAt, opponentClanId })

  it('chaque joueur croisé relève d’un seul filtre, celui de son statut dérivé', () => {
    for (const row of rows) {
      const matching = STATUSES.filter((status) =>
        matches(row, buildPlayerStatusWhereClause(status, thresholds) as Record<string, Filter>)
      )
      expect(matching, JSON.stringify(row)).toEqual([derivePlayerResolutionStatus(row, thresholds)])
    }
  })

  it('la clause compacte de plusieurs statuts retient exactement les joueurs de ces statuts, pour chaque ensemble', () => {
    for (let mask = 1; mask < 1 << STATUSES.length; mask += 1) {
      const subset = STATUSES.filter((_, index) => mask & (1 << index))
      const where = buildPlayerStatusesWhere(subset, thresholds) as Record<string, Filter>
      for (const row of rows) {
        expect(matches(row, where), `${subset.join('+')} ${JSON.stringify(row)}`).toBe(
          subset.includes(derivePlayerResolutionStatus(row, thresholds))
        )
      }
    }
  })

  it('les ensembles usuels se réduisent à une condition indexable', () => {
    expect(buildPlayerStatusesWhere(['never_attempted', 'retry_pending', 'failed'], thresholds)).toEqual({
      clanResolvedAt: null,
      encounterCount: { gte: 2 },
    })
    expect(buildPlayerStatusesWhere(STATUSES, thresholds)).toEqual({ encounterCount: { gt: 0 } })
    expect(buildPlayerStatusesWhere([], thresholds)).toEqual({ encounterCount: { gt: 0 } })
  })

  it('« avec clan » se lit sur opponentClanId', () => {
    const resolved = { encounterCount: 3, resolveAttempts: 0, clanResolvedAt: new Date() }
    expect(derivePlayerResolutionStatus({ ...resolved, opponentClanId: 'oc-1' }, thresholds)).toBe('resolved_with_clan')
    expect(derivePlayerResolutionStatus({ ...resolved, opponentClanId: null }, thresholds)).toBe('resolved_without_clan')
  })

  it('un joueur jamais croisé (membre suivi seul) ne relève d’aucun statut', () => {
    for (const row of [
      { encounterCount: 0, resolveAttempts: 0, clanResolvedAt: null, opponentClanId: null },
      { encounterCount: 0, resolveAttempts: 0, clanResolvedAt: new Date(), opponentClanId: 'oc-1' },
    ]) {
      const matching = STATUSES.filter((status) =>
        matches(row, buildPlayerStatusWhereClause(status, thresholds) as Record<string, Filter>)
      )
      expect(matching).toEqual([])
      for (let mask = 1; mask < 1 << STATUSES.length; mask += 1) {
        const subset = STATUSES.filter((_, index) => mask & (1 << index))
        expect(matches(row, buildPlayerStatusesWhere(subset, thresholds) as Record<string, Filter>)).toBe(false)
      }
    }
  })
})
