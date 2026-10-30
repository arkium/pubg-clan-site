import { describe, expect, it } from 'vitest'

import {
  BODY_ZONE_MIN_HITS_CLAN,
  BODY_ZONE_MIN_HITS_MEMBER,
  bodyZoneTrend,
  bodyZoneWeeks,
  rankMembersByHeadRate,
  summarizeBodyZones,
  summarizeBodyZoneSide,
  type BodyZoneStatsRow,
} from '@/lib/body-zone-stats'

// Ordres de grandeur de production (un clan, semaine 43 de 2026) : 11 % à la tête, la moitié au torse.
const row = (memberId: number, side: 'dealt' | 'taken', zone: BodyZoneStatsRow['zone'], hits: number, damage = hits * 30, period = 'week-2026-44', matchesMeasured = 23): BodyZoneStatsRow => ({
  memberId,
  period,
  side,
  zone,
  hits,
  damage,
  matchesMeasured,
})

const KESTREL: BodyZoneStatsRow[] = [
  row(1, 'dealt', 'head', 25),
  row(1, 'dealt', 'torso', 93),
  row(1, 'dealt', 'pelvis', 23),
  row(1, 'dealt', 'arms', 21),
  row(1, 'dealt', 'legs', 28),
  row(1, 'dealt', 'other', 4, 340),
  row(1, 'taken', 'head', 19),
  row(1, 'taken', 'torso', 85),
  row(1, 'taken', 'pelvis', 16),
  row(1, 'taken', 'arms', 18),
  row(1, 'taken', 'legs', 22),
  row(1, 'taken', 'other', 9, 410),
]

describe('résumé d’un côté', () => {
  it('touches et parts par zone, taux de tête, haut / bas du corps, non localisé, par partie', () => {
    const { matchesMeasured, dealt, taken } = summarizeBodyZones(KESTREL, BODY_ZONE_MIN_HITS_MEMBER)
    expect(matchesMeasured).toBe(23)
    expect(dealt).toMatchObject({ hits: 190, headRate: 13.2, unlocalizedDamage: 340, hitsPerMatch: 8.3, belowSample: false })
    expect(dealt.zones.map((zone) => [zone.zone, zone.hits, zone.share])).toEqual([
      ['head', 25, 13.2],
      ['torso', 93, 48.9],
      ['pelvis', 23, 12.1],
      ['arms', 21, 11.1],
      ['legs', 28, 14.7],
    ])
    expect(taken).toMatchObject({ hits: 160, headRate: 11.9, upperShare: 65, lowerShare: 25 })
    // 410 dégâts non localisés sur 410 + 160 × 30.
    expect(taken.unlocalizedShare).toBe(7.9)
  })

  it('sous l’échantillon : aucun taux, aucune part haut / bas, mais les touches restent comptées', () => {
    const summary = summarizeBodyZoneSide([row(1, 'dealt', 'head', 2), row(1, 'dealt', 'torso', 10)], 2, BODY_ZONE_MIN_HITS_MEMBER)
    expect(summary).toMatchObject({ hits: 12, headRate: null, upperShare: null, lowerShare: null, belowSample: true, minHits: 30 })
    expect(summary.zones[0]).toMatchObject({ zone: 'head', hits: 2, share: 16.7 })
  })

  it('rien de mesuré : zéro touche, aucun taux, ni dégâts ni part non localisée', () => {
    const summary = summarizeBodyZoneSide([], 0, BODY_ZONE_MIN_HITS_MEMBER)
    expect(summary).toMatchObject({ hits: 0, headRate: null, unlocalizedShare: null, hitsPerMatch: null, belowSample: true })
  })

  it('un clan est la somme de ses membres, au seuil de 100 touches ; ses parties mesurées s’additionnent', () => {
    const rows = [...KESTREL, row(2, 'dealt', 'head', 1, 30, 'week-2026-44', 5), row(2, 'dealt', 'torso', 9, 270, 'week-2026-44', 5)]
    const clan = summarizeBodyZones(rows, BODY_ZONE_MIN_HITS_CLAN)
    expect(clan.matchesMeasured).toBe(28)
    expect(clan.dealt).toMatchObject({ hits: 200, headRate: 13 })
  })
})

describe('évolution et série hebdomadaire', () => {
  it('écart en points, ou rien sans période précédente ni taux', () => {
    expect(bodyZoneTrend(13.2, 11)).toBe(2.2)
    expect(bodyZoneTrend(11, 12.5)).toBe(-1.5)
    expect(bodyZoneTrend(13.2, null)).toBeNull()
    expect(bodyZoneTrend(null, 11)).toBeNull()
  })

  it('une valeur par semaine demandée, dans l’ordre ; une semaine sans ligne ou sous l’échantillon est vide', () => {
    const rows = [
      row(1, 'dealt', 'head', 4, 120, 'week-2026-42'),
      row(1, 'dealt', 'torso', 36, 1080, 'week-2026-42'),
      row(1, 'dealt', 'head', 1, 30, 'week-2026-44'),
      row(1, 'taken', 'head', 50, 1500, 'week-2026-43'),
    ]
    expect(bodyZoneWeeks(rows, ['week-2026-42', 'week-2026-43', 'week-2026-44'], BODY_ZONE_MIN_HITS_MEMBER)).toEqual([
      { periodKey: 'week-2026-42', headRate: 10, hits: 40, belowSample: false },
      { periodKey: 'week-2026-43', headRate: null, hits: 0, belowSample: true },
      { periodKey: 'week-2026-44', headRate: null, hits: 1, belowSample: true },
    ])
  })
})

describe('classement des membres par taux de tête', () => {
  const member = (displayName: string, headHits: number, hits: number, matchesMeasured: number) => ({
    displayName,
    matchesMeasured,
    dealt: summarizeBodyZoneSide([row(0, 'dealt', 'head', headHits), row(0, 'dealt', 'torso', hits - headHits)], matchesMeasured, BODY_ZONE_MIN_HITS_MEMBER),
  })

  it('échantillon atteint d’abord (taux, puis parties, puis nom), les autres ensuite sans rang', () => {
    const ranked = rankMembersByHeadRate([
      member('Sable', 3, 95, 12),
      member('Torpille', 1, 15, 2),
      member('Lynx', 206, 980, 41),
      member('Bastion', 30, 300, 158),
      member('Orca', 30, 300, 19),
      member('Ibis', 0, 22, 1),
    ])
    expect(ranked.map((entry) => [entry.displayName, entry.rank])).toEqual([
      ['Lynx', 1],
      ['Bastion', 2],
      ['Orca', 3],
      ['Sable', 4],
      ['Torpille', null],
      ['Ibis', null],
    ])
  })
})
