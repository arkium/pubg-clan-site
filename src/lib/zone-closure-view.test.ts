import { describe, expect, it } from 'vitest'

import {
  bandShares,
  memberZoneProfile,
  rankZoneMembers,
  ratioPercent,
  zoneTitles,
  zoneVerdict,
  type ZoneMemberStat,
} from './zone-closure-view'

const member = (memberId: number, positions: number, averageRatio: number, center: number, edge: number, outside: number): ZoneMemberStat => ({
  memberId,
  displayName: `Joueur ${memberId}`,
  positions,
  averageRatio,
  bands: { center, edge, outside },
})

describe('bandShares / ratioPercent', () => {
  it('parts en pourcentage, zéro sans observation', () => {
    expect(bandShares({ center: 1, edge: 2, outside: 1 })).toEqual({ total: 4, center: 25, edge: 50, outside: 25 })
    expect(bandShares({ center: 0, edge: 0, outside: 0 }).center).toBe(0)
    expect(ratioPercent(0.934)).toBe(93)
  })
})

describe('zoneVerdict', () => {
  it('dehors d’abord, puis centre, puis bord, sinon équilibré', () => {
    // Semaine du clan 13 (2026-10-04) : 32 % dehors.
    expect(zoneVerdict({ center: 71, edge: 275, outside: 165 })?.key).toBe('late')
    expect(zoneVerdict({ center: 30, edge: 60, outside: 10 })?.key).toBe('center')
    // Mois du clan 13 : 61 % au bord.
    expect(zoneVerdict({ center: 76, edge: 241, outside: 75 })?.key).toBe('edge')
    expect(zoneVerdict({ center: 20, edge: 52, outside: 28 })?.key).toBe('balanced')
    expect(zoneVerdict({ center: 0, edge: 0, outside: 0 })).toBeNull()
  })

  it('la phrase donne la part qui justifie le verdict', () => {
    expect(zoneVerdict({ center: 71, edge: 275, outside: 165 })?.sentence).toMatch(/^32 % des fermetures vous trouvent encore dehors/)
  })
})

describe('memberZoneProfile', () => {
  it('rien sous dix fermetures, dehors avant centre et bord', () => {
    expect(memberZoneProfile(member(1, 9, 0.2, 9, 0, 0))).toBeNull()
    expect(memberZoneProfile(member(1, 30, 1.5, 9, 6, 15))?.key).toBe('late')
    expect(memberZoneProfile(member(1, 30, 0.6, 9, 18, 3))?.key).toBe('center')
    expect(memberZoneProfile(member(1, 30, 0.8, 3, 21, 6))?.key).toBe('edge')
    expect(memberZoneProfile(member(1, 30, 0.9, 6, 15, 9))?.key).toBe('balanced')
  })
})

describe('rankZoneMembers', () => {
  it('du plus central au plus excentré, petits échantillons en dernier', () => {
    const ranked = rankZoneMembers([member(1, 40, 1.1, 4, 20, 16), member(2, 5, 0.1, 5, 0, 0), member(3, 40, 0.7, 10, 25, 5)])
    expect(ranked.map((entry) => entry.memberId)).toEqual([3, 1, 2])
  })
})

describe('zoneTitles', () => {
  it('roi du cercle, increvable et coureur de zone bleue parmi les joueurs d’au moins dix fermetures', () => {
    const titles = zoneTitles([
      member(1, 81, 1.08, 12, 45, 24),
      member(2, 115, 0.74, 31, 68, 16),
      member(3, 36, 1.52, 2, 18, 16),
      member(4, 4, 0.1, 4, 0, 0),
    ])
    expect(titles.map((title) => [title.key, title.memberId, title.value])).toEqual([
      ['king', 2, '74 % du rayon'],
      ['survivor', 2, '115 fermetures'],
      ['latecomer', 3, '44 % dehors'],
    ])
  })

  it('pas de coureur de zone bleue si personne n’a fini dehors ; rien sans joueur éligible', () => {
    expect(zoneTitles([member(1, 20, 0.5, 10, 10, 0)]).map((title) => title.key)).toEqual(['king', 'survivor'])
    expect(zoneTitles([member(1, 3, 0.5, 3, 0, 0)])).toEqual([])
  })
})
