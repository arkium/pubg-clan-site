import { describe, expect, it } from 'vitest'

import { computeDistinctions, distinctionsByMember, type DistinctionEntry } from './distinctions'

const entry = (memberId: number, values: Partial<DistinctionEntry>): DistinctionEntry => ({
  memberId,
  displayName: `Joueur ${memberId}`,
  totalKills: 0,
  totalDamage: 0,
  matchesPlayed: 0,
  winRate: 0,
  ...values,
})

describe('computeDistinctions', () => {
  it('attribue les cinq distinctions dans l’ordre, avec leurs valeurs formatées', () => {
    const entries = [
      entry(1, { totalKills: 60, totalDamage: 7200, matchesPlayed: 30, winRate: 0.1 }),
      entry(2, { totalKills: 40, totalDamage: 8000, matchesPlayed: 20, winRate: 0.143 }),
      entry(3, { totalKills: 30, totalDamage: 3000, matchesPlayed: 10, winRate: 0.05 }),
    ]
    const result = computeDistinctions(entries).map(({ key, entry: winner, value }) => [key, winner.memberId, value])
    expect(result).toEqual([
      ['top_killer', 1, '60'],
      ['top_damage', 2, '8 000'],
      ['best_wr', 2, '14,3 %'],
      ['mvp', 1, ''],
      ['best_kpm', 3, '3,00'],
    ])
  })

  it('ne donne le win rate qu’à partir de 3 matchs', () => {
    const entries = [
      entry(1, { totalKills: 5, totalDamage: 500, matchesPlayed: 2, winRate: 1 }),
      entry(2, { totalKills: 10, totalDamage: 900, matchesPlayed: 5, winRate: 0.2 }),
    ]
    const bestWr = computeDistinctions(entries).find((distinction) => distinction.key === 'best_wr')
    expect(bestWr?.entry.memberId).toBe(2)
  })

  it('retombe sur tous les joueurs ayant joué pour le K/M quand personne n’a 3 matchs', () => {
    const entries = [entry(1, { totalKills: 4, matchesPlayed: 2 }), entry(2, { totalKills: 3, matchesPlayed: 1 })]
    const kpm = computeDistinctions(entries).find((distinction) => distinction.key === 'best_kpm')
    expect(kpm?.entry.memberId).toBe(2)
    expect(computeDistinctions(entries).some((distinction) => distinction.key === 'best_wr')).toBe(false)
  })

  it('ne distingue personne sur un classement vide ou sans kill', () => {
    expect(computeDistinctions([])).toEqual([])
    expect(computeDistinctions([entry(1, {})])).toEqual([])
  })

  it('garde le premier joueur du classement en cas d’égalité', () => {
    const entries = [entry(1, { totalKills: 10, matchesPlayed: 5 }), entry(2, { totalKills: 10, matchesPlayed: 5 })]
    expect(computeDistinctions(entries)[0].entry.memberId).toBe(1)
  })
})

describe('distinctionsByMember', () => {
  it('regroupe les distinctions par joueur', () => {
    const entries = [
      entry(1, { totalKills: 60, totalDamage: 7200, matchesPlayed: 30, winRate: 0.1 }),
      entry(2, { totalKills: 10, totalDamage: 100, matchesPlayed: 3, winRate: 0.5 }),
    ]
    const byMember = distinctionsByMember(computeDistinctions(entries))
    expect(byMember.get(1)).toEqual(['top_killer', 'top_damage', 'mvp'])
    expect(byMember.get(2)).toEqual(['best_wr', 'best_kpm'])
  })
})
