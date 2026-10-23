import { describe, expect, it } from 'vitest'

import {
  buildClanMapRows,
  buildClanMapsVerdict,
  CLAN_MAPS_MIN_SAMPLE,
  isClanMapSortKey,
  pickStarPlayers,
  sortClanMapRows,
  type ClanMapAggregate,
  type ClanMapStarPlayer,
  type LeagueMapAverage,
} from '@/lib/clan-maps'

// Page « Cartes » d'un clan (docs/TODO/cartes-clan.md) : calculs purs, aucune base touchée.

const LABELS: Record<string, string> = { Baltic_Main: 'Erangel', Desert_Main: 'Miramar', Tiger_Main: 'Taego', Kiki_Main: 'Deston' }
const labelOf = (mapName: string) => LABELS[mapName] ?? mapName

function aggregate(mapName: string, matches: number, overrides: Partial<ClanMapAggregate> = {}): ClanMapAggregate {
  return { mapName, matches, wins: 0, top10: 0, placementSum: matches * 10, killsSum: 0, damageSum: 0, ...overrides }
}

function league(mapName: string, top10Rate: number, avgPlacement = 10, killsPerMatch = 3): LeagueMapAverage {
  return { mapName, top10Rate, avgPlacement, killsPerMatch }
}

function rows(input: {
  current: ClanMapAggregate[]
  previous?: ClanMapAggregate[] | null
  league?: LeagueMapAverage[]
  stars?: Map<string, ClanMapStarPlayer>
}) {
  return buildClanMapRows({ current: input.current, previous: input.previous ?? null, league: input.league ?? [], stars: input.stars ?? new Map(), labelOf })
}

describe('buildClanMapRows', () => {
  it('calcule taux, moyennes, écarts aux clans et tendance du Top 10', () => {
    const [erangel] = rows({
      current: [aggregate('Baltic_Main', 20, { wins: 2, top10: 12, placementSum: 160, killsSum: 90, damageSum: 9000 })],
      previous: [aggregate('Baltic_Main', 10, { top10: 5 })],
      league: [league('Baltic_Main', 0.5, 10, 4)],
    })

    expect(erangel).toMatchObject({
      mapName: 'Baltic_Main',
      mapLabel: 'Erangel',
      matches: 20,
      wins: 2,
      winRate: 0.1,
      top10Rate: 0.6,
      avgPlacement: 8,
      killsPerMatch: 4.5,
      damagePerMatch: 450,
      lowSample: false,
      starPlayer: null,
    })
    expect(erangel.vsClans.top10Pts).toBeCloseTo(10)
    expect(erangel.vsClans.avgPlacement).toBeCloseTo(-2)
    expect(erangel.vsClans.killsPerMatch).toBeCloseTo(0.5)
    expect(erangel.top10TrendPts).toBeCloseTo(10)
  })

  it('sous le seuil : ni écart, ni tendance, ni joueur phare', () => {
    const star = { memberId: 1, displayName: 'Alpha', matches: 12, killsPerMatch: 3 }
    const [taego] = rows({
      current: [aggregate('Tiger_Main', CLAN_MAPS_MIN_SAMPLE - 1, { top10: 5 })],
      previous: [aggregate('Tiger_Main', 20, { top10: 2 })],
      league: [league('Tiger_Main', 0.3)],
      stars: new Map([['Tiger_Main', star]]),
    })

    expect(taego.lowSample).toBe(true)
    expect(taego.vsClans).toEqual({ top10Pts: null, avgPlacement: null, killsPerMatch: null })
    expect(taego.top10TrendPts).toBeNull()
    expect(taego.starPlayer).toBeNull()
  })

  it('pas de tendance quand la période précédente est trop maigre ou absente', () => {
    const built = rows({
      current: [aggregate('Baltic_Main', 15, { top10: 6 }), aggregate('Desert_Main', 15, { top10: 6 })],
      previous: [aggregate('Baltic_Main', CLAN_MAPS_MIN_SAMPLE - 1, { top10: 9 })],
    })
    expect(built.map((row) => row.top10TrendPts)).toEqual([null, null])
  })

  it('pas d’écart quand aucun clan n’a de moyenne sur la carte ; une carte sans partie est ignorée', () => {
    const built = rows({ current: [aggregate('Kiki_Main', 12, { top10: 6 }), aggregate('Baltic_Main', 0)], league: [] })
    expect(built).toHaveLength(1)
    expect(built[0].vsClans.top10Pts).toBeNull()
  })
})

