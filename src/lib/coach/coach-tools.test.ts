import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Outils du Coach IA (docs/TODO/chatbot-ia.md §5) : étanchéité (le clan et le compte viennent de la fermeture, jamais
 * du modèle), bornes, formes des résultats. Prisma et les services qui lisent la base sont simulés.
 */

const mocks = vi.hoisted(() => ({
  squadMatchFindMany: vi.fn(),
  memberFindFirst: vi.fn(),
  weaponsFindMany: vi.fn(),
  opponentFindFirst: vi.fn(),
  killCount: vi.fn(),
  killGroupBy: vi.fn(),
  killFindMany: vi.fn(),
  encounterAggregate: vi.fn(),
  dropFindMany: vi.fn(),
  statsFindMany: vi.fn(),
  loadDebrief: vi.fn(),
  getClanLeague: vi.fn(),
  tournamentFindUnique: vi.fn(),
  getTournamentMatches: vi.fn(),
  loadDirectories: vi.fn(),
  listOverviews: vi.fn(),
  loadItemUse: vi.fn(),
  throwGroupBy: vi.fn(),
  loadMapStats: vi.fn(),
  matchFindMany: vi.fn(),
  getPlayersRanking: vi.fn(),
  lifetimeFindUnique: vi.fn(),
  lifetimeFindMany: vi.fn(),
  seasonFindMany: vi.fn(),
  telemetryStatsFindMany: vi.fn(),
  synergyFindMany: vi.fn(),
  memberCount: vi.fn(),
  loadCityCells: vi.fn(),
  loadCityCoverage: vi.fn(),
  loadZoneClosures: vi.fn(),
}))

vi.mock('@/lib/clan-map-stats-service', () => ({ loadClanMapStats: mocks.loadMapStats }))
vi.mock('@/lib/players-ranking-service', () => ({ getPlayersRanking: mocks.getPlayersRanking }))
// Villes et fin de zone : seules les lectures SQL sont simulées, les agrégations (grille, classements, verdicts) sont réelles.
vi.mock('@/lib/city-insights', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/city-insights')>()),
  loadCityMetricCells: mocks.loadCityCells,
  loadCityMatchCoverage: mocks.loadCityCoverage,
}))
vi.mock('@/lib/zone-closure-stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/zone-closure-stats')>()),
  loadZoneClosureSummary: mocks.loadZoneClosures,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    squadMatch: { findMany: mocks.squadMatchFindMany },
    clanMember: { findFirst: mocks.memberFindFirst, count: mocks.memberCount },
    memberWeaponStats: { findMany: mocks.weaponsFindMany },
    opponentClan: { findFirst: mocks.opponentFindFirst },
    killEvent: { count: mocks.killCount, groupBy: mocks.killGroupBy, findMany: mocks.killFindMany },
    clanEncounter: { aggregate: mocks.encounterAggregate },
    dropPressureStat: { findMany: mocks.dropFindMany },
    playerStats: { findMany: mocks.statsFindMany },
    tournament: { findUnique: mocks.tournamentFindUnique },
    memberThrowableStat: { groupBy: mocks.throwGroupBy },
    match: { findMany: mocks.matchFindMany },
    memberLifetimeStats: { findUnique: mocks.lifetimeFindUnique, findMany: mocks.lifetimeFindMany },
    memberSeasonStats: { findMany: mocks.seasonFindMany },
    memberTelemetryStats: { findMany: mocks.telemetryStatsFindMany },
    clanSynergyTelemetryStats: { findMany: mocks.synergyFindMany },
  },
}))
// Dictionnaire PUBG (`@/lib/pubg-assets`) réel : pur, et les noms français viennent d'abord de `clan-playstyle.ts`.
vi.mock('@/lib/item-use-stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/item-use-stats')>()),
  loadItemUseStats: mocks.loadItemUse,
}))
vi.mock('@/lib/clan-league-service', () => ({ getClanLeague: mocks.getClanLeague }))
// Moteur de classement des tournois réel (pur) ; seules les lectures de la base sont simulées.
vi.mock('@/lib/tournament-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tournament-service')>()),
  getTournamentMatches: mocks.getTournamentMatches,
}))
vi.mock('@/lib/tournament-directories', () => ({
  collectTournamentMemberIds: (matches: Array<{ members: Array<{ memberId: number }> }>) => [...new Set(matches.flatMap((match) => match.members.map((row) => row.memberId)))],
  loadTournamentDirectories: mocks.loadDirectories,
}))
vi.mock('@/lib/tournament-overview', () => ({ listTournamentOverviews: mocks.listOverviews }))
vi.mock('@/lib/map-label-service', () => {
  const DEFAULT_MAP_LABELS: Record<string, string> = { Baltic_Main: 'Erangel (Remastered)', Desert_Main: 'Miramar' }
  return {
    DEFAULT_MAP_LABELS,
    getMapLabels: async () => ({ Baltic_Main: 'Erangel' }),
    mapDisplayName: (name: string, labels: Record<string, string>) => labels[name] ?? DEFAULT_MAP_LABELS[name] ?? name,
  }
})
vi.mock('@/lib/map-location-service', () => ({
  getMapLocations: async () => ({
    Baltic_Main: [{ id: 'pochinki', name: 'Pochinki', mapName: 'Baltic_Main', xPct: 50, yPct: 50, radiusPct: 5, enabled: true }],
  }),
}))
vi.mock('@/lib/weapon-label-service', () => {
  const LABELS: Record<string, string> = { WeapBerylM762_C: 'Beryl M762', WeapHK416_C: 'M416', WeapMk14_C: 'Mk14' }
  return {
    getWeaponLabels: async () => LABELS,
    weaponDisplayName: (name: string, labels: Record<string, string>) => labels[name] ?? LABELS[name] ?? name,
  }
})
vi.mock('@/lib/pubg-telemetry/match-debrief-payload', () => ({ loadMatchDebriefPayload: mocks.loadDebrief }))

import { buildPlaySchedule, COACH_TOOL_DECLARATIONS, createCoachTools, parisSlot, resetCoachLeagueCache } from '@/lib/coach/coach-tools'

const scope = { clanId: 292, memberId: 100, memberName: 'NovakTV' }
const tools = createCoachTools(scope)
const run = (name: string, args: Record<string, unknown> = {}) => tools.run({ name, args })

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  resetCoachLeagueCache()
})

describe('déclarations', () => {
  it('expose les dix-neuf outils sans jamais laisser le modèle choisir le clan ou le compte', () => {
    expect(COACH_TOOL_DECLARATIONS.map((tool) => tool.name)).toEqual([
      'getRecentMatches',
      'getSessions',
      'getMatchDebrief',
      'getWeaponStats',
      'getOpponentRecord',
      'getDropZones',
      'getClanLeaderboard',
      'getLeagueStanding',
      'getTournaments',
      'getTournamentResults',
      'getItemUsage',
      'getMapPerformance',
      'getPlaySchedule',
      'getPlayerBenchmark',
      'getCareerStats',
      'getClanPlaystyle',
      'getClanCareer',
      'getCityInsights',
      'getZoneClosures',
    ])
    const forbidden = /clanid|memberid|userid|accountid/i
    for (const tool of COACH_TOOL_DECLARATIONS) {
      const properties = (tool.parameters as { properties: Record<string, unknown> }).properties
      expect(Object.keys(properties).some((key) => forbidden.test(key))).toBe(false)
    }
  })

  it('refuse un outil inconnu', async () => {
    expect(await run('dropDatabase')).toEqual({ error: 'unknown_tool', message: 'Outil inconnu : dropDatabase.' })
  })
})

describe('getRecentMatches', () => {
  const match = {
    id: 'cmatch1',
    mapName: 'Baltic_Main',
    gameMode: 'squad',
    matchType: 'official',
    placement: 3,
    createdAt: new Date('2026-10-22T23:30:00Z'),
    totalKills: 18,
    totalDamage: 2846.4,
    members: [{ member: { displayName: 'NovakTV' } }, { member: { displayName: 'Menez69' } }],
    telemetry: { status: 'success' },
  }

  it('lit les parties du clan de la fermeture, bornées, par soirée de jeu, avec un résumé calculé', async () => {
    mocks.squadMatchFindMany.mockResolvedValue([match, { ...match, id: 'cmatch0', placement: 14, createdAt: new Date('2026-10-22T22:50:00Z') }])
    const result = (await run('getRecentMatches', { limit: 50 })) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const query = mocks.squadMatchFindMany.mock.calls[0][0]
    expect(query.where).toEqual({ members: { some: { member: { clanId: 292 } } } })
    // Une ligne de plus que la borne : elle dit s'il existe des parties avant la liste.
    expect(query.take).toBe(11)
    // 01:30 à Paris le 23 : c'est encore la soirée du 22.
    expect(result.matches[0]).toMatchObject({ matchId: 'cmatch1', map: 'Erangel', session: '2026-10-22', placement: 3, squadKills: 18, squadDamage: 2846, squad: ['NovakTV', 'Menez69'], telemetryAnalyzed: true })
    expect(result).toMatchObject({ listed: 2, limit: 10, truncated: false })
    expect(result.summary).toEqual({ matches: 2, wins: 0, top10: 1, winRatePercent: 0, top10Percent: 50, avgPlacement: 8.5, bestPlacement: 3, worstPlacement: 14, sessions: ['2026-10-22'] })
    expect(result.note).toContain('getSessions')
  })

  it('signale une liste coupée sans compter tout l’historique', async () => {
    mocks.squadMatchFindMany.mockResolvedValue(Array.from({ length: 3 }, (_, index) => ({ ...match, id: `m${index}` })))
    const result = (await run('getRecentMatches', { limit: 2 })) as { listed: number; truncated: boolean; matches: unknown[]; note: string }
    expect(mocks.squadMatchFindMany.mock.calls[0][0].take).toBe(3)
    expect(result).toMatchObject({ listed: 2, truncated: true })
    expect(result.matches).toHaveLength(2)
    expect(result.note).toContain('d’autres avant')
  })

  it('filtre par carte d’après son nom affiché, et refuse une carte inconnue', async () => {
    mocks.squadMatchFindMany.mockResolvedValue([])
    const empty = (await run('getRecentMatches', { mapName: 'erangel' })) as { summary: unknown; listed: number }
    expect(mocks.squadMatchFindMany.mock.calls[0][0].where.mapName).toEqual({ in: ['Baltic_Main'] })
    expect(mocks.squadMatchFindMany.mock.calls[0][0].take).toBe(6)
    expect(empty).toMatchObject({ listed: 0, summary: null })
    expect(await run('getRecentMatches', { mapName: 'Mars' })).toMatchObject({ error: 'map_not_found' })
    expect(mocks.squadMatchFindMany).toHaveBeenCalledTimes(1)
  })
})

