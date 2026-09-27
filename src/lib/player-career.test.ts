import { describe, expect, it } from 'vitest'

import {
  MEDAL_METRICS,
  buildCalendar,
  calendarWindow,
  careerMedals,
  careerRecords,
  careerThemes,
  clanMedalRanks,
  defaultSeasonTab,
  favouriteSlot,
  gamesOf,
  medalCounts,
  nextRankStep,
  normalKd,
  rankedTierLabel,
  seasonLabel,
  type LifetimeStats,
} from './player-career'

const stats = (values: { kills?: number; streak?: number; teamkills?: number; wins?: number; losses?: number; games?: number; walked?: number; heals?: number; boosts?: number } = {}): LifetimeStats => ({
  combat: {
    kills: values.kills ?? 0,
    deaths: values.losses ?? 0,
    kdRatio: (values.kills ?? 0) / Math.max(1, values.losses ?? 0),
    headshots: Math.round((values.kills ?? 0) / 4),
    assists: 0,
    knockouts: 0,
    highestKillstreak: values.streak ?? 0,
    longestKill: 0,
    teamkills: values.teamkills ?? 0,
    suicides: 0,
  },
  victory: { wins: values.wins ?? 0, losses: values.losses ?? 0, winLossRatio: 0, longestTimeAlive: 1864 },
  support: { teammatesRevived: 0, boostsUsed: values.boosts ?? 0, healed: values.heals ?? 0 },
  vehicle: { vehiclesDestroyed: 0, roadkills: 0 },
  movement: { drivenDistance: 0, walkedDistance: values.walked ?? 0, swamDistance: 0 },
  other: { weaponsPicked: 0, damageGiven: 0, roundsPlayed: values.games },
})

describe('médailles du clan', () => {
  it('seulement les stats où « plus = mieux » : ni morts, ni défaites, ni suicides, ni teamkills', () => {
    const keys = MEDAL_METRICS.map((metric) => metric.key)
    expect(keys).not.toContain('combat.deaths')
    expect(keys).not.toContain('victory.losses')
    expect(keys).not.toContain('combat.suicides')
    expect(keys).not.toContain('combat.teamkills')
  })

  it('ex æquo partagés (23, 22, 22, 22 → or, argent ×3) ; une valeur nulle ne médaille pas', () => {
    const clan = [
      { memberId: 1, stats: stats({ streak: 23 }) },
      { memberId: 2, stats: stats({ streak: 22 }) },
      { memberId: 3, stats: stats({ streak: 22 }) },
      { memberId: 4, stats: stats({ streak: 22 }) },
      { memberId: 5, stats: stats({ streak: 20 }) },
      { memberId: 6, stats: stats({ streak: 0 }) },
    ]
    expect(clanMedalRanks(clan, 1)['combat.highestKillstreak']).toBe(1)
    expect(clanMedalRanks(clan, 4)['combat.highestKillstreak']).toBe(2)
    // 20 est cinquième : aucune médaille de bronze quand trois joueurs partagent l'argent.
    expect(clanMedalRanks(clan, 5)['combat.highestKillstreak']).toBeNull()
    expect(clanMedalRanks(clan, 6)['combat.kills']).toBeNull()
    expect(clanMedalRanks(clan, 99)['combat.kills']).toBeNull()
  })

  it('vitrine triée de l’or au bronze, avec la valeur ; compteurs par couleur', () => {
    const ranks = { 'combat.kills': 2, 'victory.wins': 1, 'combat.kdRatio': null, 'support.healed': 3 } as const
    const own = stats({ kills: 3412, wins: 42, heals: 900 })
    expect(careerMedals(ranks, own).map((medal) => [medal.label, medal.rank])).toEqual([
      ['Victoires', 1],
      ['Kills', 2],
      ['Soins utilisés', 3],
    ])
    expect(careerMedals(ranks, own)[1].value).toBe(new Intl.NumberFormat('fr-FR').format(3412))
    expect(medalCounts(ranks)).toEqual({ 1: 1, 2: 1, 3: 1 })
  })
})

describe('fiches et hauts faits', () => {
  const own = stats({ kills: 400, wins: 42, losses: 1180, games: 1222, walked: 1_204_000, heals: 1200, boosts: 2466 })

  it('parties : roundsPlayed, sinon victoires + défaites', () => {
    expect(gamesOf(own)).toBe(1222)
    expect(gamesOf(stats({ wins: 3, losses: 7 }))).toBe(10)
  })

  it('phrases calculées : chicken dinner, objets par partie (pas des PV), traversées d’Erangel', () => {
    const [combat, victory, support, movement] = careerThemes(own)
    expect(victory.note).toBe('Un chicken dinner toutes les 29 parties en moyenne.')
    expect(support.note).toBe('3 soins et boosts par partie en moyenne.')
    expect(movement.note).toBe('À pied, ça fait 150 traversées d’Erangel (8 km).')
    // Aucune médaille sur les défaites ni les teamkills.
    expect(combat.rows.filter((row) => !row.medalKey).map((row) => row.label)).toEqual(['Défaites', 'Teamkills · suicides'])
  })

  it('pas de phrase sans donnée', () => {
    const [, victory, support, movement] = careerThemes(stats())
    expect([victory.note, support.note, movement.note]).toEqual([null, null, null])
  })

  it('hauts faits : survie en minutes', () => {
    expect(careerRecords(own).find((record) => record.id === 'survival')?.value).toBe('31 min')
  })
})

