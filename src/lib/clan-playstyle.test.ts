import { describe, expect, it } from 'vitest'

import {
  cooperationSummary,
  cooperationTop,
  itemFamilyLabel,
  itemLabel,
  playstyleContext,
  playstyleRoles,
  playstyleThemes,
  synergyGroups,
  telemetryKilometers,
  type ClanPlaystyleRow,
  type CooperationPair,
} from './clan-playstyle'

function row(memberId: number, displayName: string, overrides: Partial<ClanPlaystyleRow> = {}): ClanPlaystyleRow {
  return {
    memberId,
    displayName,
    aggressionScore: 50,
    supportScore: 20,
    zoneDisciplineScore: 70,
    avgBlueZoneHits: 2,
    avgFirstContactPhase: 2.5,
    avgCircleDelaySeconds: 0,
    avgCircleDelayPercent: 0,
    avgSafeZonePresencePercent: 80,
    avgOnFootDistanceMeters: 21_000,
    avgVehicleDistanceMeters: 9_000,
    avgDamageTaken: 300,
    avgHealAmount: 150,
    avgHealsUsed: 3,
    avgBoostsUsed: 2,
    maxVehicleSpeedKph: 1_100,
    avgPositionEvents: 200,
    matchesPlayed: 10,
    ...overrides,
  }
}

describe('style de jeu — profil', () => {
  it('moyenne du clan et top 3 par rôle, sans joueur à zéro', () => {
    const rows = [
      row(1, 'Alpha', { aggressionScore: 82, supportScore: 0 }),
      row(2, 'Bravo', { aggressionScore: 74, supportScore: 0 }),
      row(3, 'Charlie', { aggressionScore: 40, supportScore: 61 }),
      row(4, 'Delta', { aggressionScore: 20, supportScore: 0 }),
    ]
    const [fragger, medic] = playstyleRoles(rows)
    expect(fragger.average).toBe(54)
    expect(fragger.top.map((entry) => entry.displayName)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    // Un Medic à 0 % n'a rien à faire dans le podium.
    expect(medic.top.map((entry) => entry.displayName)).toEqual(['Charlie'])
  })

  it('thèmes : distances et vitesse ramenées de l’échelle ×10 de la télémétrie', () => {
    expect(telemetryKilometers(21_000)).toBeCloseTo(2.1)
    const { mobility, survival } = playstyleThemes([row(1, 'Alpha')])
    expect(mobility.distance).toBeCloseTo(3)
    expect(mobility.footShare).toBeCloseTo(70)
    expect(mobility.maxSpeed).toBeCloseTo(110)
    expect(survival.coverage).toBe(50)
  })

  it('retard sur le cercle : « non mesuré » plutôt que 0 s', () => {
    expect(playstyleThemes([row(1, 'Alpha')]).circle).toMatchObject({ delaySeconds: null, outside: null, safe: 80 })
    const measured = playstyleThemes([row(1, 'Alpha', { avgCircleDelaySeconds: 14, avgCircleDelayPercent: 9 })]).circle
    expect(measured).toMatchObject({ delaySeconds: 14, outside: 9 })
  })

  it('contexte du bandeau : joueurs, bots et positions en une ligne', () => {
    expect(playstyleContext([row(1, 'Alpha'), row(2, 'Bravo')], 3.4)).toBe('2 joueurs · 3,4 bots / match · 200 positions / match')
    expect(playstyleContext([], null)).toBe('0 joueur')
  })
})

describe('style de jeu — objets', () => {
  it('familles et objets en français, repli sur le dictionnaire PUBG', () => {
    expect(itemFamilyLabel('Heal')).toBe('Soins')
    expect(itemFamilyLabel('Mystery')).toBe('Mystery')
    expect(itemLabel('Item_Boost_EnergyDrink_C', () => 'Energy Drink')).toBe('Boisson énergisante')
    expect(itemLabel('Item_New_C', () => 'New Item')).toBe('New Item')
    // Objets relevés en production (clan 324, 2026-09-27) sans nom français jusque-là.
    expect(itemLabel('Item_BulletproofShield_C', () => 'Folded Shield')).toBe('Bouclier pliable')
    expect(itemLabel('Item_Bluechip_C', (id) => id)).toBe('Puce bleue')
    expect(itemLabel('Item_Mountainbike_C', (id) => id)).toBe('VTT')
  })
})

describe('style de jeu — synergies et coopération', () => {
  const entry = (ids: number[], matches: number, winRate: number) => ({
    memberIds: ids,
    memberNames: ids.map((id) => `Joueur ${id}`),
    matchesPlayed: matches,
    totalKills: 0,
    winRate,
  })

  it('trois groupes : duos, trios et squads (quatre joueurs et plus)', () => {
    const groups = synergyGroups({
      topPairs: [entry([1, 2], 14, 0.286)],
      topSquads: [entry([1, 2, 3], 6, 0.167), entry([1, 2, 3, 4], 14, 0.214)],
    })
    expect(groups.map((group) => [group.id, group.entries.length])).toEqual([
      ['duo', 1],
      ['trio', 1],
      ['squad', 1],
    ])
    expect(synergyGroups(null).every((group) => group.entries.length === 0)).toBe(true)
  })

  const pairs: CooperationPair[] = [
    { memberAId: 1, memberAName: 'Alpha', memberBId: 2, memberBName: 'Bravo', reviveCount: 10, coKillCount: 5, recallCount: 0, sharedDamageEvents: 10 },
    { memberAId: 3, memberAName: 'Charlie', memberBId: 4, memberBName: 'Delta', reviveCount: 0, coKillCount: 10, recallCount: 2, sharedDamageEvents: 0 },
  ]

  it('indice de synergie : score moyen rapporté au meilleur binôme', () => {
    const summary = cooperationSummary(pairs)
    // Scores : 10×3 + 5×2 + 10 = 50 et 10×2 = 20 → moyenne 35, meilleur 50.
    expect(summary).toMatchObject({ pairs: 2, revives: 10, coKills: 15, recalls: 2, sharedDamage: 10, averageScore: 35, index: 70 })
    expect(cooperationSummary([]).index).toBe(0)
  })

  it('classements : un binôme à zéro n’y figure pas', () => {
    expect(cooperationTop(pairs, 'revives').map((entry) => entry.names)).toEqual([['Alpha', 'Bravo']])
    expect(cooperationTop(pairs, 'coKills').map((entry) => entry.value)).toEqual([10, 5])
    expect(cooperationTop(pairs, 'recalls')).toHaveLength(1)
  })
})
