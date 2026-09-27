import { describe, expect, it } from 'vitest'

import {
  dominantRole,
  filterRoster,
  isInReserve,
  killsPerMatch,
  lastSeenLabel,
  playedTonight,
  rosterInitials,
  sortRoster,
  splitRoster,
  winRatePercent,
  type RosterMember,
} from './member-roster'

// Samedi 27/09/2026, 22:00 à Paris (20:00 UTC).
const NOW = new Date('2026-09-27T20:00:00.000Z')

function member(overrides: Partial<RosterMember> & Pick<RosterMember, 'memberId' | 'displayName'>): RosterMember {
  return {
    pubgPlayerName: overrides.displayName,
    avatarUrl: null,
    lastMatchAt: '2026-09-27T19:00:00.000Z',
    role: null,
    recent: { matches: 10, kills: 20, wins: 1 },
    favoriteWeapon: null,
    medals: { gold: 0, silver: 0, bronze: 0 },
    ...overrides,
  }
}

describe('dominantRole', () => {
  it('prend le plus haut des trois scores, aucun rôle quand tout est nul', () => {
    expect(dominantRole({ aggression: 82, support: 40, zoneDiscipline: 66 })).toEqual({ id: 'fragger', score: 82 })
    expect(dominantRole({ aggression: 10, support: 61, zoneDiscipline: 60 })).toEqual({ id: 'medic', score: 61 })
    expect(dominantRole({ aggression: 0, support: 0, zoneDiscipline: 0 })).toBeNull()
  })

  it('égalité : Fragger, puis Medic, puis Ghost', () => {
    expect(dominantRole({ aggression: 50, support: 50, zoneDiscipline: 50 })?.id).toBe('fragger')
    expect(dominantRole({ aggression: 0, support: 50, zoneDiscipline: 50 })?.id).toBe('medic')
  })
})

describe('activité', () => {
  it('« ce soir » suit la journée de jeu de Paris (06:00), pas la date UTC', () => {
    // 01:30 à Paris le 28 = même soirée que 22:00 le 27.
    const lateNight = new Date('2026-09-27T23:30:00.000Z')
    expect(playedTonight('2026-09-27T19:00:00.000Z', lateNight)).toBe(true)
    // La veille à 23:00 (Paris) : autre soirée.
    expect(playedTonight('2026-09-26T21:00:00.000Z', NOW)).toBe(false)
    expect(playedTonight(null, NOW)).toBe(false)
  })

  it('libellés : ce soir, il y a, date en réserve, jamais', () => {
    expect(lastSeenLabel('2026-09-27T19:00:00.000Z', NOW)).toBe('a joué ce soir')
    expect(lastSeenLabel('2026-09-26T21:00:00.000Z', NOW)).toBe('vu il y a 23 h')
    expect(lastSeenLabel('2026-09-20T20:00:00.000Z', NOW)).toBe('vu il y a 7 j')
    expect(lastSeenLabel('2026-08-21T18:00:00.000Z', NOW)).toBe('dernière partie le 21/08')
    expect(lastSeenLabel(null, NOW)).toBe('aucune partie suivie')
  })

  it('réserve : plus de 30 jours sans partie, ou aucune', () => {
    expect(isInReserve('2026-08-29T20:00:00.000Z', NOW)).toBe(false)
    expect(isInReserve('2026-08-27T19:00:00.000Z', NOW)).toBe(true)
    expect(isInReserve(null, NOW)).toBe(true)
  })
})

describe('chiffres, tri et filtres', () => {
  const alpha = member({ memberId: 1, displayName: 'Joueur Alpha', recent: { matches: 20, kills: 60, wins: 4 }, medals: { gold: 1, silver: 0, bronze: 0 }, role: { id: 'fragger', score: 80 } })
  const bravo = member({ memberId: 2, displayName: 'Joueur Bravo', pubgPlayerName: 'Bravo_FR', lastMatchAt: '2026-09-25T20:00:00.000Z', recent: { matches: 5, kills: 20, wins: 0 }, medals: { gold: 0, silver: 2, bronze: 0 }, role: { id: 'ghost', score: 70 } })
  const echo = member({ memberId: 5, displayName: 'Élodie', lastMatchAt: '2026-09-26T20:00:00.000Z', recent: { matches: 0, kills: 0, wins: 0 } })
  const juliett = member({ memberId: 10, displayName: 'Joueur Juliett', lastMatchAt: '2026-08-01T20:00:00.000Z', recent: { matches: 0, kills: 0, wins: 0 } })

  it('K/M et win rate sur 30 jours, 0 sans partie', () => {
    expect(killsPerMatch(alpha)).toBe(3)
    expect(winRatePercent(alpha)).toBe(20)
    expect(killsPerMatch(echo)).toBe(0)
  })

  it('tri : activité, nom, K/M (sans partie en dernier), médailles', () => {
    const list = [bravo, echo, alpha]
    expect(sortRoster(list, 'activity').map((m) => m.memberId)).toEqual([1, 5, 2])
    expect(sortRoster(list, 'name').map((m) => m.memberId)).toEqual([5, 1, 2])
    expect(sortRoster(list, 'kpm').map((m) => m.memberId)).toEqual([2, 1, 5])
    expect(sortRoster(list, 'medals').map((m) => m.memberId)).toEqual([2, 1, 5])
  })

  it('filtre par rôle et par nom ou pseudo, sans accents ni casse', () => {
    const list = [alpha, bravo, echo]
    expect(filterRoster(list, 'ghost', '').map((m) => m.memberId)).toEqual([2])
    expect(filterRoster(list, 'all', 'bravo_fr').map((m) => m.memberId)).toEqual([2])
    expect(filterRoster(list, 'all', 'elo').map((m) => m.memberId)).toEqual([5])
  })

  it('réserve séparée des actifs', () => {
    const { active, reserve } = splitRoster([juliett, alpha, echo], NOW)
    expect(active.map((m) => m.memberId)).toEqual([1, 5])
    expect(reserve.map((m) => m.memberId)).toEqual([10])
  })

  it('initiales de l’avatar', () => {
    expect(rosterInitials('Joueur Alpha')).toBe('JA')
    expect(rosterInitials('xX_Kr4ken_Xx')).toBe('XK')
    expect(rosterInitials('Élodie')).toBe('EL')
    expect(rosterInitials('Émile Ïnès')).toBe('EI')
  })
})
