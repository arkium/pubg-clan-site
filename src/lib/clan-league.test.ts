import { describe, expect, it } from 'vitest'

import {
  clanPowerScore,
  feedBetween,
  leagueFeed,
  leagueTitles,
  leagueZones,
  rankByCriterion,
  standingsBetween,
  targetAhead,
  type LeagueClan,
  type LeagueMatchRow,
  type LeagueStanding,
} from './clan-league'

const clans: LeagueClan[] = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, index) => ({ clanId: index + 1, name, tag: name.slice(0, 3).toUpperCase(), imageUrl: null }))

let seq = 0
const row = (clanId: number, createdAt: string, placement: number, damage: number, kills = 0, knocks = 0): LeagueMatchRow => {
  seq += 1
  return { clanId, matchId: `m${seq}`, createdAt: new Date(createdAt), placement, damage, kills, knocks }
}

// Soirées de Paris (journée à 06:00) : le 21/09 à 21:00 Paris = 19:00 UTC.
const ROWS = [
  row(1, '2026-09-21T19:00:00Z', 1, 600, 5, 4), // Alpha gagne le lundi
  row(2, '2026-09-21T19:30:00Z', 8, 300, 2, 1),
  row(3, '2026-09-21T20:00:00Z', 12, 200, 1, 1),
  row(2, '2026-09-22T19:00:00Z', 1, 900, 8, 6), // Bravo gagne le mardi
  row(2, '2026-09-22T20:00:00Z', 1, 800, 7, 5),
  row(3, '2026-09-22T21:00:00Z', 2, 500, 4, 3),
  row(1, '2026-09-22T21:30:00Z', 15, 100, 0, 0), // Alpha perd le mardi : Bravo passe devant
]

describe('classement', () => {
  it('Power score : win rate × 10 000 + dégâts moyens + kills × 10 + knocks × 5', () => {
    expect(clanPowerScore({ winRate: 0.25, avgDamage: 400, avgKills: 3, avgKnocks: 2 })).toBe(2500 + 400 + 30 + 10)
  })

  it('seuls les clans qui ont joué sont classés, bornes [from, to[', () => {
    const monday = standingsBetween(ROWS, clans, new Date('2026-09-21T00:00:00Z'), new Date('2026-09-22T06:00:00Z'))
    expect(monday.map((s) => [s.name, s.rank, s.matches])).toEqual([
      ['Alpha', 1, 1],
      ['Bravo', 2, 1],
      ['Charlie', 3, 1],
    ])
    const week = standingsBetween(ROWS, clans, null, null)
    expect(week.map((s) => s.name)).toEqual(['Bravo', 'Alpha', 'Charlie'])
    expect(week[0]).toMatchObject({ matches: 3, wins: 2, avgDamage: 2000 / 3 })
    expect(week.some((s) => s.name === 'Delta')).toBe(false)
  })

  it('tri par critère, cible du clan juste devant', () => {
    const week = standingsBetween(ROWS, clans, null, null)
    const byKnocks = rankByCriterion(week, 'knocks')
    // Knocks moyens : Bravo 4, Alpha 2, Charlie 2 (égalité départagée par le Power score).
    expect(byKnocks.map((s) => [s.name, s.position])).toEqual([
      ['Bravo', 1],
      ['Alpha', 2],
      ['Charlie', 3],
    ])
    expect(targetAhead(byKnocks, 1, 'knocks')).toEqual({ name: 'Bravo', gap: '2,0' })
    expect(targetAhead(byKnocks, 2, 'knocks')).toBeNull()
  })

  it('zones : podium 1–3, dans la zone 4–8, blue zone ensuite', () => {
    const ranked = Array.from({ length: 11 }, (_, index) => ({ position: index + 1 }))
    const { podium, zone, blue } = leagueZones(ranked)
    expect([podium.length, zone.length, blue.length]).toEqual([3, 5, 3])
    expect(blue[0].position).toBe(9)
  })
})

describe('fil de la ligue', () => {
  const standing = (clanId: number, rank: number): LeagueStanding => ({ ...clans[clanId - 1], rank, matches: 1, wins: 0, winRate: 0, avgDamage: 0, avgKills: 0, avgKnocks: 0, powerScore: 0 })

  it('prise de la 1re place, remontée, dépassement ; rien au premier jour de la période', () => {
    const before = [standing(1, 1), standing(2, 2), standing(3, 3), standing(4, 4)]
    const after = [standing(2, 1), standing(1, 2), standing(4, 3), standing(3, 4)]
    expect(feedBetween(before, after, '2026-09-22').map((event) => `${event.clan} ${event.text}`)).toEqual([
      'Bravo a sorti Alpha de la 1re place',
      'Delta passe devant Charlie',
    ])
    expect(feedBetween([], after, '2026-09-22')).toEqual([])
  })

  it('entrée dans la zone et chute en blue zone', () => {
    const many = (order: number[]) => order.map((clanId, index) => ({ ...standing(1, index + 1), clanId, name: `Clan ${clanId}` }))
    const before = many([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const after = many([1, 2, 3, 4, 5, 6, 7, 10, 8, 9])
    const events = feedBetween(before, after, '2026-09-22').map((event) => `${event.clan} ${event.text}`)
    expect(events).toEqual(['Clan 10 entre dans la zone (8e)', 'Clan 8 tombe en blue zone'])
  })

  it('soirée par soirée, les plus récents d’abord', () => {
    const feed = leagueFeed(ROWS, clans, null, ['2026-09-20', '2026-09-21', '2026-09-22'])
    expect(feed.map((event) => `${event.date} ${event.clan} ${event.text}`)).toEqual(['2026-09-22 Bravo a sorti Alpha de la 1re place'])
  })
})

describe('titres', () => {
  it('moyennes à partir de 3 parties ; meilleure remontée par rapport à la période précédente', () => {
    const week = standingsBetween(ROWS, clans, null, null)
    const titles = leagueTitles(week, new Map([[1, 1], [2, 3], [3, 2]]))
    expect(titles.damage?.name).toBe('Bravo')
    expect(titles.knocks?.name).toBe('Bravo')
    expect(titles.climb).toEqual({ clanId: 2, name: 'Bravo', places: 2 })
    expect(leagueTitles(week, null).climb).toBeNull()
    expect(leagueTitles(standingsBetween(ROWS.slice(0, 3), clans, null, null), null).damage).toBeNull()
  })
})
