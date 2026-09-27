import { describe, expect, it } from 'vitest'

import {
  CAREER_GROUPS,
  careerHeadline,
  careerMetricTag,
  careerRefresh,
  computeCareerGroups,
  computeCareerMetric,
  formatHours,
  formatKilometers,
  formatMeters,
  formatMinutes,
  type CareerLifetimeStats,
  type CareerMember,
} from './clan-career'

function stats(overrides: { kills?: number; deaths?: number; kd?: number; teamkills?: number; time?: number; days?: number; longest?: number } = {}): CareerLifetimeStats {
  return {
    combat: {
      kills: overrides.kills ?? 100,
      deaths: overrides.deaths ?? 80,
      kdRatio: overrides.kd ?? 1.25,
      headshots: 20,
      assists: 30,
      knockouts: 110,
      highestKillstreak: 7,
      longestKill: overrides.longest ?? 400.4,
      teamkills: overrides.teamkills ?? 2,
      suicides: 1,
    },
    victory: { wins: 10, losses: 90, winLossRatio: 0.11, longestTimeAlive: 1900 },
    support: { teammatesRevived: 40, boostsUsed: 300, healed: 250 },
    vehicle: { vehiclesDestroyed: 3, roadkills: 4 },
    movement: { drivenDistance: 1_500_000, walkedDistance: 700_000, swamDistance: 5_000 },
    other: {
      weaponsPicked: 900,
      damageGiven: 12_000.7,
      ...(overrides.time !== undefined ? { timeSurvived: overrides.time, roundsPlayed: 100, daysPlayed: overrides.days ?? 50 } : {}),
    },
  }
}

const member = (memberId: number, displayName: string, overrides: Parameters<typeof stats>[0] = {}, refreshed = '2026-09-27T05:00:00Z'): CareerMember => ({
  memberId,
  displayName,
  lastRefreshedAt: refreshed,
  stats: stats(overrides),
})

describe('carrière — formats lisibles', () => {
  it('heures, minutes, mètres et kilomètres arrondis, à la française', () => {
    expect(formatHours(6_631_200)).toBe('1 842 h')
    expect(formatMinutes(1900)).toBe('31 min 40')
    expect(formatMeters(712.43)).toBe('712 m')
    expect(formatKilometers(10_202_522)).toBe('10 203 km')
  })
})

describe('carrière — ce que dit chaque carte', () => {
  const metric = (key: string) => CAREER_GROUPS.flatMap((group) => group.metrics).find((entry) => entry.key === key)!

  it('Total, Moyenne, Record ; Moins = mieux ; Mur de la honte', () => {
    expect(careerMetricTag(metric('kills'))).toBe('Total')
    expect(careerMetricTag(metric('kdRatio'))).toBe('Moyenne')
    expect(careerMetricTag(metric('longestKill'))).toBe('Record')
    expect(careerMetricTag(metric('deaths'))).toBe('Moins = mieux')
    expect(careerMetricTag(metric('teamkills'))).toBe('Mur de la honte')
  })

  it('sept familles, dans l’ordre de la maquette, sans libellé sans accent', () => {
    expect(CAREER_GROUPS.map((group) => group.title)).toEqual(['Engagement', 'Combat', 'Victoires', 'Support', 'Véhicules', 'Déplacements', 'Autres'])
    const labels = CAREER_GROUPS.flatMap((group) => group.metrics.map((entry) => entry.label))
    for (const wrong of ['Serie max', 'Defaites', 'Coequipiers releves', 'Vehicules detruits', 'Armes ramassees']) {
      expect(labels).not.toContain(wrong)
    }
  })

  it('les soins sont des objets utilisés, pas des points de vie', () => {
    expect(metric('healed').label).toBe('Soins utilisés')
  })
})

