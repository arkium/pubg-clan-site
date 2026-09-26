import { describe, expect, it } from 'vitest'

import { groupByIntent, pickDuo, pickMvp, pubgClanFacts, sessionsOf, synergyBars, winStreak } from './clan-showcase'

const pair = (ids: number[], games: number, winRate: number) => ({
  memberIds: ids,
  memberNames: ids.map((id) => `Joueur ${id}`),
  matchesPlayed: games,
  totalKills: games * 2,
  winRate,
})

describe('clan-showcase — briefing', () => {
  it('regroupe les parties par soirée (journée de jeu à Paris), la plus récente d’abord', () => {
    const sessions = sessionsOf([
      { id: 'a', placement: 1, createdAt: '2026-09-26T19:00:00.000Z', members: [] },
      // 02:00 à Paris le 26 : soirée du 25.
      { id: 'b', placement: 4, createdAt: '2026-09-26T00:00:00.000Z', members: [] },
      { id: 'c', placement: 1, createdAt: '2026-09-25T20:00:00.000Z', members: [] },
      { id: 'd', placement: 9, createdAt: '2026-09-23T20:00:00.000Z', members: [] },
    ])
    expect(sessions).toEqual([
      { date: '2026-09-26', games: 1, wins: 1 },
      { date: '2026-09-25', games: 2, wins: 1 },
      { date: '2026-09-23', games: 1, wins: 0 },
    ])
  })

  it('compte la série de soirées consécutives avec un top 1', () => {
    expect(
      winStreak([
        { date: '2026-09-26', wins: 2 },
        { date: '2026-09-25', wins: 1 },
        { date: '2026-09-23', wins: 0 },
        { date: '2026-09-21', wins: 3 },
      ])
    ).toEqual({ count: 2, dates: ['2026-09-25', '2026-09-26'] })
    expect(winStreak([{ date: '2026-09-26', wins: 0 }])).toEqual({ count: 0, dates: [] })
  })

  it('désigne le MVP d’une partie, personne sans kill', () => {
    expect(pickMvp([{ name: 'A', kills: 2 }, { name: 'B', kills: 6 }])).toEqual({ name: 'B', kills: 6 })
    expect(pickMvp([{ name: 'A', kills: 0 }])).toBeNull()
  })

  it('lit le niveau et les membres dans la fiche PUBG synchronisée', () => {
    expect(pubgClanFacts({ pubg: { memberCount: 55, raw: { attributes: { clanLevel: 17 } } } })).toEqual({ level: 17, memberCount: 55 })
    expect(pubgClanFacts(null)).toEqual({ level: null, memberCount: null })
  })
})

describe('clan-showcase — duo et synergies', () => {
  const pairs = [pair([1, 2], 14, 0.286), pair([3, 4], 4, 0.75), pair([1, 5], 20, 0.286), pair([2, 3], 9, 0.1)]

  it('choisit le duo au meilleur taux de top 1 parmi les paires d’au moins 5 parties', () => {
    // [3,4] : 75 % mais 4 parties, écarté ; à égalité (28,6 %), la paire la plus assidue.
    expect(pickDuo(pairs)?.memberIds).toEqual([1, 5])
    expect(pickDuo([pair([1, 2], 2, 1)])).toBeNull()
  })

  it('construit les barres des synergies, à l’échelle de la meilleure', () => {
    const bars = synergyBars([...pairs, pair([1, 2, 3, 4], 8, 0.143)])
    expect(bars.map((bar) => bar.key)).toEqual(['1:5', '1:2', '1:2:3:4', '2:3'])
    expect(bars[0]).toMatchObject({ mode: 'duo', names: 'Joueur 1 + Joueur 5', widthPercent: 100 })
    expect(bars[2]).toMatchObject({ mode: 'squad', names: 'Joueur 1, Joueur 2, Joueur 3, Joueur 4', widthPercent: 50 })
  })
})

describe('clan-showcase — navigation par intention', () => {
  it('range chaque page du clan dans une intention, sans perdre une page inconnue ni garder la vue d’ensemble', () => {
    const groups = groupByIntent([
      { navKey: 'clan.overview' },
      { navKey: 'clan.matches' },
      { navKey: 'clan.stats-weapons' },
      { navKey: 'clan.awards' },
      { navKey: 'clan.nouvelle-page' },
    ])
    expect(groups.play.map((item) => item.navKey)).toEqual(['clan.matches'])
    expect(groups.improve.map((item) => item.navKey)).toEqual(['clan.stats-weapons', 'clan.nouvelle-page'])
    expect(groups.compete.map((item) => item.navKey)).toEqual(['clan.awards'])
  })
})
