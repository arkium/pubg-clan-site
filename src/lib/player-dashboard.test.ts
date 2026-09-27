import { describe, expect, it } from 'vitest'

import {
  activityBuckets,
  barHeights,
  clanGap,
  clanGapLabel,
  profileRole,
  profileRows,
  statsPeriodKeys,
  trendLabel,
} from './player-dashboard'

// Samedi 27/09/2026, 22:00 à Paris : semaine ISO 39, soirée du 27.
const NOW = new Date('2026-09-27T20:00:00.000Z')

describe('statsPeriodKeys', () => {
  it('période en cours et précédente au format des agrégats', () => {
    expect(statsPeriodKeys('week', NOW)).toEqual({ current: 'week-2026-39', previous: 'week-2026-38' })
    expect(statsPeriodKeys('month', NOW)).toEqual({ current: 'month-2026-09', previous: 'month-2026-08' })
    expect(statsPeriodKeys('all', NOW)).toEqual({ current: 'all-time', previous: null })
  })

  it('janvier : le mois précédent est décembre de l’année d’avant', () => {
    expect(statsPeriodKeys('month', new Date('2027-01-15T12:00:00.000Z')).previous).toBe('month-2026-12')
  })
})

describe('activityBuckets', () => {
  const matches = [
    { createdAt: '2026-09-22T19:00:00.000Z', kills: 4, damage: 400, placement: 1 }, // mar. 22
    // Mercredi 24 à 01:30 (Paris) : soirée du mardi 23, pas du mercredi.
    { createdAt: '2026-09-23T23:30:00.000Z', kills: 2, damage: 150, placement: 7 },
    { createdAt: '2026-09-27T19:00:00.000Z', kills: 6, damage: 700, placement: 3 }, // dim. 27
    { createdAt: '2026-09-10T19:00:00.000Z', kills: 1, damage: 90, placement: 12 }, // semaine du 07
  ]

  it('semaine : 7 soirées, une partie de nuit comptée la veille', () => {
    const { unit, buckets } = activityBuckets(matches, 'week', NOW)
    expect(unit).toBe('day')
    expect(buckets.map((bucket) => bucket.label)).toEqual(['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'])
    expect(buckets.map((bucket) => bucket.kills)).toEqual([0, 4, 2, 0, 0, 0, 6])
    expect(buckets[1].wins).toBe(1)
  })

  it('mois : les semaines qui touchent le mois, jusqu’à la semaine en cours', () => {
    const { unit, buckets } = activityBuckets(matches, 'month', NOW)
    expect(unit).toBe('week')
    expect(buckets.map((bucket) => bucket.key)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'])
    expect(buckets.map((bucket) => bucket.matches)).toEqual([0, 1, 0, 3])
    expect(buckets[0].label).toBe('sem. du 31/08')
  })

  it('tous : les 8 dernières semaines', () => {
    const { buckets } = activityBuckets(matches, 'all', NOW)
    expect(buckets).toHaveLength(8)
    expect(buckets.at(-1)?.key).toBe('2026-09-21')
    expect(buckets.at(-1)?.damage).toBe(1250)
  })

  it('hauteurs relatives, zéro pour une série vide', () => {
    expect(barHeights([2, 4, 0])).toEqual([50, 100, 0])
    expect(barHeights([0, 0])).toEqual([0, 0])
  })
})

describe('écart au clan', () => {
  it('pourcentage arrondi, rien sans moyenne du clan', () => {
    expect(clanGap(64, 54.2)).toBe(18)
    expect(clanGap(40, 50)).toBe(-20)
    expect(clanGap(10, 0)).toBeNull()
    expect(clanGap(10, null)).toBeNull()
  })

  it('libellés', () => {
    expect(clanGapLabel(18)).toBe('+18 % vs clan')
    expect(clanGapLabel(-20)).toBe('−20 % vs clan')
    expect(clanGapLabel(0)).toBe('dans la moyenne du clan')
    expect(clanGapLabel(null)).toBeNull()
  })
})

describe('profil de jeu', () => {
  const current = { aggression: 82.4, support: 40, zoneDiscipline: 66 }

  it('trois barres, repère du clan et tendance en points', () => {
    const rows = profileRows(current, { aggression: 76, support: 43, zoneDiscipline: 66 }, { aggression: 58, support: 34, zoneDiscipline: 71 })
    expect(rows.map((row) => [row.role, row.value, row.clan, row.trend])).toEqual([
      ['Fragger', 82, 58, 6],
      ['Medic', 40, 34, -3],
      ['Ghost', 66, 71, 0],
    ])
    expect(rows.map((row) => trendLabel(row.trend))).toEqual(['▲ 6', '▼ 3', '='])
  })

  it('sans période précédente ni moyenne du clan : ni tendance ni repère', () => {
    const rows = profileRows(current, null, null)
    expect(rows.every((row) => row.trend === null && row.clan === null)).toBe(true)
    expect(trendLabel(null)).toBeNull()
  })

  it('rôle de la carte joueur', () => {
    expect(profileRole(current)).toEqual({ id: 'fragger', score: 82.4 })
    expect(profileRole(null)).toBeNull()
  })
})
