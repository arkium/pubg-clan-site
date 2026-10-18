import { describe, expect, it } from 'vitest'

import {
  EMPTY_TOTALS,
  PLAYER_CRITERIA,
  bestByRole,
  bestSlots,
  comparisonReading,
  criterionSummary,
  filterPlayers,
  formatDuration,
  gameModePrefix,
  myStanding,
  parseCompareKeys,
  parsePlayerCriterion,
  parsePlayersMode,
  percentileOf,
  plateValue,
  playerStyle,
  previousRankOf,
  rankPlayers,
  ranksByMember,
  roleScores,
  rolePopulation,
  statLine,
  type ComparedValues,
  type PlayerRankingEntry,
  type PlayerStatLine,
  type PlayerTotals,
} from './players-ranking'

/**
 * Classement et comparateur des joueurs (docs/features/joueurs.md) : module pur — moyennes et seuils d'échantillon,
 * centiles et rôles, rangs et flèches, rang du joueur connecté, recherche, mise en évidence et lecture du comparateur.
 */

const totals = (patch: Partial<PlayerTotals>): PlayerTotals => ({ ...EMPTY_TOTALS, ...patch })

function entry(memberId: number, name: string, line: Partial<PlayerStatLine>, patch: Partial<PlayerRankingEntry> = {}): PlayerRankingEntry {
  const base = statLine(EMPTY_TOTALS)
  return {
    memberId,
    name,
    clanId: 1,
    clanName: 'Clan Démo',
    clanTag: 'DEMO',
    ...base,
    matches: 12,
    ...line,
    style: null,
    roles: { fragger: null, medic: null, ghost: null, sniper: null },
    previousRanks: null,
    ...patch,
  }
}

const values = (patch: Partial<ComparedValues>): ComparedValues => ({
  avgDamage: 300,
  avgKills: 2,
  avgKnocks: 2,
  headshotRate: 0.2,
  avgKillDistance: 60,
  avgRevives: 0.5,
  avgAssists: 0.8,
  avgSurvivalSeconds: 1000,
  avgCircleDelaySeconds: 40,
  avgBlueZoneHits: 10,
  ...patch,
})

describe('mode et critère', () => {
  it('mode : duo et squad reconnus, tout le reste vaut « Tous » ; préfixe du gameMode PUBG', () => {
    expect(parsePlayersMode('duo')).toBe('duo')
    expect(parsePlayersMode('squad')).toBe('squad')
    expect(parsePlayersMode('trio')).toBe('all')
    expect(parsePlayersMode(null)).toBe('all')
    expect(gameModePrefix('duo')).toBe('duo')
    expect(gameModePrefix('all')).toBeNull()
  })

  it('critère inconnu : dégâts ; phrase du critère et du rôle', () => {
    expect(parsePlayerCriterion('sniper')).toBe('sniper')
    expect(parsePlayerCriterion('oups')).toBe('damage')
    expect(criterionSummary('damage', 'ce mois', 'all')).toBe('Dégâts moyens, ce mois, tous modes.')
    expect(criterionSummary('fragger', 'cette semaine', 'duo')).toBe(
      'Fragger : score sur 100 (part des joueurs classés que tu dépasses) — dégâts, kills et knocks, cette semaine, en duo.'
    )
  })

  it('plaque de score : valeur seule et unité du critère', () => {
    expect(plateValue('damage', 665.4)).toBe('665')
    expect(plateValue('kills', 4.66)).toBe('4,7')
    expect(plateValue('fragger', 94)).toBe('94')
    expect(PLAYER_CRITERIA.map((criterion) => criterion.unit)).toEqual(['dégâts', 'kills', 'knocks', 'réas', 'min', '/ 100', '/ 100', '/ 100', '/ 100'])
  })

  it('durée en minutes et secondes', () => {
    expect(formatDuration(1016)).toBe('16:56')
    expect(formatDuration(59)).toBe('0:59')
    expect(formatDuration(3725)).toBe('1:02:05')
  })
})

describe('moyennes et seuils d’échantillon', () => {
  it('moyennes par partie ; headshots, distance et zone absents sous 5 mesures', () => {
    const line = statLine(totals({ matches: 4, damage: 1000, kills: 4, knocks: 6, revives: 2, assists: 3, survivalSeconds: 4000, headshotKills: 2, measuredKills: 4, killDistanceMeters: 400, zoneClosures: 4, zoneInside: 4 }))
    expect(line).toMatchObject({ matches: 4, avgDamage: 250, avgKills: 1, avgKnocks: 1.5, avgRevives: 0.5, avgAssists: 0.75, avgSurvivalSeconds: 1000 })
    expect(line.headshotRate).toBeNull()
    expect(line.avgKillDistance).toBeNull()
    expect(line.zoneInsideRate).toBeNull()
  })

  it('à 5 mesures : part de headshots, distance moyenne, part des fermetures dans le cercle', () => {
    const line = statLine(totals({ matches: 10, kills: 10, headshotKills: 3, measuredKills: 5, killDistanceMeters: 300, zoneClosures: 8, zoneInside: 6 }))
    expect(line.headshotRate).toBe(0.3)
    expect(line.avgKillDistance).toBe(60)
    expect(line.zoneInsideRate).toBe(0.75)
  })

  it('aucune partie : zéros, jamais de division par zéro', () => {
    expect(statLine(EMPTY_TOTALS)).toMatchObject({ matches: 0, avgDamage: 0, avgSurvivalSeconds: 0, headshotRate: null })
  })
})

