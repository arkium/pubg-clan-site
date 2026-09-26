import { describe, expect, it } from 'vitest'

import { aggregateActivity, isSleeping, matchesQuery, pickClanOfMoment, relativeLastGame, sortDirectory } from './clan-directory'

const NOW = new Date('2026-09-26T20:30:00.000Z') // samedi 22:30 à Paris

describe('clan-directory — activité', () => {
  it('compte parties et top 1 sur 7 jours, et les joueurs distincts de la soirée en cours', () => {
    const { byClan, tonightPlayers } = aggregateActivity(
      [
        // Deux membres du clan 1 dans la même partie : une seule partie.
        { clanId: 1, memberId: 10, squadMatchId: 'a', placement: 1, createdAt: '2026-09-26T19:00:00.000Z' },
        { clanId: 1, memberId: 11, squadMatchId: 'a', placement: 1, createdAt: '2026-09-26T19:00:00.000Z' },
        // 02:00 à Paris le 26 : soirée du 25, pas ce soir.
        { clanId: 1, memberId: 12, squadMatchId: 'b', placement: 7, createdAt: '2026-09-26T00:00:00.000Z' },
        { clanId: 2, memberId: 20, squadMatchId: 'c', placement: 3, createdAt: '2026-09-22T19:00:00.000Z' },
      ],
      '2026-09-26'
    )
    expect(byClan.get(1)).toEqual({ games7: 2, wins7: 1, playedTonight: 2 })
    expect(byClan.get(2)).toEqual({ games7: 1, wins7: 0, playedTonight: 0 })
    expect(tonightPlayers).toBe(2)
  })

  it('élit le clan du moment : top 1 sur 7 jours, au moins 5 parties, jamais le clan technique', () => {
    expect(
      pickClanOfMoment([
        { clanId: 1, games7: 40, wins7: 7 },
        { clanId: 2, games7: 20, wins7: 7 }, // même nombre de top 1, meilleur taux
        { clanId: 3, games7: 3, wins7: 3 }, // trop peu de parties
        { clanId: 4, games7: 90, wins7: 12, isSystem: true },
      ])
    ).toBe(2)
    expect(pickClanOfMoment([{ clanId: 1, games7: 10, wins7: 0 }])).toBeNull()
  })

  it('met en sommeil un clan sans partie depuis 14 jours', () => {
    expect(isSleeping('2026-09-20T20:00:00.000Z', NOW)).toBe(false)
    expect(isSleeping('2026-09-10T20:00:00.000Z', NOW)).toBe(true)
    expect(isSleeping(null, NOW)).toBe(true)
  })
})

describe('clan-directory — tri, recherche, dates', () => {
  const entries = [
    { id: 1, name: 'La Meute', tag: 'MTFR', membersCount: 22, games7: 64, wins7: 7, playedTonight: 0, lastMatchAt: '2026-09-26T18:00:00.000Z' },
    { id: 2, name: 'Les Ratz', tag: 'RATZ', membersCount: 18, games7: 51, wins7: 3, playedTonight: 4, lastMatchAt: '2026-09-26T19:00:00.000Z' },
    { id: 3, name: 'bof team', tag: 'BOFS', membersCount: 30, games7: 12, wins7: 0, playedTonight: 0, lastMatchAt: '2026-09-25T19:00:00.000Z' },
  ]

  it('trie par activité (joueurs de la soirée d’abord), nom, effectif ou parties', () => {
    expect(sortDirectory(entries, 'activity').map((e) => e.id)).toEqual([2, 1, 3])
    expect(sortDirectory(entries, 'name').map((e) => e.id)).toEqual([3, 1, 2])
    expect(sortDirectory(entries, 'members').map((e) => e.id)).toEqual([3, 1, 2])
    expect(sortDirectory(entries, 'games').map((e) => e.id)).toEqual([1, 2, 3])
  })

  it('cherche par nom ou tag, crochets et casse ignorés', () => {
    expect(matchesQuery(entries[1], '[ratz]')).toBe(true)
    expect(matchesQuery(entries[0], 'meute')).toBe(true)
    expect(matchesQuery(entries[0], 'xyz')).toBe(false)
    expect(matchesQuery(entries[0], '  ')).toBe(true)
  })

  it('écrit la dernière partie en relatif', () => {
    expect(relativeLastGame('2026-09-26T20:10:00.000Z', NOW)).toBe('il y a moins d’une heure')
    expect(relativeLastGame('2026-09-26T17:00:00.000Z', NOW)).toBe('il y a 3 h')
    expect(relativeLastGame('2026-09-26T08:00:00.000Z', NOW)).toBe('ce soir')
    expect(relativeLastGame('2026-09-25T19:00:00.000Z', NOW)).toBe('hier')
    expect(relativeLastGame('2026-09-22T19:00:00.000Z', NOW)).toBe('mar.')
    expect(relativeLastGame('2026-09-02T19:00:00.000Z', NOW)).toBe('le 02/09')
    expect(relativeLastGame(null, NOW)).toBe('aucune partie')
  })
})
