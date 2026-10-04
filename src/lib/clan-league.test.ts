import { describe, expect, it } from 'vitest'

import {
  LEAGUE_MIN_MATCHES,
  LEAGUE_PRIOR_MATCHES,
  PLACEMENT_WEIGHT,
  clanPowerScore,
  clanRawScore,
  feedBetween,
  leagueFeed,
  leagueMatchTypeValues,
  leagueTableBetween,
  leagueTitles,
  leagueZones,
  parseLeagueMatchType,
  placementPoints,
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
/** `count` parties identiques d'un clan, une par heure à partir de `start`. */
const many = (clanId: number, count: number, placement: number, damage: number, kills = 0, knocks = 0, start = '2026-09-21T18:00:00Z') =>
  Array.from({ length: count }, (_, index) => row(clanId, new Date(new Date(start).getTime() + index * 3_600_000).toISOString(), placement, damage, kills, knocks))

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

describe('Power score', () => {
  it('barème de placement : 10, 6, 5, 4, 3, 2, 1, 1, puis 0', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 30, 0].map(placementPoints)).toEqual([10, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0])
  })

  it('score brut : placement × 250 + dégâts + kills × 10 + knocks × 5', () => {
    expect(clanRawScore({ avgPlacementPoints: 2, avgDamage: 400, avgKills: 3, avgKnocks: 2 })).toBe(2 * PLACEMENT_WEIGHT + 400 + 30 + 10)
  })

  it('pondération : M parties fictives au niveau de la ligue', () => {
    expect(clanPowerScore({ matches: 20, rawScore: 1500, leagueScore: 1000 })).toBe((20 * 1500 + LEAGUE_PRIOR_MATCHES * 1000) / (20 + LEAGUE_PRIOR_MATCHES))
    expect(clanPowerScore({ matches: 0, rawScore: 5000, leagueScore: 1000 })).toBe(1000)
  })

  it('un clan à 1 partie gagnée n’est pas classé : « En qualification », 1 / 5', () => {
    const rows = [...many(1, 1, 1, 900, 9, 8), ...many(2, 6, 10, 300, 2, 2)]
    const { standings, qualifying } = leagueTableBetween(rows, clans, null, null, LEAGUE_MIN_MATCHES.week)
    expect(standings.map((s) => [s.name, s.rank])).toEqual([['Bravo', 1]])
    expect(qualifying).toEqual([{ ...clans[0], matches: 1, required: 5 }])
  })

  it('à performance égale, le clan qui a le plus de parties est le moins tiré vers la moyenne', () => {
    // Alpha et Bravo jouent pareil (2e place, 600 dégâts), au-dessus de Charlie qui tire la moyenne vers le bas.
    const rows = [...many(1, 5, 2, 600, 4, 3), ...many(2, 30, 2, 600, 4, 3), ...many(3, 30, 20, 150, 1, 1)]
    const { standings } = leagueTableBetween(rows, clans, null, null, 5)
    const alpha = standings.find((s) => s.name === 'Alpha')!
    const bravo = standings.find((s) => s.name === 'Bravo')!
    expect(alpha.rawScore).toBe(bravo.rawScore)
    expect(bravo.powerScore).toBeGreaterThan(alpha.powerScore)
    expect(bravo.rawScore - bravo.powerScore).toBeLessThan(alpha.rawScore - alpha.powerScore)
    expect(standings.map((s) => s.name)).toEqual(['Bravo', 'Alpha', 'Charlie'])
  })

  it('une 2e place rapporte des points (6), alors qu’elle ne comptait pas dans l’ancien win rate', () => {
    const rows = [...many(1, 5, 2, 400), ...many(2, 5, 15, 400)]
    const { standings } = leagueTableBetween(rows, clans, null, null, 5)
    const alpha = standings.find((s) => s.name === 'Alpha')!
    expect(alpha).toMatchObject({ winRate: 0, avgPlacementPoints: 6 })
    expect(alpha.rawScore).toBe(6 * PLACEMENT_WEIGHT + 400)
    expect(standings[0].name).toBe('Alpha')
  })

  it('score moyen de la ligue : totaux mis en commun, clans en qualification compris — pas la moyenne des clans', () => {
    // Delta : 1 partie gagnée à 2 000 dégâts (en qualification) ; Bravo : 9 parties, 15e, 200 dégâts.
    const rows = [...many(4, 1, 1, 2000), ...many(2, 9, 15, 200)]
    const { league, qualifying } = leagueTableBetween(rows, clans, null, null, 5)
    expect(qualifying.map((q) => q.name)).toEqual(['Delta'])
    expect(league.matches).toBe(10)
    expect(league.avgPlacementPoints).toBe(1)
    expect(league.avgDamage).toBe(380)
    expect(league.rawScore).toBe(1 * PLACEMENT_WEIGHT + 380)
  })

  it('seuils par période : 5 la semaine, 15 le mois, 30 pour « Tous »', () => {
    expect(LEAGUE_MIN_MATCHES).toEqual({ week: 5, month: 15, all: 30 })
  })
})

describe('types de partie', () => {
  it('Normal, Ranked, Casual (lobbies de bots compris), Tournois / Custom ; Normal par défaut', () => {
    expect(leagueMatchTypeValues('official')).toEqual(['official'])
    expect(leagueMatchTypeValues('competitive')).toEqual(['competitive'])
    expect(leagueMatchTypeValues('casual')).toEqual(['casual', 'airoyale'])
    expect(leagueMatchTypeValues('custom')).toEqual(['custom'])
    expect(parseLeagueMatchType('competitive')).toBe('competitive')
    expect(parseLeagueMatchType('all')).toBe('official')
    expect(parseLeagueMatchType(null)).toBe('official')
  })
})