describe('centiles et rôles', () => {
  it('joueur de la population : le meilleur vaut 100, le dernier 0, les ex æquo à mi-chemin', () => {
    const sorted = [100, 200, 200, 400]
    expect(percentileOf(400, sorted, true)).toBe(100)
    expect(percentileOf(100, sorted, true)).toBe(0)
    expect(percentileOf(200, sorted, true)).toBeCloseTo(50)
    expect(percentileOf(5, [5], true)).toBe(100)
  })

  it('valeur extérieure (moyenne de clan, joueur en qualification) : part de la population dépassée ; sans population, null', () => {
    expect(percentileOf(300, [100, 200, 400, 500], false)).toBe(50)
    expect(percentileOf(1000, [100, 200], false)).toBe(100)
    expect(percentileOf(50, [], false)).toBeNull()
  })

  it('rôle = moyenne des centiles de ses mesures ; une mesure absente sort de la moyenne, aucune mesure : null', () => {
    const lines = [
      statLine(totals({ matches: 10, damage: 4000, kills: 30, knocks: 30, revives: 10, assists: 10, survivalSeconds: 10000 })),
      statLine(totals({ matches: 10, damage: 2000, kills: 10, knocks: 10, revives: 1, assists: 1, survivalSeconds: 5000, measuredKills: 10, killDistanceMeters: 1000, zoneClosures: 10, zoneInside: 9 })),
      statLine(totals({ matches: 10, damage: 1000, kills: 5, knocks: 5, revives: 5, assists: 5, survivalSeconds: 8000, measuredKills: 5, killDistanceMeters: 200, zoneClosures: 10, zoneInside: 5 })),
    ]
    const population = rolePopulation(lines)
    // Tireur : sans distance mesurée, les seuls headshots — 0 pour les trois, ex æquo à mi-chemin.
    expect(roleScores(lines[0], population, true)).toEqual({ fragger: 100, medic: 100, ghost: null, sniper: 50 })
    expect(roleScores(lines[1], population, true)).toMatchObject({ fragger: 50, medic: 0, ghost: 100 })
    expect(roleScores(lines[2], population, true)).toMatchObject({ fragger: 0, ghost: 0 })
  })
})

describe('classement et flèches', () => {
  const players = [
    entry(1, 'Arcos', { avgDamage: 446, matches: 63 }, { roles: { fragger: 90, medic: null, ghost: 10, sniper: 40 } }),
    entry(2, 'Ravek', { avgDamage: 450, matches: 72 }, { roles: { fragger: 95, medic: 20, ghost: 30, sniper: 60 } }),
    entry(3, 'Bruar', { avgDamage: 437, matches: 65 }, { roles: { fragger: 99, medic: 30, ghost: null, sniper: 20 } }),
    entry(4, 'Pixos', { avgDamage: 446, matches: 44 }, { roles: { fragger: 10, medic: 80, ghost: 50, sniper: 10 } }),
  ]

  it('valeur décroissante, puis parties, puis nom ; mesure absente en dernier', () => {
    expect(rankPlayers(players, 'damage').map((p) => `${p.position}.${p.name}`)).toEqual(['1.Ravek', '2.Arcos', '3.Pixos', '4.Bruar'])
    expect(rankPlayers(players, 'medic').map((p) => p.name)).toEqual(['Pixos', 'Bruar', 'Ravek', 'Arcos'])
  })

  it('rangs de chaque critère par joueur ; pas de rang pour un rôle sans mesure', () => {
    const ranks = ranksByMember(players)
    const damage = PLAYER_CRITERIA.findIndex((c) => c.key === 'damage')
    const ghost = PLAYER_CRITERIA.findIndex((c) => c.key === 'ghost')
    expect(ranks.get(2)![damage]).toBe(1)
    expect(ranks.get(3)![ghost]).toBeNull()
    expect(previousRankOf({ previousRanks: ranks.get(4)! }, 'medic')).toBe(1)
    expect(previousRankOf({ previousRanks: null }, 'damage')).toBeNull()
  })

  it('badge : le plus haut des trois rôles du site (Tireur à distance hors calcul), Fragger d’abord à égalité, aucun sans score positif', () => {
    expect(playerStyle({ fragger: 40, medic: 75, ghost: 60, sniper: 99 })).toBe('medic')
    expect(playerStyle({ fragger: 70, medic: 70, ghost: 70, sniper: null })).toBe('fragger')
    expect(playerStyle({ fragger: null, medic: null, ghost: 12, sniper: 80 })).toBe('ghost')
    expect(playerStyle({ fragger: 0, medic: 0, ghost: null, sniper: 90 })).toBeNull()
  })

  it('meilleur de chaque rôle (score non nul)', () => {
    expect(bestByRole(players).map((best) => `${best.role}:${best.entry.name}:${best.score}`)).toEqual(['fragger:Bruar:99', 'medic:Pixos:80', 'ghost:Pixos:50', 'sniper:Ravek:60'])
  })
})

