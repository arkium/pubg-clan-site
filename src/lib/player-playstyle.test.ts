import { describe, expect, it } from 'vitest'

import type { ClanPlaystyleRow, CooperationPair } from '@/lib/clan-playstyle'
import {
  asPlaystyleRow,
  cooperationPartners,
  cooperationTotals,
  playerPlaystyleContext,
  playerRoleComparison,
  roleDeltaLabel,
  type PlayerPlaystyleStats,
} from '@/lib/player-playstyle'

const stats = (aggression: number, support: number, zone: number, matchesPlayed = 10): PlayerPlaystyleStats => ({
  aggressionScore: aggression,
  supportScore: support,
  zoneDisciplineScore: zone,
  avgBlueZoneHits: 0,
  avgFirstContactPhase: 2,
  avgCircleDelaySeconds: 0,
  avgCircleDelayPercent: 0,
  avgSafeZonePresencePercent: 90,
  avgOnFootDistanceMeters: 20_000,
  avgVehicleDistanceMeters: 30_000,
  avgDamageTaken: 200,
  avgHealsUsed: 2,
  avgHealAmount: 150,
  avgBoostsUsed: 1,
  maxVehicleSpeedKph: 1_200,
  avgPositionEvents: 300,
  matchesPlayed,
})

const row = (memberId: number, aggression: number, support: number, zone: number): ClanPlaystyleRow => asPlaystyleRow(memberId, `Joueur ${memberId}`, stats(aggression, support, zone))

describe('playerRoleComparison', () => {
  const player = row(1, 80, 10, 60)

  it('compare chaque rôle à la moyenne du clan, joueur compris, avec son rang', () => {
    const clan = [row(1, 80, 10, 60), row(2, 40, 50, 60), row(3, 60, 30, 90)]
    const [fragger, medic, ghost] = playerRoleComparison(player, clan)
    expect(fragger).toMatchObject({ id: 'fragger', score: 80, clanAverage: 60, delta: 20, rank: 1, ranked: 3 })
    expect(medic).toMatchObject({ id: 'medic', score: 10, clanAverage: 30, delta: -20, rank: 3, ranked: 3 })
    // Ex aequo : même rang que l'autre joueur à 60, derrière celui à 90.
    expect(ghost).toMatchObject({ id: 'ghost', score: 60, clanAverage: 70, rank: 2 })
  })

  it('compte le joueur même absent des lignes du clan', () => {
    const [fragger] = playerRoleComparison(player, [row(2, 40, 0, 0)])
    expect(fragger).toMatchObject({ clanAverage: 60, rank: 1, ranked: 2 })
  })

  it('sans clan, ou seul mesuré : aucune comparaison', () => {
    expect(playerRoleComparison(player, null)[0]).toMatchObject({ score: 80, clanAverage: null, delta: null, rank: null })
    expect(playerRoleComparison(player, [row(1, 80, 10, 60)])[0]).toMatchObject({ clanAverage: null, rank: null })
  })
})

describe('roleDeltaLabel', () => {
  it('écart en points, jamais de puce vide', () => {
    expect(roleDeltaLabel(12)).toBe('+12 pts vs clan')
    expect(roleDeltaLabel(-1)).toBe('−1 pt vs clan')
    expect(roleDeltaLabel(0)).toBe('dans la moyenne du clan')
    expect(roleDeltaLabel(null)).toBeNull()
  })
})

describe('cooperationPartners', () => {
  const pair = (a: number, b: number, revives: number, coKills: number, recalls: number, shared: number): CooperationPair => ({
    memberAId: a,
    memberAName: `Joueur ${a}`,
    memberBId: b,
    memberBName: `Joueur ${b}`,
    reviveCount: revives,
    coKillCount: coKills,
    recallCount: recalls,
    sharedDamageEvents: shared,
  })

  it('garde les binômes du joueur, côté coéquipier, du plus coopératif au moins coopératif', () => {
    const partners = cooperationPartners([pair(1, 2, 1, 0, 0, 2), pair(3, 1, 4, 1, 1, 0), pair(2, 3, 9, 9, 9, 9), pair(1, 4, 0, 0, 0, 0)], 1)
    expect(partners.map((partner) => partner.displayName)).toEqual(['Joueur 3', 'Joueur 2'])
    expect(partners[0]).toMatchObject({ memberId: 3, revives: 4, coKills: 1, recalls: 1, score: 14 })
    expect(cooperationTotals(partners)).toEqual({ partners: 2, revives: 5, coKills: 1, recalls: 1 })
  })
})

describe('playerPlaystyleContext', () => {
  it('parties analysées et taille du clan comparé', () => {
    expect(playerPlaystyleContext(stats(1, 1, 1, 12), [row(1, 1, 1, 1), row(2, 1, 1, 1)])).toBe('12 parties analysées · comparé à 2 joueurs du clan')
    expect(playerPlaystyleContext(stats(1, 1, 1, 1), null)).toBe('1 partie analysée')
    expect(playerPlaystyleContext(null, null)).toBe('Aucune partie analysée sur la période')
  })
})