describe('getSessions', () => {
  // Heure d'été jusqu'au dimanche 25 octobre 2026 à 03:00 (01:00 UTC). Une soirée = six heures réelles après minuit à
  // Paris, comme `sessionDateOf` : celle du samedi 24 finit donc à 05:00 heure d'hiver (04:00 UTC).
  const row =(id: string, iso: string, placement: number, overrides: Record<string, unknown> = {}) => ({
    id,
    mapName: 'Baltic_Main',
    gameMode: 'squad',
    matchType: 'official',
    placement,
    createdAt: new Date(iso),
    totalKills: 6,
    totalDamage: 812.4,
    members: [
      { kills: 4, damage: 500.2, knockouts: 3, member: { displayName: 'NovakTV' } },
      { kills: 2, damage: 312.2, knockouts: 1, member: { displayName: 'Menez69' } },
    ],
    telemetry: { status: 'success' },
    ...overrides,
  })
  // Renvoyées par la base de la plus récente à la plus ancienne.
  const saturday = [
    row('s4', '2026-10-25T00:35:00Z', 1, { mapName: 'Desert_Main', matchType: 'airoyale' }), // 02:35 dimanche : soirée du samedi
    row('s3', '2026-10-24T22:16:00Z', 1),
    row('s2', '2026-10-24T21:31:00Z', 25, { members: [{ kills: 0, damage: 22, knockouts: 0, member: { displayName: 'NovakTV' } }] }),
    row('s1', '2026-10-24T19:05:00Z', 7),
  ]
  const friday = [row('f1', '2026-10-23T20:00:00Z', 12)]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('sans date : les sept dernières soirées du clan, toutes parties, bornées à 06:00 heure de Paris', async () => {
    mocks.squadMatchFindMany.mockResolvedValue([...saturday, ...friday])
    const result = (await run('getSessions')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const query = mocks.squadMatchFindMany.mock.calls[0][0]
    expect(query.where).toEqual({
      // Du lundi 19 à 06:00 (04:00 UTC, heure d'été) au lundi 26 à 06:00 (05:00 UTC, heure d'hiver).
      createdAt: { gte: new Date('2026-10-19T04:00:00Z'), lt: new Date('2026-10-26T05:00:00Z') },
      members: { some: { member: { clanId: 292, isActive: true } } },
    })
    expect(query.orderBy).toEqual({ createdAt: 'desc' })
    expect(query.take).toBe(3001)
    expect(result).toMatchObject({ from: '2026-10-19', to: '2026-10-25', days: 7, today: '2026-10-25', matchType: 'toutes les parties', truncated: false })
    expect(result.totals).toEqual({ sessionsPlayed: 2, matches: 5, wins: 2, top10: 3, winRatePercent: 40, top10Percent: 60, avgPlacement: 9.2, bestPlacement: 1, worstPlacement: 25, squadKills: 30 })
    expect(result.sessions.map((session: { date: string }) => session.date)).toEqual(['2026-10-23', '2026-10-24'])
    expect(result.sessionsWithoutPlay).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-25'])
    // Plusieurs soirées : une ligne compacte par soirée, sans liste de parties ; jamais d'identifiant interne.
    expect(result.sessions[1]).toEqual({
      date: '2026-10-24',
      label: 'Samedi 24 octobre',
      matches: 4,
      wins: 2,
      top10: 3,
      winRatePercent: 50,
      top10Percent: 75,
      avgPlacement: 8.5,
      bestPlacement: 1,
      worstPlacement: 25,
      squadKills: 24,
      killsPerMatch: 6,
      damagePerMatch: 812,
      firstMatchAt: '21:05',
      lastMatchAt: '02:35',
      mostPlayedMap: 'Erangel',
      topPlayer: { player: 'NovakTV', kills: 12 },
      matchTypes: '3 normale (1 Top 1) · 1 Air Royale (bots) (1 Top 1)',
    })
    expect(result.sessions[0]).not.toHaveProperty('matchTypes')
    expect(JSON.stringify(result)).not.toMatch(/memberId|matchList/)
  })

  it('une seule date : le détail — cartes, modes, types, membres — et ses parties dans l’ordre du jeu, avec un type de partie au choix', async () => {
    mocks.squadMatchFindMany.mockResolvedValue(saturday)
    const result = (await run('getSessions', { date: '2026-10-24', matchType: 'casual' })) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const query = mocks.squadMatchFindMany.mock.calls[0][0]
    expect(query.where.createdAt).toEqual({ gte: new Date('2026-10-24T04:00:00Z'), lt: new Date('2026-10-25T04:00:00Z') })
    expect(query.where.matchType).toEqual({ in: ['casual', 'airoyale'] })
    expect(result).toMatchObject({ from: '2026-10-24', to: '2026-10-24', days: 1, matchType: 'Casual' })
    const sat = result.sessions[0]
    expect(sat).toMatchObject({
      label: 'Samedi 24 octobre',
      matches: 4,
      wins: 2,
      avgPlacement: 8.5,
      maps: [{ map: 'Erangel', matches: 3, wins: 1 }, { map: 'Miramar', matches: 1, wins: 1 }],
      teamModes: '4 duo',
      matchTypes: [{ type: 'normale', matches: 3, wins: 1 }, { type: 'Air Royale (bots)', matches: 1, wins: 1 }],
      players: [{ player: 'NovakTV', matches: 4, kills: 12, damage: 1523, knockouts: 9 }, { player: 'Menez69', matches: 3, kills: 6, damage: 937, knockouts: 3 }],
      matchListTruncated: false,
    })
    expect(sat.matchList.map((match: { matchId: string }) => match.matchId)).toEqual(['s1', 's2', 's3', 's4'])
    expect(sat.matchList[3]).toEqual({ matchId: 's4', time: '02:35', map: 'Miramar', matchType: 'Air Royale (bots)', placement: 1, squadKills: 6, squad: 'NovakTV, Menez69', telemetryAnalyzed: true })

    await run('getSessions', { date: '2026-10-24', matchType: 'official' })
    expect(mocks.squadMatchFindMany.mock.calls[1][0].where.matchType).toEqual({ in: ['official'] })
  })

  it('accepte une plage, la remet dans l’ordre, la borne à 31 soirées, refuse une date invalide', async () => {
    mocks.squadMatchFindMany.mockResolvedValue([])
    const swapped = (await run('getSessions', { from: '2026-10-24', to: '2026-10-20' })) as { from: string; to: string; days: number; totals: unknown; sessions: unknown[] }
    expect(swapped).toMatchObject({ from: '2026-10-20', to: '2026-10-24', days: 5, totals: { sessionsPlayed: 0, matches: 0, wins: 0 }, sessions: [] })
    const clamped = (await run('getSessions', { from: '2026-01-01', to: '2026-10-25' })) as { from: string; days: number; note: string }
    expect(clamped).toMatchObject({ from: '2026-09-25', days: 31 })
    expect(clamped.note).toContain('31 dernières soirées')
    expect(mocks.squadMatchFindMany.mock.calls[1][0].where.createdAt.gte).toEqual(new Date('2026-09-25T04:00:00Z'))
    expect(await run('getSessions', { date: '24/10/2026' })).toEqual({ error: 'invalid_date', message: 'Date attendue au format AAAA-MM-JJ : « 24/10/2026 ».' })
    expect(await run('getSessions', { date: '2026-02-30' })).toMatchObject({ error: 'invalid_date' })
    expect(mocks.squadMatchFindMany).toHaveBeenCalledTimes(2)
  })

  it('garde les parties les plus récentes quand la plage dépasse la borne, et coupe la liste d’une soirée à 40', async () => {
    mocks.squadMatchFindMany.mockResolvedValue(Array.from({ length: 3001 }, (_, index) => row(`m${index}`, new Date(Date.UTC(2026, 9, 24, 20) - index * 60_000).toISOString(), 5)))
    const result = (await run('getSessions', { date: '2026-10-24' })) as { truncated: boolean; totals: { matches: number }; note: string; sessions: Array<{ matchList: unknown[]; matchListTruncated: boolean }> }
    expect(result).toMatchObject({ truncated: true, totals: { matches: 3000 } })
    expect(result.note).toContain('les plus anciennes manquent')
    expect(result.sessions[0].matchList).toHaveLength(40)
    expect(result.sessions[0].matchListTruncated).toBe(true)
  })
})

describe('getMatchDebrief', () => {
  const payload = (telemetryStatus: string) => ({
    match: { id: 'cmatch1', mapName: 'Baltic_Main', gameMode: 'squad', matchType: 'official', placement: 3, createdAt: '2026-10-22T19:47:00.000Z', durationSeconds: 1634, totalKills: 18, totalDamage: 2846.4 },
    telemetry: { status: telemetryStatus, phaseSnapshots: [{ isGame: 1, timestampSeconds: 60 }, { isGame: 5, timestampSeconds: 1080 }, { isGame: 5.5, timestampSeconds: 1200 }] },
    weaponLabels: {},
    squadMates: [{ name: 'Menez69', clanTag: '47R', kills: 4, damage: 702.2, knockouts: 3, revives: 1, deaths: 1, damageTaken: 420.5 }],
    combatEvents: [
      { type: 'knock', timestamp: 1119, phaseNumber: 5, actorName: 'Viper', actorClanTag: 'VPR', targetName: 'Menez69', targetClanTag: '47R', weaponName: 'WeapMk14_C', distanceMeters: 145.4, isSquadActor: false, isSquadTarget: true },
      { type: 'kill', timestamp: 1122, phaseNumber: 5, actorName: 'Viper', actorClanTag: 'VPR', targetName: 'Menez69', targetClanTag: '47R', isSquadActor: false, isSquadTarget: true },
      { type: 'kill', timestamp: 900, phaseNumber: 4, actorName: 'Bob', actorClanTag: null, targetName: 'Alice', targetClanTag: 'XYZ', isSquadActor: false, isSquadTarget: false },
    ],
  })

  it('vérifie l’identifiant avant toute lecture et lie l’accès au clan', async () => {
    expect(await run('getMatchDebrief', { matchId: '../x' })).toMatchObject({ error: 'match_not_found' })
    expect(mocks.loadDebrief).not.toHaveBeenCalled()
    mocks.loadDebrief.mockResolvedValue(null)
    expect(await run('getMatchDebrief', { matchId: 'cmatch1' })).toMatchObject({ error: 'match_not_found' })
    expect(mocks.loadDebrief).toHaveBeenCalledWith({ matchId: 'cmatch1', accessClanId: 292, clanId: 292 })
  })

  it('dit quand la télémétrie n’est pas analysée', async () => {
    mocks.loadDebrief.mockResolvedValue(payload('pending'))
    expect(await run('getMatchDebrief', { matchId: 'cmatch1' })).toMatchObject({ matchId: 'cmatch1', map: 'Erangel', placement: 3, telemetryAnalyzed: false })
  })

  it('résume phases, escouade et événements de l’escouade à l’horloge du replay', async () => {
    mocks.loadDebrief.mockResolvedValue(payload('success'))
    const result = (await run('getMatchDebrief', { matchId: 'cmatch1' })) as Record<string, unknown>
    expect(result).toMatchObject({ telemetryAnalyzed: true, session: '2026-10-22', squadDamage: 2846, opponentClans: ['VPR'] })
    expect(result.phases).toEqual([{ phase: 1, start: '1:00' }, { phase: 5, start: '18:00' }])
    expect(result.squad).toEqual([{ name: 'Menez69', clanTag: '47R', kills: 4, damage: 702, knockouts: 3, revives: 1, deaths: 1, damageTaken: 421 }])
    const events = result.events as Array<Record<string, unknown>>
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ time: '18:39', phase: 5, type: 'knock', actor: 'Viper', actorClan: 'VPR', target: 'Menez69', targetClan: '47R', weapon: 'Mk14', distanceM: 145, bySquad: false, onSquad: true })
  })
})