describe('buildClanMapsVerdict', () => {
  const built = () =>
    rows({
      current: [
        aggregate('Baltic_Main', 40, { top10: 24 }),
        aggregate('Desert_Main', 20, { top10: 6 }),
        aggregate('Tiger_Main', 15, { top10: 9 }),
        aggregate('Kiki_Main', 5, { top10: 5 }),
      ],
      previous: [aggregate('Desert_Main', 20, { top10: 8 })],
      league: [league('Baltic_Main', 0.5), league('Desert_Main', 0.4), league('Tiger_Main', 0.45), league('Kiki_Main', 0.2)],
    })

  it('carte forte, carte à travailler et carte la plus jouée', () => {
    const verdict = buildClanMapsVerdict(built())

    // Taego +15 pts, Erangel +10 pts : Taego l'emporte ; Deston (+80 pts) est sous le seuil et ne compte pas.
    expect(verdict.strongest).toMatchObject({ mapName: 'Tiger_Main', mapLabel: 'Taego', top10Rate: 0.6 })
    expect(verdict.strongest?.vsClansPts).toBeCloseTo(15)
    expect(verdict.weakest).toMatchObject({ mapName: 'Desert_Main', top10Rate: 0.3 })
    expect(verdict.weakest?.vsClansPts).toBeCloseTo(-10)
    expect(verdict.weakest?.trendPts).toBeCloseTo(-10)
    expect(verdict.mostPlayed).toEqual({ mapName: 'Baltic_Main', mapLabel: 'Erangel', matches: 40, share: 0.5 })
  })

  it('aucune carte « à travailler » quand le clan est au-dessus de la moyenne partout', () => {
    const verdict = buildClanMapsVerdict(
      rows({ current: [aggregate('Baltic_Main', 20, { top10: 12 }), aggregate('Desert_Main', 20, { top10: 9 })], league: [league('Baltic_Main', 0.5), league('Desert_Main', 0.44)] })
    )
    expect(verdict.strongest?.mapName).toBe('Baltic_Main')
    expect(verdict.weakest).toBeNull()
  })

  it('aucune carte « forte » quand le clan est en dessous partout, et rien à comparer sans moyenne', () => {
    const below = buildClanMapsVerdict(rows({ current: [aggregate('Baltic_Main', 20, { top10: 4 })], league: [league('Baltic_Main', 0.5)] }))
    expect(below.strongest).toBeNull()
    expect(below.weakest?.mapName).toBe('Baltic_Main')

    const alone = buildClanMapsVerdict(rows({ current: [aggregate('Baltic_Main', 20, { top10: 4 })] }))
    expect(alone).toEqual({ strongest: null, weakest: null, mostPlayed: { mapName: 'Baltic_Main', mapLabel: 'Erangel', matches: 20, share: 1 } })
  })

  it('vide quand le clan n’a joué aucune partie', () => {
    expect(buildClanMapsVerdict([])).toEqual({ strongest: null, weakest: null, mostPlayed: null })
  })
})

describe('pickStarPlayers', () => {
  it('retient le plus de kills par partie, au moins le seuil de parties, la plus grosse série en cas d’égalité', () => {
    const stars = pickStarPlayers([
      { mapName: 'Baltic_Main', memberId: 1, displayName: 'Alpha', matches: 20, killsSum: 60 },
      { mapName: 'Baltic_Main', memberId: 2, displayName: 'Bravo', matches: 5, killsSum: 50 },
      { mapName: 'Baltic_Main', memberId: 3, displayName: 'Charlie', matches: 30, killsSum: 90 },
      { mapName: 'Desert_Main', memberId: 2, displayName: 'Bravo', matches: 10, killsSum: 25 },
    ])

    expect(stars.get('Baltic_Main')).toEqual({ memberId: 3, displayName: 'Charlie', matches: 30, killsPerMatch: 3 })
    expect(stars.get('Desert_Main')).toEqual({ memberId: 2, displayName: 'Bravo', matches: 10, killsPerMatch: 2.5 })
    expect(stars.has('Tiger_Main')).toBe(false)
  })
})

describe('sortClanMapRows', () => {
  const built = rows({
    current: [
      aggregate('Baltic_Main', 30, { top10: 9, placementSum: 360 }),
      aggregate('Desert_Main', 12, { top10: 9, placementSum: 72 }),
      aggregate('Kiki_Main', 4, { top10: 4, placementSum: 8 }),
      aggregate('Tiger_Main', 12, { top10: 6, placementSum: 120 }),
    ],
  })

  it('trie dans le sens demandé, les cartes de faible échantillon toujours à la fin', () => {
    expect(sortClanMapRows(built, 'top10Rate', 'desc').map((row) => row.mapName)).toEqual(['Desert_Main', 'Tiger_Main', 'Baltic_Main', 'Kiki_Main'])
    expect(sortClanMapRows(built, 'avgPlacement', 'asc').map((row) => row.mapName)).toEqual(['Desert_Main', 'Tiger_Main', 'Baltic_Main', 'Kiki_Main'])
  })

  it('à égalité : la carte la plus jouée, puis l’ordre alphabétique du libellé', () => {
    expect(sortClanMapRows(built, 'matches', 'desc').map((row) => row.mapName)).toEqual(['Baltic_Main', 'Desert_Main', 'Tiger_Main', 'Kiki_Main'])
    expect(sortClanMapRows(built, 'wins', 'desc').map((row) => row.mapLabel)).toEqual(['Erangel', 'Miramar', 'Taego', 'Deston'])
  })

  it('ne modifie pas la liste reçue', () => {
    const before = built.map((row) => row.mapName)
    sortClanMapRows(built, 'top10Rate', 'asc')
    expect(built.map((row) => row.mapName)).toEqual(before)
  })

  it('reconnaît les clés de tri', () => {
    expect(isClanMapSortKey('killsPerMatch')).toBe(true)
    expect(isClanMapSortKey('kills')).toBe(false)
    expect(isClanMapSortKey(undefined)).toBe(false)
  })
})