describe('rang du joueur connecté', () => {
  const ranked = rankPlayers(
    [entry(1, 'Arcos', { avgDamage: 446 }), entry(2, 'Ravek', { avgDamage: 450 }), entry(3, 'Slyra38', { avgDamage: 387 }, { clanTag: 'SMK' }), entry(4, 'Kr4ken', { avgDamage: 387, matches: 11 })],
    'damage'
  )

  it('classé : rang, part des classés derrière, joueur juste devant et écart au format du critère', () => {
    expect(myStanding(ranked, [], 4, 'damage')).toEqual({ kind: 'ranked', position: 4, total: 4, value: 387, aheadShare: 0, ahead: { name: 'Slyra38', clanTag: 'SMK', position: 3, gap: '0' } })
    expect(myStanding(ranked, [], 2, 'damage')).toMatchObject({ kind: 'ranked', position: 1, aheadShare: 75, ahead: null })
  })

  it('en qualification : parties jouées et manquantes ; inconnu ou déconnecté : rien', () => {
    expect(myStanding(ranked, [{ memberId: 9, matches: 6 }], 9, 'damage')).toEqual({ kind: 'qualifying', matches: 6, required: 10, missing: 4 })
    expect(myStanding(ranked, [], 99, 'damage')).toBeNull()
    expect(myStanding(ranked, [], null, 'damage')).toBeNull()
  })
})

describe('recherche', () => {
  const list = [entry(1, 'Pépane44', {}, { clanTag: 'DEMO' }), entry(2, 'Tikane', {}, { clanTag: 'SMK', clanId: 2 }), entry(3, 'Nyx_tv', {}, { clanTag: 'AUR', clanId: 3 })]

  it('pseudo sans accents ni casse, tag exact, filtre de clan', () => {
    expect(filterPlayers(list, 'pepa', null).map((p) => p.name)).toEqual(['Pépane44'])
    expect(filterPlayers(list, 'smk', null).map((p) => p.name)).toEqual(['Tikane'])
    expect(filterPlayers(list, 'ane', 2).map((p) => p.name)).toEqual(['Tikane'])
    expect(filterPlayers(list, '  ', null)).toHaveLength(3)
  })
})

describe('comparateur', () => {
  it('meilleure case : plus haut ou plus bas selon la mesure, hors joueurs sous le seuil', () => {
    expect([...bestSlots([387, 385, 362], 'high', [true, true, true])]).toEqual([0])
    expect([...bestSlots([30, 37], 'low', [true, true])]).toEqual([0])
    expect([...bestSlots([300, 200, 900], 'high', [true, true, false])]).toEqual([0])
  })

  it('aucune case quand tout est égal, quand une seule valeur se compare, ou mesure absente', () => {
    expect(bestSlots([20, 20], 'high', [true, true]).size).toBe(0)
    expect(bestSlots([20, 30], 'high', [true, false]).size).toBe(0)
    expect([...bestSlots([null, 30, 10], 'high', [true, true, true])]).toEqual([1])
  })

  it('lecture : traits où chacun se détache d’au moins 5 %, les plus marqués d’abord, au plus trois', () => {
    const reading = comparisonReading([
      { name: 'Kr4ken', values: values({ avgCircleDelaySeconds: 20, avgKills: 3, avgKillDistance: 40 }), qualified: true, matches: 38 },
      { name: 'Vexa', values: values({ avgRevives: 1.2, avgAssists: 1.5 }), qualified: true, matches: 52 },
    ])
    // Réanimations : 0,5 contre 1,2, l'écart le plus marqué ; kills et distance à égalité (33 %), ordre des traits.
    expect(reading[0]).toBe('réanime moins, arrive plus tôt dans le cercle et élimine plus.')
    expect(reading[1]).toBe('réanime plus, fait plus d’assistances et tue de plus loin.')
  })

  it('lecture : rien de marquant, ou chiffres indicatifs sous le seuil', () => {
    const reading = comparisonReading([
      { name: 'A', values: values({}), qualified: true, matches: 20 },
      { name: 'B', values: values({ avgDamage: 301 }), qualified: false, matches: 4 },
    ])
    expect(reading[0]).toBe('reste proche des autres sur toutes les mesures.')
    expect(reading[1]).toBe('reste proche des autres sur toutes les mesures. Sur 4 parties seulement.')
  })

  it('clés comparées : joueurs et moyennes de clan, sans doublon, trois au plus, entrées invalides écartées', () => {
    expect(parseCompareKeys('12, clan-5,12,abc,0,clan-0,34,56')).toEqual([
      { kind: 'player', memberId: 12 },
      { kind: 'clan', clanId: 5 },
      { kind: 'player', memberId: 34 },
    ])
    expect(parseCompareKeys(null)).toEqual([])
  })
})