describe('getWeaponStats', () => {
  const rows = [
    { weaponName: 'WeapBerylM762_C', kills: 58, headshots: 12, shotsFired: 300, hitsLanded: 57, avgDistance: 4500, maxDistance: 12000, matchCount: 41 },
    { weaponName: 'WeapHK416_C', kills: 44, headshots: 7, shotsFired: 250, hitsLanded: 60, avgDistance: 3800, maxDistance: 0, matchCount: 37 },
    { weaponName: 'WeapMk14_C', kills: 9, headshots: 3, shotsFired: 40, hitsLanded: 12, avgDistance: 15000, maxDistance: 23000, matchCount: 12 },
  ]

  it('lit les armes du membre de la session sur tout l’historique, distances en mètres', async () => {
    mocks.weaponsFindMany.mockResolvedValue(rows)
    const result = (await run('getWeaponStats')) as { player: string; weapons: Array<Record<string, unknown>> }
    expect(mocks.weaponsFindMany.mock.calls[0][0].where).toEqual({ memberId: 100, period: 'all-time' })
    expect(mocks.memberFindFirst).not.toHaveBeenCalled()
    expect(result.player).toBe('NovakTV')
    expect(result.weapons[0]).toMatchObject({ weapon: 'Beryl M762', category: 'AR', kills: 58, matches: 41, killsPerMatch: 1.41, headshotRatePercent: 21, accuracyPercent: 19, avgDistanceM: 45, maxDistanceM: 120 })
    expect(result.weapons.map((weapon) => weapon.weapon)).toEqual(['Beryl M762', 'M416', 'Mk14'])
  })

  it('filtre par catégorie et par mois', async () => {
    mocks.weaponsFindMany.mockResolvedValue(rows)
    const dmr = (await run('getWeaponStats', { weaponCategory: 'dmr', period: 'month' })) as { weapons: Array<{ weapon: string }>; period: string }
    expect(dmr.weapons.map((weapon) => weapon.weapon)).toEqual(['Mk14'])
    expect(dmr.period).toBe('mois en cours')
    expect(mocks.weaponsFindMany.mock.calls[0][0].where.period).toMatch(/^month-\d{4}-\d{2}$/)
  })

  it('ne cherche un autre joueur que dans le clan de la fermeture', async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: 101, displayName: 'Menez69' })
    mocks.weaponsFindMany.mockResolvedValue([])
    const result = (await run('getWeaponStats', { playerName: 'Menez69' })) as { player: string }
    expect(mocks.memberFindFirst.mock.calls[0][0].where).toEqual({ clanId: 292, isActive: true, OR: [{ displayName: 'Menez69' }, { pubgPlayerName: 'Menez69' }] })
    expect(mocks.weaponsFindMany.mock.calls[0][0].where.memberId).toBe(101)
    expect(result.player).toBe('Menez69')

    mocks.memberFindFirst.mockResolvedValue(null)
    expect(await run('getWeaponStats', { playerName: 'Inconnu' })).toMatchObject({ error: 'player_not_found' })
  })
})

describe('getOpponentRecord', () => {
  it('normalise le tag, compte les kills échangés et nomme les tueurs', async () => {
    mocks.opponentFindFirst.mockResolvedValue({
      tag: 'VPR',
      name: 'Vipers',
      players: [
        { id: 'p1', pubgAccountId: 'account.viper', pubgPlayerName: 'Viper' },
        { id: 'p2', pubgAccountId: 'account.shadow', pubgPlayerName: 'Sh4dow' },
      ],
    })
    mocks.killCount.mockResolvedValueOnce(2).mockResolvedValueOnce(11)
    mocks.killGroupBy
      .mockResolvedValueOnce([{ killerAccountId: 'account.viper', _count: { _all: 8 } }, { killerAccountId: 'account.nobody', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ weaponName: 'WeapMk14_C', _count: { _all: 7 } }])
    mocks.killFindMany.mockResolvedValue([{ squadMatchId: 'm1' }, { squadMatchId: 'm2' }])
    mocks.encounterAggregate.mockResolvedValue({ _max: { lastSeenAt: new Date('2026-10-22T19:47:00Z') } })

    const result = await run('getOpponentRecord', { clanTag: '[vpr]' })

    expect(mocks.opponentFindFirst.mock.calls[0][0].where).toEqual({ tag: 'vpr' })
    expect(mocks.killCount.mock.calls[0][0].where).toMatchObject({ clanId: 292, killerMemberId: { not: null }, victimAccountId: { in: ['account.viper', 'account.shadow'] } })
    expect(result).toEqual({
      clan: { tag: 'VPR', name: 'Vipers' },
      playersKnown: 2,
      matchesWithFights: 2,
      killsOnThem: 2,
      deathsToThem: 11,
      topKillers: [{ player: 'Viper', kills: 8 }, { player: 'Joueur inconnu', kills: 3 }],
      theirWeapons: [{ weapon: 'Mk14', kills: 7 }],
      lastEncounter: '2026-10-22T19:47:00.000Z',
    })
  })

  it('refuse un tag inconnu ou vide sans toucher aux kills', async () => {
    mocks.opponentFindFirst.mockResolvedValue(null)
    expect(await run('getOpponentRecord', { clanTag: 'ZZZ' })).toMatchObject({ error: 'clan_not_found' })
    expect(await run('getOpponentRecord', { clanTag: '' })).toMatchObject({ error: 'clan_not_found' })
    expect(mocks.killCount).not.toHaveBeenCalled()
  })
})