describe('carrière — calcul d’une statistique', () => {
  const members = [
    member(1, 'Alpha', { kills: 300, deaths: 100, kd: 3, teamkills: 9 }),
    member(2, 'Bravo', { kills: 200, deaths: 50, kd: 4, teamkills: 1 }),
    member(3, 'Charlie', { kills: 100, deaths: 150, kd: 0.67, teamkills: 4 }),
  ]
  const metric = (key: string) => CAREER_GROUPS.flatMap((group) => group.metrics).find((entry) => entry.key === key)!

  it('total, moyenne et record', () => {
    expect(computeCareerMetric(metric('kills'), members).value).toBe(600)
    expect(computeCareerMetric(metric('kdRatio'), members).value).toBeCloseTo(2.557, 2)
    expect(computeCareerMetric(metric('longestKill'), members).value).toBeCloseTo(400.4)
  })

  it('« Moins = mieux » classe du plus petit au plus grand', () => {
    expect(computeCareerMetric(metric('deaths'), members).top.map((entry) => entry.displayName)).toEqual(['Bravo', 'Alpha', 'Charlie'])
  })

  it('le mur de la honte met en tête celui qui a le plus de teamkills', () => {
    expect(computeCareerMetric(metric('teamkills'), members).top[0]).toMatchObject({ displayName: 'Alpha', value: 9 })
  })
})

describe('carrière — engagement synchronisé depuis PUBG', () => {
  const metric = (key: string) => CAREER_GROUPS.flatMap((group) => group.metrics).find((entry) => entry.key === key)!

  it('ignore les joueurs pas encore resynchronisés et les compte', () => {
    const members = [member(1, 'Alpha', { time: 360_000 }), member(2, 'Bravo')]
    const result = computeCareerMetric(metric('timeSurvived'), members)
    expect(result.value).toBe(360_000)
    expect(result.missing).toBe(1)
    expect(result.top.map((entry) => entry.displayName)).toEqual(['Alpha'])
  })

  it('aucune donnée : pas de zéro trompeur', () => {
    const result = computeCareerMetric(metric('timeSurvived'), [member(1, 'Alpha')])
    expect(result.value).toBeNull()
    expect(result.top).toEqual([])
  })

  it('les jours de jeu restent un plancher (« au moins »)', () => {
    expect(metric('daysPlayed').note).toBe('au moins')
  })
})

describe('carrière — totaux et fraîcheur', () => {
  it('quatre totaux, temps de jeu en attente tant que personne n’est resynchronisé', () => {
    const headline = careerHeadline([member(1, 'Alpha'), member(2, 'Bravo')])
    expect(headline.map((item) => item.label)).toEqual(['Temps de jeu', 'Kills', 'Victoires', 'Distance parcourue'])
    expect(headline[0]).toMatchObject({ value: '–', detail: 'Disponible après la prochaine synchro PUBG' })
    expect(headline[1].value).toBe('200')
    expect(headline[3].value).toBe('4 410 km')
  })

  it('signale une synchro partielle, puis donne l’équivalent en jours', () => {
    expect(careerHeadline([member(1, 'Alpha', { time: 86_400 * 10 }), member(2, 'Bravo')])[0].detail).toBe('1 joueur sur 2 synchronisé')
    expect(careerHeadline([member(1, 'Alpha', { time: 86_400 * 10 })])[0]).toMatchObject({ value: '240 h', detail: 'soit 10 jours en partie' })
  })

  it('date de mise à jour : la plus récente et la plus ancienne', () => {
    expect(careerRefresh([member(1, 'A', {}, '2026-09-27T05:00:00Z'), member(2, 'B', {}, '2026-09-26T05:00:00Z')])).toEqual({
      latest: '2026-09-27T05:00:00.000Z',
      oldest: '2026-09-26T05:00:00.000Z',
    })
    expect(careerRefresh([])).toBeNull()
  })

  it('calcule toutes les familles', () => {
    const groups = computeCareerGroups([member(1, 'Alpha')])
    expect(groups.reduce((count, group) => count + group.results.length, 0)).toBe(27)
  })
})