describe('saisons et Ranked', () => {
  it('paliers en français, Cristal compris', () => {
    expect(rankedTierLabel('Crystal', '2')).toBe('Cristal 2')
    expect(rankedTierLabel('Gold', '4')).toBe('Or 4')
    expect(rankedTierLabel(null, null)).toBe('Non classé')
    expect(rankedTierLabel('Inconnu', '1')).toBe('Inconnu 1')
  })

  it('palier suivant : 100 points par division, 400 par palier (bandes relevées en base)', () => {
    expect(nextRankStep(2050, 'Gold', '2')).toEqual({ label: 'Or 1', missing: 50, progress: 50 })
    expect(nextRankStep(2560, 'Platinum', '1')).toEqual({ label: 'Cristal 4', missing: 40, progress: 60 })
    expect(nextRankStep(2952, 'Crystal', '1')).toEqual({ label: 'Diamant 4', missing: 48, progress: 52 })
    // Bronze 4 descend sous 1 000 points (199 relevé) : barre vide, pas de valeur négative.
    expect(nextRankStep(199, 'Bronze', '4')).toEqual({ label: 'Bronze 3', missing: 901, progress: 0 })
    expect(nextRankStep(3350, 'Diamond', '1')).toBeNull()
    expect(nextRankStep(3600, 'Master', null)).toBeNull()
  })

  it('libellé de saison, onglet par défaut, K/D normal', () => {
    expect(seasonLabel('division.bro.official.pc-2018-43')).toBe('Saison 43')
    expect(seasonLabel('lifetime')).toBe('lifetime')
    expect(defaultSeasonTab([{ rankedMatches: 0 }, { rankedMatches: 40 }])).toBe('normal')
    expect(defaultSeasonTab([{ rankedMatches: 3 }])).toBe('ranked')
    expect(defaultSeasonTab([])).toBe('normal')
    expect(normalKd({ normalKills: 159, normalLosses: 19 })).toBeCloseTo(8.37, 2)
  })
})

describe('calendrier', () => {
  it('5 semaines du lundi au dimanche, la dernière est celle d’aujourd’hui', () => {
    const dates = calendarWindow('2026-09-24')
    expect(dates).toHaveLength(35)
    expect(dates[0]).toBe('2026-08-24')
    expect(dates[34]).toBe('2026-09-27')
  })

  it('cases : niveau, top 1, jours futurs, période estompée, jours joués', () => {
    const calendar = buildCalendar({
      today: '2026-09-24',
      days: [
        { date: '2026-08-29', games: 4, wins: 1 },
        { date: '2026-09-12', games: 13, wins: 6 },
        { date: '2026-09-22', games: 2, wins: 0 },
      ],
      hours: [],
      period: 'week',
    })
    const cell = (date: string) => calendar.cells.find((entry) => entry.date === date)!
    expect(cell('2026-08-29')).toMatchObject({ level: 3, wins: 1, inPeriod: false, future: false })
    expect(cell('2026-09-12')).toMatchObject({ level: 4 })
    expect(cell('2026-09-22')).toMatchObject({ level: 2, inPeriod: true })
    expect(cell('2026-09-24')).toMatchObject({ today: true, inPeriod: true })
    expect(cell('2026-09-26')).toMatchObject({ future: true, inPeriod: false })
    expect(calendar.playedDays).toBe(3)
    expect(calendar.elapsedDays).toBe(32)
    expect(calendar.favouriteDay).toBe('sam.')
  })

  it('mois calendaire et « Tous »', () => {
    const month = buildCalendar({ today: '2026-09-24', days: [], hours: [], period: 'month' })
    expect(month.cells.find((cell) => cell.date === '2026-08-31')?.inPeriod).toBe(false)
    expect(month.cells.find((cell) => cell.date === '2026-09-01')?.inPeriod).toBe(true)
    const all = buildCalendar({ today: '2026-09-24', days: [], hours: [], period: 'all' })
    expect(all.cells.filter((cell) => cell.inPeriod)).toHaveLength(32)
    expect(all.favouriteDay).toBeNull()
  })

  it('créneau favori sur deux heures, en passant minuit', () => {
    const hours = Array.from({ length: 24 }, () => 0)
    hours[21] = 5
    hours[22] = 4
    expect(favouriteSlot(hours)).toBe('21 h – 23 h')
    hours[23] = 6
    hours[0] = 6
    expect(favouriteSlot(hours)).toBe('23 h – 1 h')
    expect(favouriteSlot([])).toBeNull()
  })
})