describe('getDropZones', () => {
  // Erangel fait 819 200 cm de côté : 409 600 = 50 %, au centre de Pochinki (rayon 5 %).
  const jump = (squadMatchId: string, memberId: number, displayName: string, mapName: string, x: number, y: number, opponents: number | null, players: number, pressureLevel: string, placement: number, matchDate = '2026-10-24T20:00:00Z') => ({
    squadMatchId,
    memberId,
    mapName,
    x,
    y,
    matchDate: new Date(matchDate),
    nearbyPlayerCount250m: players,
    nearbyOpponentCount250m: opponents,
    pressureLevel,
    squadMatch: { placement },
    member: { displayName },
  })
  // Renvoyés par la base du plus récent au plus ancien.
  const jumps = [
    jump('m1', 100, 'NovakTV', 'Baltic_Main', 409600, 409600, 9, 12, 'hot', 1),
    jump('m1', 101, 'Menez69', 'Baltic_Main', 410000, 409000, 9, 12, 'hot', 1),
    jump('m2', 100, 'NovakTV', 'Baltic_Main', 409600, 409600, 2, 5, 'calm', 14),
    jump('m3', 101, 'Menez69', 'Baltic_Main', 100, 100, 0, 1, 'calm', 7),
    jump('m4', 100, 'NovakTV', 'Desert_Main', 100, 100, null, 4, 'contested', 20, '2026-10-20T20:00:00Z'),
  ]

  it('sans carte : toutes les cartes du clan, de la plus sautée à la moins sautée, sur 90 jours', async () => {
    mocks.dropFindMany.mockResolvedValue(jumps)
    const result = (await run('getDropZones')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const query = mocks.dropFindMany.mock.calls[0][0]
    expect(query.where).toEqual({ member: { clanId: 292 }, matchDate: { gte: expect.any(Date), lt: expect.any(Date) } })
    // Fenêtre glissante de 90 jours, jusqu'à demain minuit.
    expect(Math.round((query.where.matchDate.lt.getTime() - query.where.matchDate.gte.getTime()) / 86_400_000)).toBe(91)
    expect(query.orderBy).toEqual([{ matchDate: 'desc' }, { squadMatchId: 'asc' }])
    expect(query.take).toBe(20001)
    expect(result).toMatchObject({ scope: 'le clan', period: 'les 90 derniers jours', map: 'toutes les cartes', jumps: 5, matches: 4, since: '2026-10-20T20:00:00.000Z', truncated: false, mapsTruncated: false })
    expect(result.maps).toEqual([
      { map: 'Erangel', jumps: 4, sharePercent: 80, matches: 3, favoriteSpot: { spot: 'Pochinki', jumps: 3, sharePercent: 75, level: 'Contesté' }, topSpots: 'Pochinki 3 (75 %)', outsideCitiesPercent: 25, hotDropPercent: 50 },
      { map: 'Miramar', jumps: 1, sharePercent: 20, matches: 1, favoriteSpot: null, topSpots: '', outsideCitiesPercent: 100, hotDropPercent: 0 },
    ])
  })

  it('une carte : profil, spots avec pression en adversaires et placements par partie, hors-ville à part, qui saute où', async () => {
    mocks.dropFindMany.mockResolvedValue(jumps.filter((row) => row.mapName === 'Baltic_Main'))
    const result = (await run('getDropZones', { mapName: 'Erangel', period: 'week' })) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(mocks.dropFindMany.mock.calls[0][0].where).toMatchObject({ member: { clanId: 292 }, mapName: { in: ['Baltic_Main'] } })
    expect(result).toMatchObject({ scope: 'le clan', period: 'cette semaine', map: 'Erangel' })
    // Pression = adversaires (9, 9, 2, 0) et non tous les joueurs (12, 12, 5, 1).
    expect(result.profile).toEqual({ jumps: 4, matches: 3, avgOpponents250m: 5, maxOpponents250m: 9, hotDropPercent: 50, distribution: 'Calme 50 % · Contesté 0 % · Hot drop 50 % · Très chaud 0 %' })
    // Pression moyenne de 6,7 adversaires : « Contesté » (la page arrondit la moyenne avant de lui donner un niveau).
    expect(result.favoriteSpot).toEqual({ spot: 'Pochinki', jumps: 3, sharePercent: 75, level: 'Contesté', king: 'NovakTV (2)' })
    // Deux parties à Pochinki (m1 à deux sauts, m2) : place moyenne 7,5 ; « Hors ville » n'est pas un spot.
    expect(result.spots).toEqual([
      { spot: 'Pochinki', jumps: 3, sharePercent: 75, matches: 2, avgOpponents250m: 6.7, hotDropPercent: 67, level: 'Contesté', king: 'NovakTV (2)', avgPlacement: 7.5, top10Percent: 50, winPercent: 50, lowSample: true },
    ])
    expect(result.outsideCities).toEqual({ jumps: 1, sharePercent: 25, avgPlacement: 7, top10Percent: 100, winPercent: 0, lowSample: true })
    // À égalité de sauts, l'ordre alphabétique de la page « Qui saute où ».
    expect(result.members.map((line: { player: string; jumps: number; favoriteSpot: string }) => [line.player, line.jumps, line.favoriteSpot])).toEqual([
      ['Menez69', 2, 'Pochinki (1)'],
      ['NovakTV', 2, 'Pochinki (2)'],
    ])
    expect(result.you).toMatchObject({ player: 'NovakTV', jumps: 2 })
    expect(JSON.stringify(result)).not.toMatch(/memberId|matchId|locationId/)
  })

  it('« mes drops » : le joueur seul, ou un autre membre du clan, sans le tableau des membres', async () => {
    mocks.dropFindMany.mockResolvedValue([jumps[0], jumps[2]])
    const own = (await run('getDropZones', { mapName: 'Erangel', scope: 'player' })) as Record<string, unknown>
    expect(mocks.dropFindMany.mock.calls[0][0].where).toMatchObject({ member: { clanId: 292 }, memberId: 100 })
    expect(mocks.memberFindFirst).not.toHaveBeenCalled()
    expect(own).toMatchObject({ scope: 'NovakTV' })
    expect(own).not.toHaveProperty('members')

    mocks.memberFindFirst.mockResolvedValue({ id: 101, displayName: 'Menez69' })
    await run('getDropZones', { playerName: 'Menez69', period: 'all' })
    expect(mocks.dropFindMany.mock.calls[1][0].where).toEqual({ member: { clanId: 292 }, memberId: 101 })
    mocks.memberFindFirst.mockResolvedValue(null)
    expect(await run('getDropZones', { playerName: 'Inconnu' })).toMatchObject({ error: 'player_not_found' })
  })

  it('refuse une carte inconnue, dit quand il n’y a aucun saut, et retire entière la partie coupée par la borne', async () => {
    expect(await run('getDropZones', { mapName: 'Atlantide' })).toEqual({ error: 'map_not_found', message: 'Carte inconnue : Atlantide.' })
    expect(mocks.dropFindMany).not.toHaveBeenCalled()

    mocks.dropFindMany.mockResolvedValue([])
    expect(await run('getDropZones', { mapName: 'Erangel' })).toMatchObject({ map: 'Erangel', jumps: 0, message: 'Aucun saut enregistré sur la période.' })

    // 20 001 lignes : la dernière partie lue (« cut ») est à cheval sur la borne, elle disparaît en entier.
    const many = Array.from({ length: 19_998 }, (_, index) => jump(`k${index}`, 100, 'NovakTV', 'Baltic_Main', 409600, 409600, 1, 2, 'calm', 5))
    mocks.dropFindMany.mockResolvedValue([...many, jump('cut', 100, 'NovakTV', 'Baltic_Main', 409600, 409600, 1, 2, 'calm', 5), jump('cut', 101, 'Menez69', 'Baltic_Main', 409600, 409600, 1, 2, 'calm', 5), jump('cut', 102, 'Kr4ken', 'Baltic_Main', 409600, 409600, 1, 2, 'calm', 5)])
    const result = (await run('getDropZones', { mapName: 'Erangel' })) as { truncated: boolean; profile: { jumps: number; matches: number }; note: string }
    expect(result.truncated).toBe(true)
    expect(result.profile).toMatchObject({ jumps: 19_998, matches: 19_998 })
    expect(result.note).toContain('les plus anciens manquent')
  })
})

describe('getClanLeaderboard', () => {
  const row = (memberId: number, displayName: string, kills: number, matches: number, wins: number, damage: number) => ({
    memberId,
    totalKills: kills,
    totalKnockouts: kills + 2,
    totalDamage: damage,
    totalAssists: 1,
    totalRevives: 2,
    matchesPlayed: matches,
    matchesWon: wins,
    avgKillsPerGame: matches > 0 ? kills / matches : 0,
    avgDamagePerGame: matches > 0 ? damage / matches : 0,
    timePlayedSeconds: 7200,
    activeDays: 3,
    badgeType: null,
    updatedAt: new Date('2026-10-24T03:00:00Z'),
    member: { displayName },
  })

  it('classe les membres actifs du clan sur la semaine en cours, situe le joueur, cache les identifiants', async () => {
    mocks.statsFindMany.mockResolvedValue([row(100, 'NovakTV', 10, 8, 1, 2400.4), row(101, 'Menez69', 25, 10, 2, 5100), row(102, 'Kr4ken', 0, 0, 0, 0)])
    const result = (await run('getClanLeaderboard')) as { members: Array<Record<string, unknown>>; you: Record<string, unknown> | null; period: string; membersRanked: number }
    const where = mocks.statsFindMany.mock.calls[0][0].where
    expect(where.member).toEqual({ clanId: 292, isActive: true })
    expect(where.period).toMatch(/^week-\d{4}-\d{2}$/)
    expect(result.period).toBe('cette semaine')
    expect(result.membersRanked).toBe(2)
    expect(result.members[0]).toMatchObject({ rank: 1, player: 'Menez69', kills: 25, matches: 10, winRatePercent: 20, killsPerMatch: 2.5, damage: 5100 })
    expect(result.members[0]).not.toHaveProperty('memberId')
    expect(result.you).toMatchObject({ rank: 2, player: 'NovakTV', winRatePercent: 13, damage: 2400 })
  })

  it('trie selon le critère demandé et lit « depuis toujours »', async () => {
    mocks.statsFindMany.mockResolvedValue([row(100, 'NovakTV', 10, 8, 4, 2400), row(101, 'Menez69', 25, 10, 2, 5100)])
    const result = (await run('getClanLeaderboard', { period: 'all', sortBy: 'winRate' })) as { members: Array<{ player: string }>; sortBy: string }
    expect(mocks.statsFindMany.mock.calls[0][0].where.period).toBe('all-time')
    expect(result.sortBy).toBe('winRate')
    expect(result.members.map((member) => member.player)).toEqual(['NovakTV', 'Menez69'])
    expect(((await run('getClanLeaderboard', { sortBy: 'inconnu' })) as { sortBy: string }).sortBy).toBe('kills')
  })
})

describe('getLeagueStanding', () => {
  const standing = (clanId: number, rank: number, tag: string) => ({
    clanId, name: `Clan ${tag}`, tag, imageUrl: null, matches: 40, wins: 6, winRate: 15, avgPlacementPoints: 4.2, avgDamage: 1234.6, avgKills: 2.345, avgKnocks: 3.1, rawScore: 10, powerScore: 61.26, rank, previousRank: rank + 1, activeMembers: 9,
  })
  const league = (standings: ReturnType<typeof standing>[], qualifying: Array<{ clanId: number; matches: number; required: number }> = []) => ({
    period: 'week', matchType: 'official', generatedAt: '', lastMatchAt: null,
    standings, qualifying: qualifying.map((entry) => ({ ...entry, name: 'x', tag: 'x', imageUrl: null })), withoutMatch: [], feed: [], titles: {},
    scoring: { minMatches: 10, settings: {}, league: { matches: 400, avgPlacementPoints: 3.9, avgDamage: 1100.2, avgKills: 2.1, avgKnocks: 2.8, rawScore: 9 } },
  })

  it('donne le rang du clan, ses voisins et les moyennes de la ligue', async () => {
    mocks.getClanLeague.mockResolvedValue(league([standing(1, 1, 'TOP'), standing(292, 2, '47R'), standing(3, 3, 'BOT')]))
    const result = await run('getLeagueStanding', { period: 'month' })
    expect(mocks.getClanLeague).toHaveBeenCalledWith('month', 'official')
    expect(result).toMatchObject({
      period: 'ce mois',
      ranked: true,
      clansRanked: 3,
      minMatches: 10,
      clan: { rank: 2, tag: '47R', powerScore: 61.3, winRatePercent: 15, avgDamage: 1235, avgKills: 2.35, previousRank: 3, activeMembers: 9 },
      above: { rank: 1, tag: 'TOP' },
      below: { rank: 3, tag: 'BOT' },
      leagueAverage: { avgPlacementPoints: 3.9, avgDamage: 1100, avgKills: 2.1, avgKnocks: 2.8 },
    })
  })

  it('garde la Ligue en cache cinq minutes, période par période', async () => {
    mocks.getClanLeague.mockResolvedValue(league([standing(292, 1, '47R')]))
    await run('getLeagueStanding', { period: 'week' })
    await run('getLeagueStanding', { period: 'week' })
    expect(mocks.getClanLeague).toHaveBeenCalledTimes(1)
    await run('getLeagueStanding', { period: 'month' })
    expect(mocks.getClanLeague).toHaveBeenCalledTimes(2)
  })

  it('dit combien de parties manquent à un clan pas encore classé', async () => {
    mocks.getClanLeague.mockResolvedValue(league([standing(1, 1, 'TOP')], [{ clanId: 292, matches: 7, required: 10 }]))
    expect(await run('getLeagueStanding')).toMatchObject({ ranked: false, matches: 7, required: 10, message: 'Encore 3 partie(s) officielle(s) pour être classé.' })
    resetCoachLeagueCache()
    mocks.getClanLeague.mockResolvedValue(league([standing(1, 1, 'TOP')]))
    expect(await run('getLeagueStanding')).toMatchObject({ ranked: false, matches: 0 })
  })
})

describe('getItemUsage', () => {
  const own = {
    period: 'all',
    totalCount: 60,
    matchCount: 20,
    families: [
      { subCategory: 'Heal', count: 40, share: 66.7 },
      { subCategory: 'Boost', count: 20, share: 33.3 },
    ],
    items: [
      { itemId: 'Item_Heal_Bandage_C', subCategory: 'Heal', count: 30, share: 50 },
      { itemId: 'Item_Boost_PainKiller_C', subCategory: 'Boost', count: 20, share: 33.3 },
      { itemId: 'Item_Heal_FirstAid_C', subCategory: 'Heal', count: 10, share: 16.7 },
    ],
    members: [],
    dataStart: '2026-09-18T19:00:00.000Z',
  }
  const clan = {
    ...own,
    totalCount: 180,
    matchCount: 35,
    members: [
      { memberId: 5, displayName: 'maladus7', count: 120, perMatch: 4 },
      { memberId: 100, displayName: 'NovakTV', count: 60, perMatch: 3 },
    ],
  }

  beforeEach(() => {
    mocks.loadItemUse.mockImplementation(async (input: { memberId?: number }) => (input.memberId ? own : clan))
    mocks.throwGroupBy.mockResolvedValue([
      { itemId: 'Item_Weapon_SmokeBomb_C', _sum: { count: 7 } },
      { itemId: 'Item_Weapon_Grenade_C', _sum: { count: 12 } },
      { itemId: 'Item_Weapon_Apple_C', _sum: { count: 0 } },
    ])
  })

  it('décrit les objets consommés par famille et par objet, situe le joueur dans le clan, ajoute les lancers', async () => {
    const result = await run('getItemUsage')
    expect(mocks.loadItemUse).toHaveBeenCalledWith({ memberId: 100, period: 'all', bounds: null, excludeSubCategories: ['None'] })
    expect(mocks.loadItemUse).toHaveBeenCalledWith({ clanId: 292, period: 'all', bounds: null, excludeSubCategories: ['None'] })
    expect(mocks.throwGroupBy).toHaveBeenCalledWith({ by: ['itemId'], where: { memberId: 100 }, _sum: { count: true } })
    expect(result).toMatchObject({
      player: 'NovakTV',
      period: 'depuis toujours',
      consumed: {
        matches: 20,
        total: 60,
        perMatch: 3,
        since: '2026-09-18T19:00:00.000Z',
        families: [
          { family: 'Soins', count: 40, sharePercent: 67, perMatch: 2 },
          { family: 'Boosts', count: 20, sharePercent: 33, perMatch: 1 },
        ],
      },
      // 180 objets sur 30 + 20 parties de membres : 3,6 par joueur et par partie.
      clan: { perMatch: 3.6, membersCounted: 2, rankByVolume: 2, topConsumer: { player: 'maladus7', perMatch: 4 } },
      thrown: { total: 19, items: [{ item: 'Grenade', count: 12 }, { item: 'Fumigène', count: 7 }] },
    })
    const items = (result as { consumed: { items: Array<{ item: string; family: string; perMatch: number }> } }).consumed.items
    expect(items[0]).toEqual({ item: 'Bandage', family: 'Soins', count: 30, perMatch: 1.5 })
    expect(items[1].item).toBe('Analgésique')
    expect((result as { note: string }).note).toContain('pas le contenu du sac')
  })

  it('borne la période et cherche un autre membre dans le clan seulement', async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: 5, displayName: 'maladus7' })
    const result = await run('getItemUsage', { playerName: 'maladus7', period: 'month' })
    expect(mocks.memberFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ clanId: 292, isActive: true }) }))
    expect(mocks.loadItemUse).toHaveBeenCalledWith(expect.objectContaining({ memberId: 5, period: 'month', bounds: expect.objectContaining({ startDate: expect.any(Date) }) }))
    expect(mocks.throwGroupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { memberId: 5, matchDate: { gte: expect.any(Date), lt: expect.any(Date) } } }))
    expect(result).toMatchObject({ player: 'maladus7', period: 'ce mois', clan: { rankByVolume: 1 } })

    mocks.memberFindFirst.mockResolvedValue(null)
    expect(await run('getItemUsage', { playerName: 'Inconnu' })).toEqual({ error: 'player_not_found', message: "Aucun membre du clan ne s'appelle Inconnu." })
  })
})

