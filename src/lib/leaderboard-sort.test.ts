import { describe, expect, it } from 'vitest'

import type { PlayerStatsEntry } from '@/types/leaderboard'

import { formatPlayTime, formatWinRate, rankLeaderboard } from './leaderboard-sort'

const entry = (memberId: number, values: Partial<PlayerStatsEntry>): PlayerStatsEntry => ({
  id: `stats-${memberId}`,
  memberId,
  displayName: `Joueur ${memberId}`,
  avatarUrl: null,
  period: 'week-2026-39',
  periodType: 'week',
  totalKills: 0,
  totalDamage: 0,
  totalAssists: 0,
  totalRevives: 0,
  matchesPlayed: 0,
  matchesWon: 0,
  winRate: 0,
  avgKillsPerGame: 0,
  avgDamagePerGame: 0,
  soloKills: 0,
  duoClanKills: 0,
  trioClanKills: 0,
  squadClanKills: 0,
  timePlayedSeconds: 0,
  activeDays: 0,
  badgeType: null,
  ...values,
})

const entries = [
  entry(1, { totalKills: 10, totalDamage: 3000 }),
  entry(2, { totalKills: 30, totalDamage: 1000 }),
  entry(3, { totalKills: 20, totalDamage: 2000 }),
]

const order = (rows: ReturnType<typeof rankLeaderboard>) => rows.map(({ entry: e, rank }) => [e.memberId, rank])

describe('rankLeaderboard', () => {
  it('trie en décroissant et numérote dans cet ordre', () => {
    expect(order(rankLeaderboard(entries, 'kills', 'desc'))).toEqual([
      [2, 1],
      [3, 2],
      [1, 3],
    ])
  })

  it('en croissant, inverse l’affichage mais garde le rang du meilleur', () => {
    expect(order(rankLeaderboard(entries, 'kills', 'asc'))).toEqual([
      [1, 3],
      [3, 2],
      [2, 1],
    ])
  })

  it('change de critère sans recharger (dégâts)', () => {
    expect(rankLeaderboard(entries, 'damage', 'desc').map(({ entry: e }) => e.memberId)).toEqual([1, 3, 2])
  })

  it('garde l’ordre reçu à égalité', () => {
    const tied = [entry(5, { totalKills: 4 }), entry(6, { totalKills: 4 }), entry(7, { totalKills: 9 })]
    expect(rankLeaderboard(tied, 'kills', 'desc').map(({ entry: e }) => e.memberId)).toEqual([7, 5, 6])
  })

  it('ne modifie pas le tableau reçu', () => {
    const copy = [...entries]
    rankLeaderboard(entries, 'kills', 'desc')
    expect(entries).toEqual(copy)
  })
})

describe('formats', () => {
  it('écrit le temps et le win rate à la française', () => {
    expect(formatPlayTime(45_000)).toBe('12 h 30')
    expect(formatPlayTime(0)).toBe('0 h 00')
    expect(formatWinRate(0.1).replace(/\s/g, ' ')).toBe('10,0 %')
  })
})