describe('classement', () => {
  it('seuls les clans qui ont joué assez sont classés, bornes [from, to[', () => {
    const monday = standingsBetween(ROWS, clans, new Date('2026-09-21T00:00:00Z'), new Date('2026-09-22T06:00:00Z'), 1)
    expect(monday.map((s) => [s.name, s.rank, s.matches])).toEqual([
      ['Alpha', 1, 1],
      ['Bravo', 2, 1],
      ['Charlie', 3, 1],
    ])
    const week = standingsBetween(ROWS, clans, null, null, 1)
    expect(week.map((s) => s.name)).toEqual(['Bravo', 'Alpha', 'Charlie'])
    expect(week[0]).toMatchObject({ matches: 3, wins: 2, avgDamage: 2000 / 3, avgPlacementPoints: (1 + 10 + 10) / 3 })
    expect(week.some((s) => s.name === 'Delta')).toBe(false)
    expect(standingsBetween(ROWS, clans, null, null, 3).map((s) => s.name)).toEqual(['Bravo'])
  })

  it('tri par critère (points de placement compris), cible du clan juste devant', () => {
    const week = standingsBetween(ROWS, clans, null, null, 1)
    const byKnocks = rankByCriterion(week, 'knocks')
    // Knocks moyens : Bravo 4, Alpha 2, Charlie 2 (égalité départagée par le Power score).
    expect(byKnocks.map((s) => [s.name, s.position])).toEqual([
      ['Bravo', 1],
      ['Alpha', 2],
      ['Charlie', 3],
    ])
    expect(targetAhead(byKnocks, 1, 'knocks')).toEqual({ name: 'Bravo', gap: '2,0' })
    expect(targetAhead(byKnocks, 2, 'knocks')).toBeNull()
    // Points de placement moyens : Bravo 7, Alpha 5 (10 + 0), Charlie 3 (0 + 6).
    expect(rankByCriterion(week, 'placement').map((s) => s.name)).toEqual(['Bravo', 'Alpha', 'Charlie'])
  })

  it('zones : podium 1–3, dans la zone 4–8, blue zone ensuite', () => {
    const ranked = Array.from({ length: 11 }, (_, index) => ({ position: index + 1 }))
    const { podium, zone, blue } = leagueZones(ranked)
    expect([podium.length, zone.length, blue.length]).toEqual([3, 5, 3])
    expect(blue[0].position).toBe(9)
  })
})

describe('fil de la ligue', () => {
  const standing = (clanId: number, rank: number): LeagueStanding => ({
    ...clans[clanId - 1],
    rank,
    matches: 1,
    wins: 0,
    winRate: 0,
    avgPlacementPoints: 0,
    avgDamage: 0,
    avgKills: 0,
    avgKnocks: 0,
    rawScore: 0,
    powerScore: 0,
  })

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
    const ordered = (order: number[]) => order.map((clanId, index) => ({ ...standing(1, index + 1), clanId, name: `Clan ${clanId}` }))
    const before = ordered([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const after = ordered([1, 2, 3, 4, 5, 6, 7, 10, 8, 9])
    const events = feedBetween(before, after, '2026-09-22').map((event) => `${event.clan} ${event.text}`)
    expect(events).toEqual(['Clan 10 entre dans la zone (8e)', 'Clan 8 tombe en blue zone'])
  })

  it('soirée par soirée, les plus récents d’abord', () => {
    const feed = leagueFeed(ROWS, clans, null, ['2026-09-20', '2026-09-21', '2026-09-22'], 1)
    expect(feed.map((event) => `${event.date} ${event.clan} ${event.text}`)).toEqual(['2026-09-22 Bravo a sorti Alpha de la 1re place'])
  })

  it('franchir le seuil n’est pas un événement : Delta entre directement 1er sans événement', () => {
    // Lundi : Alpha et Bravo classés (2 parties chacun, seuil 2). Mardi : Delta atteint le seuil avec 2 victoires.
    const rows = [
      ...many(1, 2, 3, 500, 3, 2, '2026-09-21T18:00:00Z'),
      ...many(2, 2, 6, 400, 2, 2, '2026-09-21T18:30:00Z'),
      ...many(4, 1, 1, 900, 8, 6, '2026-09-21T20:00:00Z'),
      ...many(4, 1, 1, 900, 8, 6, '2026-09-22T19:00:00Z'),
    ]
    const tuesday = standingsBetween(rows, clans, null, null, 2)
    expect(tuesday[0].name).toBe('Delta')
    const feed = leagueFeed(rows, clans, null, ['2026-09-21', '2026-09-22'], 2)
    expect(feed.some((event) => event.clan === 'Delta')).toBe(false)
  })
})

describe('titres', () => {
  it('clans classés seulement ; meilleure remontée par rapport à la période précédente', () => {
    const week = standingsBetween(ROWS, clans, null, null, 1)
    const titles = leagueTitles(week, new Map([[1, 1], [2, 3], [3, 2]]))
    expect(titles.damage?.name).toBe('Bravo')
    expect(titles.knocks?.name).toBe('Bravo')
    expect(titles.climb).toEqual({ clanId: 2, name: 'Bravo', places: 2 })
    expect(leagueTitles(week, null).climb).toBeNull()
    expect(leagueTitles(standingsBetween(ROWS.slice(0, 3), clans, null, null, 1), null).damage).toBeNull()
  })
})