describe('getMapPerformance', () => {
  const row = (mapName: string, mapLabel: string, matches: number, wins: number, top10Rate: number, overrides: Record<string, unknown> = {}) => ({
    mapName,
    mapLabel,
    matches,
    wins,
    winRate: wins / matches,
    top10Rate,
    avgPlacement: 9.44,
    killsPerMatch: 2.46,
    damagePerMatch: 412.7,
    lowSample: false,
    vsClans: { top10Pts: 10.44, avgPlacement: -1.2, killsPerMatch: 0.3 },
    top10TrendPts: 5.2,
    starPlayer: { memberId: 5, displayName: 'maladus7', matches: 20, killsPerMatch: 1.25 },
    ...overrides,
  })
  const payload = {
    clan: { id: 292, name: 'Clan', tag: '47R' },
    period: 'month',
    matchType: 'official',
    minSample: 10,
    comparedClans: 36,
    totals: { matches: 63, maps: 3 },
    maps: [
      row('Desert_Main', 'Miramar', 20, 1, 0.4),
      row('Baltic_Main', 'Erangel', 40, 4, 0.55),
      row('Neon_Main', 'Rondo', 3, 0, 0.33, { lowSample: true, vsClans: { top10Pts: null, avgPlacement: null, killsPerMatch: null }, top10TrendPts: null, starPlayer: null }),
    ],
    verdict: {
      strongest: { mapName: 'Baltic_Main', mapLabel: 'Erangel', top10Rate: 0.55, vsClansPts: 10.44 },
      weakest: { mapName: 'Desert_Main', mapLabel: 'Miramar', top10Rate: 0.4, vsClansPts: -6.1, trendPts: null },
      mostPlayed: { mapName: 'Baltic_Main', mapLabel: 'Erangel', matches: 40, share: 0.667 },
    },
  }

  beforeEach(() => {
    mocks.loadMapStats.mockResolvedValue(payload)
  })

  it('rend le verdict et chaque carte comme la page, la plus jouée d’abord, sans identifiant', async () => {
    const result = (await run('getMapPerformance')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(mocks.loadMapStats).toHaveBeenCalledWith({ clanId: 292, period: 'month', matchType: 'official' })
    expect(result).toMatchObject({
      period: 'ce mois',
      matchType: 'Normal',
      comparedClans: 36,
      minSample: 10,
      totals: { matches: 63, maps: 3 },
      verdict: {
        strongest: { map: 'Erangel', top10Percent: 55, vsClansPts: 10.4 },
        weakest: { map: 'Miramar', top10Percent: 40, vsClansPts: -6.1, trendPts: null },
        mostPlayed: { map: 'Erangel', matches: 40, sharePercent: 67 },
      },
    })
    expect(result.maps.map((map: { map: string }) => map.map)).toEqual(['Erangel', 'Miramar', 'Rondo'])
    expect(result.maps[0]).toMatchObject({
      matches: 40,
      wins: 4,
      winRatePercent: 10,
      top10Percent: 55,
      avgPlacement: 9.4,
      killsPerMatch: 2.5,
      damagePerMatch: 413,
      lowSample: false,
      vsClans: { top10Pts: 10.4, avgPlacement: -1.2, killsPerMatch: 0.3 },
      top10TrendPts: 5.2,
      starPlayer: { player: 'maladus7', killsPerMatch: 1.3, matches: 20 },
    })
    expect(result.maps[2]).toMatchObject({ map: 'Rondo', lowSample: true, vsClans: null, top10TrendPts: null, starPlayer: null })
    expect(JSON.stringify(result)).not.toMatch(/memberId/)
  })

  it('cible une carte par son nom, borne période et type, refuse une carte inconnue', async () => {
    const result = (await run('getMapPerformance', { mapName: 'erangel', period: 'all', matchType: 'competitive' })) as { matchType: string; period: string; maps: unknown[] }
    expect(mocks.loadMapStats).toHaveBeenCalledWith({ clanId: 292, period: 'all', matchType: 'competitive' })
    expect(result).toMatchObject({ period: 'depuis toujours', matchType: 'Ranked' })
    expect(result.maps).toHaveLength(1)
    expect(await run('getMapPerformance', { mapName: 'Atlantide' })).toEqual({ error: 'map_not_found', message: 'Carte inconnue : Atlantide.' })
    await run('getMapPerformance', { period: 'never', matchType: 'bots' })
    expect(mocks.loadMapStats).toHaveBeenLastCalledWith({ clanId: 292, period: 'month', matchType: 'official' })
  })
})

describe('getPlaySchedule', () => {
  // Octobre 2026 : heure d'été (UTC+2) jusqu'au dimanche 25. 22:40Z le samedi = 00:40 dimanche à Paris.
  const play = (iso: string, placement = 5, durationSeconds = 1500) => ({ playedAt: new Date(iso), durationSeconds, placement })
  const plays = [
    play('2026-10-21T13:00:00Z'), // mercredi 15h
    play('2026-10-23T19:30:00Z', 1), // vendredi 21h, Top 1
    play('2026-10-23T19:50:00Z'), // vendredi 21h
    play('2026-10-23T20:10:00Z'), // vendredi 22h
    play('2026-10-24T19:05:00Z'), // samedi 21h
    play('2026-10-24T22:40:00Z', 1, 900), // dimanche 00h, soirée du samedi
  ]

  it('lit le jour et l’heure de Paris', () => {
    expect(parisSlot(new Date('2026-10-24T22:40:00Z'))).toEqual({ dayIndex: 6, hour: 0 })
    expect(parisSlot(new Date('2026-10-21T13:00:00Z'))).toEqual({ dayIndex: 2, hour: 15 })
  })

  it('compte parties, soirées, créneaux favoris, plages habituelles et part semaine / week-end', () => {
    const schedule = buildPlaySchedule(plays)
    expect(schedule).toMatchObject({
      matches: 6,
      activeDays: 3,
      playtimeHours: 2.3,
      perActiveDay: { matches: 2, hours: 0.8 },
      favoriteSlots: [
        { slot: 'Vendredi, 21h–22h', matches: 2 },
        { slot: 'Mercredi, 15h–16h', matches: 1 },
        { slot: 'Vendredi, 22h–23h', matches: 1 },
      ],
      usualHours: { weekdays: '15h–23h', weekend: null },
      weekSplit: { weekdaysPercent: 67, weekendPercent: 33 },
    })
    expect(schedule.byWeekday[4]).toEqual({ day: 'Vendredi', matches: 3, sharePercent: 50, wins: 1 })
    expect(schedule.byWeekday[6]).toEqual({ day: 'Dimanche', matches: 1, sharePercent: 17, wins: 1 })
    expect(buildPlaySchedule([])).toMatchObject({ matches: 0, activeDays: 0, perActiveDay: null, favoriteSlots: [], usualHours: { weekdays: null, weekend: null } })
  })

  it('lit les parties du joueur, ou celles de l’escouade du clan, sur la période', async () => {
    mocks.matchFindMany.mockResolvedValue(plays.map((entry) => ({ pubgCreatedAt: entry.playedAt, duration: entry.durationSeconds, placement: entry.placement })))
    const own = await run('getPlaySchedule', { period: 'month' })
    expect(mocks.matchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ memberId: 100, matchType: 'official', pubgCreatedAt: { gte: expect.any(Date) } }), take: 3000 })
    )
    expect(own).toMatchObject({ scope: 'NovakTV', period: 'ce mois', matches: 6 })

    mocks.squadMatchFindMany.mockResolvedValue([{ createdAt: new Date('2026-10-23T19:30:00Z'), placement: 2, members: [{ timeSurvived: 1200 }, { timeSurvived: 1700 }] }])
    const clan = await run('getPlaySchedule', { scope: 'clan' })
    expect(mocks.squadMatchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ matchType: 'official', members: { some: { member: { clanId: 292, isActive: true } } } }) })
    )
    expect(clan).toMatchObject({ scope: 'le clan', period: 'depuis toujours', matches: 1, playtimeHours: 0.5 })
  })
})

describe('getPlayerBenchmark', () => {
  const entry = (memberId: number, name: string, clanTag: string, avgDamage: number, avgKills: number, avgRevives: number, avgSurvivalSeconds: number, previousRanks: Array<number | null> | null) => ({
    memberId,
    name,
    clanId: clanTag === '47R' ? 292 : 3,
    clanName: `Clan ${clanTag}`,
    clanTag,
    matches: 30,
    wins: 2,
    avgDamage,
    avgKills,
    avgKnocks: avgKills + 0.5,
    avgRevives,
    avgAssists: 1,
    avgSurvivalSeconds,
    headshotRate: 0.25,
    avgKillDistance: 80,
    zoneInsideRate: 0.7,
    roles: { fragger: 50, medic: 80, ghost: 60, sniper: 70 },
    style: 'medic',
    previousRanks,
  })
  const ranking = {
    period: 'week',
    mode: 'all',
    minMatches: 10,
    minRanked: 20,
    totals: { players: 510, clans: 33 },
    ranked: [
      entry(100, 'NovakTV', '47R', 300, 2, 1, 900, [3, 2, 2, 1, 2, 2, 1, 2, 1]),
      entry(5, 'maladus7', '47R', 450, 3, 0.5, 700, null),
      entry(7, 'Autre', 'FRX', 200, 1, 0.2, 1000, null),
    ],
    qualifying: [{ ...entry(9, 'Novice', '47R', 100, 1, 0, 500, null), matches: 6 }],
    clans: [{ clanId: 292, name: 'x', tag: '47R' }, { clanId: 3, name: 'y', tag: 'FRX' }],
    lastMatchAt: null,
  }

  it('situe le joueur sur chaque critère, avec le joueur juste devant, l’écart et le rang précédent', async () => {
    mocks.getPlayersRanking.mockResolvedValue(ranking)
    const result = (await run('getPlayerBenchmark')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(mocks.getPlayersRanking).toHaveBeenCalledWith('week', 'all')
    expect(result).toMatchObject({
      player: 'NovakTV',
      period: 'cette semaine',
      mode: 'tous modes',
      playersRanked: 3,
      clansCompared: 2,
      ranked: true,
      style: 'medic',
      averages: { damage: 300, kills: 2, survivalMinutes: 15, headshotRatePercent: 25, avgKillDistanceM: 80, zoneInsidePercent: 70 },
    })
    expect(result.roles[0]).toEqual({ role: 'Fragger', score: 50, measures: 'dégâts, kills et knocks' })
    const damage = result.criteria.find((line: { criterion: string }) => line.criterion === 'Dégâts')
    expect(damage).toMatchObject({ position: 2, of: 3, aheadSharePercent: 33, previousPosition: 3, justAhead: { player: 'maladus7', clanTag: '47R', gap: '150' } })
    const revives = result.criteria.find((line: { criterion: string }) => line.criterion === 'Réanimations')
    expect(revives).toMatchObject({ position: 1, of: 3, aheadSharePercent: 67, justAhead: null })
    expect(JSON.stringify(result)).not.toMatch(/memberId|clanId/)
  })

  it('dit les parties manquantes à un joueur en qualification, et accepte période et mode', async () => {
    mocks.getPlayersRanking.mockResolvedValue(ranking)
    mocks.memberFindFirst.mockResolvedValue({ id: 9, displayName: 'Novice' })
    const result = await run('getPlayerBenchmark', { playerName: 'Novice', period: 'month', mode: 'squad' })
    expect(mocks.getPlayersRanking).toHaveBeenCalledWith('month', 'squad')
    expect(result).toMatchObject({ player: 'Novice', ranked: false, matches: 6, required: 10, message: 'Encore 4 partie(s) officielle(s) de clan pour être classé.' })
  })
})

describe('getCareerStats', () => {
  const lifetime = (kills: number, wins: number, losses: number) => ({
    combat: { kills, deaths: losses, kdRatio: kills / Math.max(1, losses), headshots: Math.round(kills / 4), assists: 40, knockouts: kills + 20, highestKillstreak: 6, longestKill: 412.6, teamkills: 0, suicides: 1 },
    victory: { wins, losses, winLossRatio: wins / Math.max(1, losses), longestTimeAlive: 1980 },
    support: { teammatesRevived: 120, boostsUsed: 300, healed: 450 },
    vehicle: { vehiclesDestroyed: 3, roadkills: 7 },
    movement: { drivenDistance: 812_400, walkedDistance: 405_900, swamDistance: 3_200 },
    other: { weaponsPicked: 2200, damageGiven: 98_765.4, timeSurvived: 523_800, roundsPlayed: wins + losses, daysPlayed: 136 },
  })
  const cached = {
    memberId: 100,
    ...lifetime(500, 20, 480),
    statsSquad: lifetime(400, 18, 382),
    statsDuo: null,
    statsSolo: null,
    lastRefreshedAt: new Date('2026-10-24T03:10:00Z'),
  }

  beforeEach(() => {
    mocks.lifetimeFindUnique.mockResolvedValue(cached)
    mocks.lifetimeFindMany.mockResolvedValue([
      { memberId: 100, ...lifetime(500, 20, 480) },
      { memberId: 5, ...lifetime(300, 25, 300) },
    ])
    mocks.seasonFindMany.mockResolvedValue([
      {
        seasonId: 'division.bro.official.pc-2018-43',
        rankedTier: 'Gold', rankedSubTier: '3', rankedPoints: 2140.4, rankedBestTier: 'Gold', rankedBestSubTier: '2', rankedBestPoints: 2210,
        rankedKills: 48, rankedWins: 2, rankedMatches: 31,
        normalKills: 120, normalDamage: 31_500, normalWins: 4, normalLosses: 96, normalMatches: 100,
      },
    ])
  })

  it('résume la carrière, les médailles du clan et les saisons, sans appeler l’API PUBG', async () => {
    const result = (await run('getCareerStats')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(mocks.lifetimeFindUnique).toHaveBeenCalledWith({ where: { memberId: 100 } })
    expect(mocks.lifetimeFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { member: { clanId: 292, isActive: true } } }))
    expect(result).toMatchObject({
      player: 'NovakTV',
      mode: 'tous modes',
      syncedAt: '2026-10-24T03:10:00.000Z',
      career: { games: 500, wins: 20, winRatePercent: 4, kd: 1.04, kills: 500, knocks: 520, damage: 98765, damagePerGame: 198, revives: 120, timePlayedHours: 145.5, daysPlayed: 136, longestKillM: 413, bestKillStreak: 6, longestSurvivalMin: 33, walkedKm: 405.9, drivenKm: 812.4 },
    })
    // 500 kills contre 300 : or ; 20 victoires contre 25 : argent.
    expect(result.clanMedals).toEqual(expect.arrayContaining([
      { stat: 'Kills', medal: 'or', value: '500' },
      { stat: 'Victoires', medal: 'argent', value: '20' },
    ]))
    expect(result.seasons).toEqual([
      {
        season: 'Saison 43',
        ranked: { tier: expect.stringContaining('Or'), points: 2140, bestTier: expect.stringContaining('Or'), matches: 31, wins: 2, kills: 48 },
        normal: { matches: 100, wins: 4, kills: 120, kd: 1.25, damagePerMatch: 315 },
      },
    ])
    expect(JSON.stringify(result)).not.toMatch(/memberId|accountId/)
  })

  it('sert un mode seul, refuse un mode sans parties, dit quand la carrière n’est pas synchronisée', async () => {
    expect(await run('getCareerStats', { mode: 'squad' })).toMatchObject({ mode: 'squad', career: { games: 400, kills: 400 } })
    expect(await run('getCareerStats', { mode: 'solo' })).toEqual({ error: 'mode_not_available', message: 'Aucune partie en solo dans la carrière de NovakTV.' })
    mocks.lifetimeFindUnique.mockResolvedValue(null)
    expect(await run('getCareerStats')).toMatchObject({ error: 'career_not_synced' })
  })
})

describe('getClanPlaystyle', () => {
  const row = (memberId: number, displayName: string, aggression: number, support: number, zone: number) => ({
    memberId,
    aggressionScore: aggression,
    supportScore: support,
    zoneDisciplineScore: zone,
    avgBlueZoneHits: 1.2,
    avgFirstContactPhase: 2.4,
    avgCircleDelaySeconds: 12,
    avgCircleDelayPercent: 8,
    avgSafeZonePresencePercent: 78,
    avgOnFootDistanceMeters: 3200,
    avgVehicleDistanceMeters: 5100,
    avgDamageTaken: 310,
    avgHealsUsed: 2.6,
    avgHealAmount: 180,
    avgBoostsUsed: 1.9,
    maxVehicleSpeedKph: 1180,
    avgPositionEvents: 210,
    matchesPlayed: 24,
    member: { displayName },
  })
  const pair = (aId: number, aName: string, bId: number, bName: string, revives: number, coKills: number, recalls: number) => ({
    memberAId: aId,
    memberBId: bId,
    reviveCount: revives,
    recallCount: recalls,
    coKillCount: coKills,
    sharedDamageEvents: 10,
    memberA: { displayName: aName },
    memberB: { displayName: bName },
  })

  beforeEach(() => {
    mocks.telemetryStatsFindMany.mockResolvedValue([row(100, 'NovakTV', 60, 90, 70), row(5, 'maladus7', 100, 40, 50), row(6, 'Ionera', 80, 60, 100)])
    mocks.synergyFindMany.mockResolvedValue([pair(100, 'NovakTV', 5, 'maladus7', 12, 9, 2), pair(5, 'maladus7', 6, 'Ionera', 4, 14, 0), pair(100, 'NovakTV', 6, 'Ionera', 7, 3, 1)])
  })

  it('décrit rôles, thèmes et coopération du clan, et situe le joueur face au clan', async () => {
    const result = (await run('getClanPlaystyle', { period: 'month' })) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(mocks.telemetryStatsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { period: expect.stringMatching(/^month-\d{4}-\d{2}$/), member: { clanId: 292, isActive: true } } })
    )
    expect(mocks.synergyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clanId: 292, period: expect.stringMatching(/^month-/), matchType: 'official', mode: 'all' } })
    )
    expect(result).toMatchObject({ period: 'ce mois', members: 3 })
    expect(result.roles[1]).toEqual({ role: 'Medic', measures: 'réanimations ; 0 % = aucune', clanAverage: 63, top: [{ player: 'NovakTV', score: 90 }, { player: 'Ionera', score: 60 }, { player: 'maladus7', score: 40 }] })
    expect(result.themes).toMatchObject({
      mobility: { kmPerMatch: 8.3, onFootPercent: 39, maxSpeedKph: 118 },
      circle: { inSafeZonePercent: 78, outsideZonePercent: 8, blueZoneHitsPerMatch: 1.2, firstContactPhase: 2.4, circleDelaySeconds: 12 },
      survival: { healedPerMatch: 180, damageTakenPerMatch: 310, healCoveragePercent: 58, healsPerMatch: 2.6, boostsPerMatch: 1.9 },
    })
    expect(result.cooperation).toMatchObject({ pairs: 3, revives: 23, coKills: 26, recalls: 3, topRevives: [{ players: ['NovakTV', 'maladus7'], value: 12 }, { players: ['NovakTV', 'Ionera'], value: 7 }, { players: ['maladus7', 'Ionera'], value: 4 }] })
    expect(result.you).toMatchObject({
      player: 'NovakTV',
      matchesAnalyzed: 24,
      roles: [
        { role: 'Fragger', score: 60, clanAverage: 80, delta: -20, rank: 3, of: 3 },
        { role: 'Medic', score: 90, clanAverage: 63, delta: 27, rank: 1, of: 3 },
        { role: 'Ghost', score: 70, clanAverage: 73, delta: -3, rank: 2, of: 3 },
      ],
      partners: [{ player: 'maladus7', revives: 12, coKills: 9, recalls: 2 }, { player: 'Ionera', revives: 7, coKills: 3, recalls: 1 }],
    })
    expect(JSON.stringify(result)).not.toMatch(/memberId/)
  })

  it('sans partie analysée : le dit, sans chiffre', async () => {
    mocks.telemetryStatsFindMany.mockResolvedValue([])
    mocks.synergyFindMany.mockResolvedValue([])
    expect(await run('getClanPlaystyle')).toEqual({ period: 'cette semaine', members: 0, message: 'Aucune partie analysée par la télémétrie sur la période.' })
  })
})

describe('getClanCareer', () => {
  const lifetime = (kills: number, deaths: number, wins: number, timeSurvived?: number) => ({
    combat: { kills, deaths, kdRatio: kills / Math.max(1, deaths), headshots: Math.round(kills / 4), assists: 40, knockouts: kills + 20, highestKillstreak: 6, longestKill: 412.6, teamkills: 1, suicides: 0 },
    victory: { wins, losses: deaths, winLossRatio: wins / Math.max(1, deaths), longestTimeAlive: 1980 },
    support: { teammatesRevived: 120, boostsUsed: 300, healed: 450 },
    vehicle: { vehiclesDestroyed: 3, roadkills: 7 },
    movement: { drivenDistance: 812_400, walkedDistance: 405_900, swamDistance: 3_200 },
    other: { weaponsPicked: 2200, damageGiven: 98_765.4, roundsPlayed: wins + deaths, daysPlayed: 136, ...(timeSurvived === undefined ? {} : { timeSurvived }) },
  })
  const row = (id: number, displayName: string, stats: ReturnType<typeof lifetime>, refreshedAt: string) => ({ ...stats, lastRefreshedAt: new Date(refreshedAt), member: { id, displayName } })

  beforeEach(() => {
    mocks.lifetimeFindMany.mockResolvedValue([
      row(100, 'NovakTV', lifetime(500, 480, 20, 523_800), '2026-10-24T03:10:00Z'),
      row(5, 'maladus7', lifetime(900, 600, 45, 700_000), '2026-10-24T03:12:00Z'),
      row(6, 'Ionera', lifetime(300, 150, 10), '2026-10-20T03:00:00Z'),
    ])
    mocks.memberCount.mockResolvedValue(4)
  })

  it('cumule la carrière des membres actifs du clan, avec podiums et place du joueur, sans identifiant', async () => {
    const result = (await run('getClanCareer')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(mocks.lifetimeFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { member: { clanId: 292, isActive: true } } }))
    expect(mocks.memberCount).toHaveBeenCalledWith({ where: { clanId: 292, isActive: true } })
    expect(result).toMatchObject({
      player: 'NovakTV',
      membersSynced: 3,
      activeMembers: 4,
      unsynced: 1,
      syncedAt: { latest: '2026-10-24T03:12:00.000Z', oldest: '2026-10-20T03:00:00.000Z' },
    })
    expect(result.headline.map((line: { label: string }) => line.label)).toEqual(['Temps de jeu', 'Kills', 'Victoires', 'Distance parcourue'])
    expect(result.headline[1]).toMatchObject({ label: 'Kills', value: expect.stringMatching(/^1.700$/) })
    expect(result.groups.map((group: { group: string }) => group.group)).toEqual(['Engagement', 'Combat', 'Victoires', 'Support', 'Véhicules', 'Déplacements', 'Autres'])
    const combat = result.groups[1]
    const kills = combat.metrics.find((metric: { metric: string }) => metric.metric === 'Kills')
    expect(kills).toMatchObject({ kind: 'Total', clan: expect.stringMatching(/^1.700$/), you: { value: '500', rank: 2, of: 3 } })
    expect(kills.top).toMatch(/^maladus7 900 · NovakTV 500 · Ionera 300$/)
    // « Moins = mieux » : le moins de morts d'abord ; « Mur de la honte » : le plus de teamkills d'abord.
    const deaths = combat.metrics.find((metric: { metric: string }) => metric.metric === 'Morts')
    expect(deaths).toMatchObject({ kind: 'Moins = mieux', you: { rank: 2, of: 3 } })
    expect(deaths.top).toMatch(/^Ionera 150 · /)
    expect(combat.metrics.find((metric: { metric: string }) => metric.metric === 'Teamkills').kind).toBe('Mur de la honte')
    // Le temps de jeu manque à un joueur synchronisé avant l'ajout du champ.
    const time = result.groups[0].metrics.find((metric: { metric: string }) => metric.metric === 'Temps de jeu')
    expect(time).toMatchObject({ kind: 'Total', clan: expect.stringMatching(/^340.h$/), membersWithoutData: 1, you: { rank: 2, of: 2 } })
    expect(JSON.stringify(result)).not.toMatch(/memberId/)
  })

  it('sert une seule famille, situe un autre membre, dit quand rien n’est synchronisé', async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: 5, displayName: 'maladus7' })
    const result = (await run('getClanCareer', { group: 'victory', playerName: 'maladus7' })) as { player: string; groups: Array<{ group: string; metrics: Array<{ metric: string; you: { rank: number } }> }> }
    expect(result.player).toBe('maladus7')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].group).toBe('Victoires')
    expect(result.groups[0].metrics[0]).toMatchObject({ metric: 'Victoires', you: { rank: 1 } })
    mocks.lifetimeFindMany.mockResolvedValue([])
    expect(await run('getClanCareer')).toMatchObject({ error: 'career_not_synced' })
  })
})

describe('getCityInsights', () => {
  // Grille 40 × 40 : la case 19/19 (48,75 %) est dans le cercle de Pochinki (50 %, rayon 5), la case 0/0 hors de toute ville.
  const cell = (metric: string, xIndex: number, yIndex: number, events: number) => ({ mapName: 'Baltic_Main', metric, xIndex, yIndex, events, weekStart: null })
  const memberCells = [cell('position', 19, 19, 100), cell('position', 0, 0, 50), cell('kill', 19, 19, 6), cell('damage_dealt', 19, 19, 900), cell('revive_given', 19, 19, 2)]
  const clanCells = [cell('position', 19, 19, 300), cell('position', 0, 0, 100), cell('kill', 19, 19, 20)]
  const deathCells = [cell('death', 19, 19, 4), cell('death', 0, 0, 3)]

  beforeEach(() => {
    mocks.loadCityCells.mockImplementation(async (input: { memberId?: number; sources?: string[] | null }) => (input.sources?.includes('death') ? deathCells : input.memberId ? memberCells : clanCells))
    mocks.loadCityCoverage.mockResolvedValue({ matchCount: 12, dataStart: new Date('2026-10-03T19:00:00Z') })
  })

  it('décrit les villes du joueur — présence, combats, morts — comparées au clan, sur la semaine comme sa page', async () => {
    const result = (await run('getCityInsights')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    // Quatre lectures : ses cellules, ses morts, sa couverture, et le clan pour la comparaison ; aucun filtre de type sur un joueur.
    expect(mocks.loadCityCells).toHaveBeenCalledTimes(3)
    expect(mocks.loadCityCells).toHaveBeenCalledWith({ clanId: 292, memberId: 100, bounds: expect.objectContaining({ startDate: expect.any(Date) }), matchType: null, mapNames: null })
    expect(mocks.loadCityCells).toHaveBeenCalledWith(expect.objectContaining({ memberId: 100, sources: ['death'] }))
    expect(mocks.loadCityCells).toHaveBeenCalledWith({ clanId: 292, bounds: expect.any(Object), matchType: null, mapNames: null })
    expect(mocks.loadCityCoverage).toHaveBeenCalledWith(expect.objectContaining({ clanId: 292, memberId: 100 }))
    expect(result).toMatchObject({
      scope: 'NovakTV',
      period: 'cette semaine',
      matchType: 'toutes les parties',
      map: 'toutes les cartes',
      matches: 12,
      since: '2026-10-03T19:00:00.000Z',
      mainMap: 'Erangel',
      favoriteCity: { city: 'Pochinki', map: 'Erangel', events: 100, sharePercent: 100, clanSharePercent: 100 },
      favoriteCombatCity: { city: 'Pochinki', combatEvents: 906 },
      outsideCitiesPercent: 33,
    })
    // Six kills, deux réanimations : sous 25 événements, pas de comparaison au clan (seule la présence, 100, y a droit).
    expect(result.top.kills).toEqual([{ city: 'Pochinki', map: 'Erangel', events: 6, sharePercent: 100 }])
    expect(result.top.revives[0]).not.toHaveProperty('clanSharePercent')
    expect(result.top.deaths).toEqual([{ city: 'Pochinki', map: 'Erangel', events: 4, sharePercent: 100 }])
    expect(result.fights).toEqual([{ city: 'Pochinki', map: 'Erangel', kills: 6, deaths: 4, killsPerDeath: 1.5 }])
    expect(JSON.stringify(result)).not.toMatch(/memberId|locationId/)
  })

  it('lit le clan en parties officielles comme son tableau de bord, borne carte et période, refuse une carte inconnue', async () => {
    const result = (await run('getCityInsights', { scope: 'clan', period: 'all', mapName: 'erangel' })) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(mocks.loadCityCells).toHaveBeenCalledTimes(2)
    expect(mocks.loadCityCells).toHaveBeenCalledWith({ clanId: 292, memberId: undefined, bounds: null, matchType: ['official'], mapNames: ['Baltic_Main'] })
    expect(mocks.memberFindFirst).not.toHaveBeenCalled()
    expect(result).toMatchObject({ scope: 'le clan', period: 'depuis toujours', matchType: 'Normal', map: 'Erangel', favoriteCity: { city: 'Pochinki', events: 300 } })
    expect(result.favoriteCity).not.toHaveProperty('clanSharePercent')
    expect(await run('getCityInsights', { mapName: 'Atlantide' })).toEqual({ error: 'map_not_found', message: 'Carte inconnue : Atlantide.' })
    await run('getCityInsights', { scope: 'clan', matchType: 'casual' })
    expect(mocks.loadCityCells).toHaveBeenLastCalledWith(expect.objectContaining({ matchType: ['casual', 'airoyale'] }))
  })
})

describe('getZoneClosures', () => {
  const member = (memberId: number, displayName: string, positions: number, averageRatio: number, center: number, edge: number, outside: number) => ({ memberId, displayName, positions, averageRatio, bands: { center, edge, outside } })
  const summary = (overrides: Record<string, unknown> = {}) => ({
    period: 'week',
    selectedMap: 'Baltic_Main',
    maps: [{ mapName: 'Baltic_Main', positions: 120, matches: 30 }, { mapName: 'Desert_Main', positions: 40, matches: 12 }],
    // NovakTV : 22,5 % au centre, 55 % au bord, 22,5 % dehors — sous chaque seuil de profil, donc « Équilibré ».
    members: [member(100, 'NovakTV', 40, 0.62, 9, 22, 9), member(5, 'maladus7', 50, 0.48, 20, 25, 5), member(6, 'Ionera', 30, 1.05, 2, 12, 16), member(7, 'Newbie', 4, 0.3, 2, 2, 0)],
    counts: { positions: 124, matches: 30, closures: 70, members: 4, averageSurvivors: 23.4 },
    bands: { center: 34, edge: 59, outside: 31 },
    averageRatio: 0.71,
    byPhase: [
      { phase: 2, positions: 60, averageRatio: 0.8, bands: { center: 10, edge: 30, outside: 20 } },
      { phase: 5, positions: 20, averageRatio: 0.5, bands: { center: 8, edge: 10, outside: 2 } },
    ],
    cells: [],
    topCities: [{ locationId: 'pochinki', name: 'Pochinki', positions: 30, share: 60 }],
    dataStart: '2026-10-01T18:00:00.000Z',
    ...overrides,
  })

  beforeEach(() => {
    mocks.loadZoneClosures.mockResolvedValue(summary())
  })

  it('lit la carte la plus jouée du clan de la fermeture : bandes, verdict, titres, phases, joueurs profilés, place du joueur', async () => {
    const result = (await run('getZoneClosures')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(mocks.loadZoneClosures).toHaveBeenCalledTimes(1)
    expect(mocks.loadZoneClosures).toHaveBeenCalledWith(expect.objectContaining({ clanId: 292, period: 'week', mapName: null, phases: [], bounds: expect.objectContaining({ startDate: expect.any(Date) }) }))
    expect(result).toMatchObject({
      map: 'Erangel',
      period: 'cette semaine',
      phase: 'Toutes',
      otherMaps: [{ map: 'Miramar', closures: 40, matches: 12 }],
      counts: { positions: 124, closures: 70, matches: 30, members: 4, averageSurvivors: 23.4 },
      lowSample: false,
      since: '2026-10-01T18:00:00.000Z',
      bands: { centerPercent: 27, edgePercent: 48, outsidePercent: 25 },
      avgDistancePercentOfRadius: 71,
      verdict: { title: 'Maîtres du centre' },
      arrivalCities: [{ city: 'Pochinki', positions: 30, sharePercent: 60 }],
      membersTruncated: false,
    })
    expect(result.titles.map((title: { title: string; player: string }) => [title.title, title.player])).toEqual([
      ['Roi du cercle', 'maladus7'],
      ['Increvable', 'maladus7'],
      ['Coureur de zone bleue', 'Ionera'],
    ])
    expect(result.byPhase[0]).toEqual({ phase: 2, positions: 60, centerPercent: 17, edgePercent: 50, outsidePercent: 33, avgDistancePercentOfRadius: 80 })
    // Du plus central au plus excentré, les petits échantillons en fin de liste et sans profil.
    expect(result.members.map((line: { player: string; profile: string }) => [line.player, line.profile])).toEqual([
      ['maladus7', 'Joue le centre'],
      ['NovakTV', 'Équilibré'],
      ['Ionera', 'Court après la zone'],
      ['Newbie', 'trop peu de fermetures (moins de 10)'],
    ])
    expect(result.you).toEqual({ player: 'NovakTV', closures: 40, avgDistancePercentOfRadius: 62, centerPercent: 23, edgePercent: 55, outsidePercent: 23, profile: 'Équilibré' })
    expect(JSON.stringify(result)).not.toMatch(/memberId|locationId/)
  })

  it('relit une carte demandée seulement si elle a des fermetures, borne période et phase, et dit quand il n’y a rien', async () => {
    const result = (await run('getZoneClosures', { mapName: 'Miramar', period: 'month', phase: 'late' })) as { map: string; period: string; phase: string }
    expect(mocks.loadZoneClosures).toHaveBeenCalledTimes(2)
    expect(mocks.loadZoneClosures).toHaveBeenLastCalledWith(expect.objectContaining({ mapName: 'Desert_Main', period: 'month', phases: [5, 6, 7, 8] }))
    expect(result).toMatchObject({ period: 'ce mois', phase: 'Fin de partie · phases 5–8' })

    mocks.loadZoneClosures.mockClear()
    await run('getZoneClosures', { mapName: 'erangel' })
    expect(mocks.loadZoneClosures).toHaveBeenCalledTimes(1)

    expect(await run('getZoneClosures', { mapName: 'Atlantide' })).toEqual({ error: 'map_not_found', message: 'Carte inconnue : Atlantide.' })
    mocks.loadZoneClosures.mockResolvedValue(summary({ maps: [{ mapName: 'Baltic_Main', positions: 120, matches: 30 }] }))
    expect(await run('getZoneClosures', { mapName: 'Miramar' })).toMatchObject({ map: 'Miramar', message: 'Aucune fin de zone enregistrée sur cette carte pour la période.', otherMaps: [{ map: 'Erangel' }] })
    mocks.loadZoneClosures.mockResolvedValue(summary({ selectedMap: null, maps: [], members: [], counts: { positions: 0, matches: 0, closures: 0, members: 0, averageSurvivors: 0 } }))
    expect(await run('getZoneClosures')).toEqual({ period: 'cette semaine', phase: 'Toutes', message: 'Aucune fin de zone enregistrée sur la période.' })
  })
})

describe('getTournaments', () => {
  const entry = (clanId: number, tag: string, totalPoints: number) => ({
    key: `clan:${clanId}`,
    participant: { kind: 'clan' as const, clanId },
    label: `[${tag}] Clan ${tag}`,
    clanTags: [tag],
    memberLabels: [],
    clanIds: [clanId],
    totalPoints,
    totalKills: 12,
    wins: 1,
  })
  const overview = (overrides: Record<string, unknown>) => ({
    id: 'ctour1',
    title: 'L’Observateur des fun',
    description: null,
    status: 'active',
    phase: 'finished',
    mode: 'inter_clan',
    startDate: '2026-10-23T18:00:00.000Z',
    endDate: '2026-10-23T23:00:00.000Z',
    gameMode: null,
    mapName: null,
    mapLabel: null,
    organizerClan: { id: 1, name: 'FunsNRoses', tag: 'FUN' },
    roundCount: 4,
    participantCount: 6,
    clanCount: 6,
    playerCount: 24,
    lastRoundAt: null,
    leaders: [entry(1, 'FUN', 61.5), entry(292, '47R', 48), entry(3, 'FRX', 40)],
    standings: [],
    winner: entry(1, 'FUN', 61.5),
    ...overrides,
  })
  const all = () => [
    overview({}),
    overview({ id: 'ctour2', title: 'Scrims du jeudi', phase: 'live', winner: null, standings: [entry(1, 'FUN', 10), entry(3, 'FRX', 8), entry(4, 'X', 7), entry(5, 'Y', 6), entry(292, '47R', 2)] }),
    overview({ id: 'ctour3', title: 'Coupe de novembre', phase: 'upcoming', roundCount: 0, leaders: [], winner: null }),
    overview({ id: 'cdraft', title: 'Brouillon', phase: 'draft', leaders: [], winner: null }),
  ]

  it('liste les tournois publiés, du plus récent au plus ancien, avec vainqueur, podium et place du clan', async () => {
    mocks.listOverviews.mockResolvedValue(all())
    const result = (await run('getTournaments')) as { total: number; tournaments: Array<Record<string, unknown>> }
    expect(result.total).toBe(3)
    expect(result.tournaments.map((tournament) => tournament.tournamentId)).toEqual(['ctour1', 'ctour2', 'ctour3'])
    expect(result.tournaments[0]).toMatchObject({
      mode: 'Inter-clans',
      phase: 'terminé',
      organizer: { tag: 'FUN', name: 'FunsNRoses' },
      rounds: 4,
      winner: { rank: 1, label: '[FUN] Clan FUN', points: 61.5, kills: 12 },
      leader: null,
      yourClan: { rank: 2, label: '[47R] Clan 47R', points: 48 },
    })
    expect((result.tournaments[0].podium as unknown[]).length).toBe(3)
    // En direct : le classement complet est connu, le clan y est situé même hors podium.
    expect(result.tournaments[1]).toMatchObject({ phase: 'en cours', winner: null, leader: { label: '[FUN] Clan FUN' }, yourClan: { rank: 5 } })
    expect(result.tournaments[2]).toMatchObject({ phase: 'à venir', winner: null, leader: null, podium: [], yourClan: null })
    expect(JSON.stringify(result)).not.toContain('Brouillon')
  })

  it('filtre par statut et par titre, borne la liste, refuse un statut inconnu', async () => {
    mocks.listOverviews.mockResolvedValue(all())
    expect(((await run('getTournaments', { status: 'finished' })) as { total: number }).total).toBe(1)
    expect(((await run('getTournaments', { search: 'OBSERVATEUR' })) as { tournaments: unknown[] }).tournaments).toHaveLength(1)
    const limited = (await run('getTournaments', { limit: 1 })) as { total: number; tournaments: unknown[] }
    expect(limited.total).toBe(3)
    expect(limited.tournaments).toHaveLength(1)
    expect(await run('getTournaments', { status: 'draft' })).toEqual({ error: 'invalid_status', message: 'status : live, upcoming ou finished.' })
    // Aperçus gardés en cache cinq minutes.
    expect(mocks.listOverviews).toHaveBeenCalledTimes(1)
  })
})

describe('getTournamentResults', () => {
  const member = (id: number, clanId: number, displayName: string) => ({ id, clanId, displayName })
  const row = (memberId: number, clanId: number, name: string, placement: number, kills: number, damage: number) => ({
    memberId,
    kills,
    damage,
    placement,
    member: member(memberId, clanId, name),
  })
  // Deux manches : [SRTY] gagne la première, [FUN] la seconde ; NovakTV (le joueur de la session, membre 100) finit
  // MVP aux dégâts (kills à égalité).
  const matches = [
    { id: 'cmB', createdAt: new Date('2026-10-23T21:00:00Z'), mapName: 'Desert_Main', gameMode: 'squad', placement: 1, members: [row(1, 1, 'Alpha', 1, 4, 500), row(100, 292, 'NovakTV', 3, 2, 400.4), row(3, 3, 'Charlie', 2, 2, 300)] },
    { id: 'cmA', createdAt: new Date('2026-10-23T20:00:00Z'), mapName: 'Baltic_Main', gameMode: 'squad', placement: 2, members: [row(1, 1, 'Alpha', 2, 3, 350), row(100, 292, 'NovakTV', 1, 5, 900), row(3, 3, 'Charlie', 4, 1, 100), row(101, 292, 'Menez69', 1, 0, 50)] },
  ]
  // Kill feed des manches, clan de la session : distances en centimètres.
  const kills = [
    { killerMemberId: 100, weaponName: 'WeapBerylM762_C', headshot: true, distance: 4200 },
    { killerMemberId: 100, weaponName: 'WeapBerylM762_C', headshot: false, distance: 5800 },
    { killerMemberId: 100, weaponName: 'WeapMk14_C', headshot: false, distance: null },
    { killerMemberId: 101, weaponName: 'WeapHK416_C', headshot: false, distance: 1000 },
  ]
  const tournament = {
    id: 'ctour1',
    organizerClanId: 1,
    organizerClan: { id: 1, name: 'FunsNRoses', tag: 'FUN' },
    title: 'L’Observateur des fun',
    description: 'Soirée custom inter-clans',
    startDate: new Date('2026-10-23T18:00:00Z'),
    endDate: new Date('2026-10-23T23:00:00Z'),
    gameMode: null,
    mapName: null,
    rules: { mode: 'inter_clan' },
    status: 'active',
  }
  const directories = {
    clans: { 1: { name: 'FunsNRoses', tag: 'FUN' }, 292: { name: 'Serenity', tag: 'SRTY' }, 3: { name: 'Les Furieux', tag: 'FRX' } },
    members: { 1: { displayName: 'Alpha', clanId: 1 }, 100: { displayName: 'NovakTV', clanId: 292 }, 3: { displayName: 'Charlie', clanId: 3 }, 101: { displayName: 'Menez69', clanId: 292 } },
  }

  it('refuse un identifiant mal formé, un tournoi inconnu ou un brouillon', async () => {
    expect(await run('getTournamentResults', {})).toMatchObject({ error: 'invalid_tournament' })
    expect(await run('getTournamentResults', { tournamentId: 'x y' })).toMatchObject({ error: 'invalid_tournament' })
    mocks.tournamentFindUnique.mockResolvedValue(null)
    expect(await run('getTournamentResults', { tournamentId: 'inconnu' })).toMatchObject({ error: 'tournament_not_found' })
    mocks.tournamentFindUnique.mockResolvedValue({ ...tournament, status: 'draft' })
    expect(await run('getTournamentResults', { tournamentId: 'ctour1' })).toMatchObject({ error: 'tournament_not_found' })
    expect(mocks.getTournamentMatches).not.toHaveBeenCalled()
  })

  it('rend le barème, le classement avec la ligne du clan, les manches et le MVP, comme la page', async () => {
    mocks.tournamentFindUnique.mockResolvedValue(tournament)
    mocks.getTournamentMatches.mockResolvedValue(matches)
    mocks.loadDirectories.mockResolvedValue(directories)
    mocks.killFindMany.mockResolvedValue(kills)

    const result = (await run('getTournamentResults', { tournamentId: 'ctour1' })) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toMatchObject({
      tournamentId: 'ctour1',
      title: 'L’Observateur des fun',
      phase: 'terminé',
      organizer: { tag: 'FUN', name: 'FunsNRoses' },
      rules: { mode: 'Inter-clans', mixedSquadRule: 'partage intégral' },
      roundsCounted: 2,
      participantsRanked: 3,
      mvp: { label: expect.stringContaining('NovakTV'), kills: 7, damage: 1300 },
    })
    expect(result.rules.placementPoints).toHaveProperty('top1')
    expect(result.standings).toHaveLength(3)
    expect(result.standings.map((line: { rank: number }) => line.rank)).toEqual([1, 2, 3])
    expect(result.yourClan).toHaveLength(1)
    expect(result.yourClan[0]).toMatchObject({ label: '[SRTY] Serenity', clanTags: ['SRTY'], kills: 7, wins: 1, roundsPlayed: 2, bestPlacement: 1, yours: true })
    expect(result.standings.filter((line: { yours: boolean }) => line.yours)).toHaveLength(1)

    // Manches dans l'ordre chronologique : la première gagnée par [SRTY], la seconde par [FUN].
    expect(result.rounds.map((round: { round: number; map: string | null; winner: string | null }) => [round.round, round.map, round.winner])).toEqual([
      [1, 'Erangel', '[SRTY] Serenity'],
      [2, 'Miramar', '[FUN] FunsNRoses'],
    ])
    // Rang de la manche aux points et place en jeu : deux champs aux noms distincts.
    expect(result.rounds[0].podium[0]).toMatchObject({ roundRank: 1, label: '[SRTY] Serenity', gamePlacement: 1, kills: 5 })
    expect(result.rounds[0].yourClan).toEqual([expect.objectContaining({ roundRank: 1, gamePlacement: 1, kills: 5 })])
    expect(result.rounds[0].mvp).toEqual({ label: expect.stringContaining('NovakTV'), kills: 5 })
    expect(result.rounds[1].yourClan[0]).toMatchObject({ gamePlacement: 3, kills: 2 })
    expect(JSON.stringify(result.rounds)).not.toMatch(/"rank"|"placement"/)

    // « Mon résultat » : le joueur lui-même, manche par manche, et ses armes ; celles du clan à part.
    expect(mocks.killFindMany).toHaveBeenCalledWith({
      where: { squadMatchId: { in: ['cmB', 'cmA'] }, killerMemberId: { not: null }, killerMember: { clanId: 292 } },
      select: { killerMemberId: true, weaponName: true, headshot: true, distance: true },
    })
    expect(result.you).toEqual({
      player: 'NovakTV',
      roundsPlayed: 2,
      kills: 7,
      damage: 1300,
      avgGamePlacement: 2,
      bestGamePlacement: 1,
      mvpRounds: [1],
      rounds: [
        { round: 1, map: 'Erangel', gamePlacement: 1, kills: 5, damage: 900, mvpOfRound: true },
        { round: 2, map: 'Miramar', gamePlacement: 3, kills: 2, damage: 400 },
      ],
      weapons: [
        { weapon: 'Beryl M762', kills: 2, headshots: 1, avgDistanceM: 50 },
        { weapon: 'Mk14', kills: 1, headshots: 0 },
      ],
      weaponKills: 3,
    })
    expect(result.clanWeapons.map((line: { weapon: string; kills: number }) => [line.weapon, line.kills])).toEqual([['Beryl M762', 2], ['M416', 1], ['Mk14', 1]])
    expect(result.clanWeaponKills).toBe(4)
    expect(result.note).toContain('ne pas confondre')
    // Jamais d'identifiant de compte ni d'adresse dans un résultat d'outil.
    expect(JSON.stringify(result)).not.toMatch(/userId|memberId|@/)
  })

  it('donne la ligne d’un autre membre du clan, et une ligne vide à qui n’a pas joué', async () => {
    mocks.tournamentFindUnique.mockResolvedValue(tournament)
    mocks.getTournamentMatches.mockResolvedValue(matches)
    mocks.loadDirectories.mockResolvedValue(directories)
    mocks.killFindMany.mockResolvedValue(kills)
    mocks.memberFindFirst.mockResolvedValueOnce({ id: 101, displayName: 'Menez69' })
    const other = (await run('getTournamentResults', { tournamentId: 'ctour1', playerName: 'Menez69' })) as { you: Record<string, unknown> }
    expect(other.you).toMatchObject({ player: 'Menez69', roundsPlayed: 1, kills: 0, mvpRounds: [], weapons: [{ weapon: 'M416', kills: 1, headshots: 0, avgDistanceM: 10 }], weaponKills: 1 })

    mocks.memberFindFirst.mockResolvedValueOnce({ id: 102, displayName: 'Kr4ken' })
    const absent = (await run('getTournamentResults', { tournamentId: 'ctour1', playerName: 'Kr4ken' })) as { you: Record<string, unknown> }
    expect(absent.you).toEqual({ player: 'Kr4ken', roundsPlayed: 0, rounds: [], weapons: [], weaponKills: 0 })

    mocks.memberFindFirst.mockResolvedValueOnce(null)
    expect(await run('getTournamentResults', { tournamentId: 'ctour1', playerName: 'Inconnu' })).toMatchObject({ error: 'player_not_found' })
  })
})
