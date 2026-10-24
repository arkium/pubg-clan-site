import { beforeEach, describe, expect, it, vi } from 'vitest'

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
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    squadMatch: { findMany: mocks.squadMatchFindMany },
    clanMember: { findFirst: mocks.memberFindFirst },
    memberWeaponStats: { findMany: mocks.weaponsFindMany },
    opponentClan: { findFirst: mocks.opponentFindFirst },
    killEvent: { count: mocks.killCount, groupBy: mocks.killGroupBy, findMany: mocks.killFindMany },
    clanEncounter: { aggregate: mocks.encounterAggregate },
    dropPressureStat: { findMany: mocks.dropFindMany },
    playerStats: { findMany: mocks.statsFindMany },
    tournament: { findUnique: mocks.tournamentFindUnique },
  },
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

import { COACH_TOOL_DECLARATIONS, createCoachTools, resetCoachLeagueCache } from '@/lib/coach/coach-tools'

const scope = { clanId: 292, memberId: 100, memberName: 'NovakTV' }
const tools = createCoachTools(scope)
const run = (name: string, args: Record<string, unknown> = {}) => tools.run({ name, args })

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  resetCoachLeagueCache()
})

describe('déclarations', () => {
  it('expose les neuf outils sans jamais laisser le modèle choisir le clan ou le compte', () => {
    expect(COACH_TOOL_DECLARATIONS.map((tool) => tool.name)).toEqual([
      'getRecentMatches',
      'getMatchDebrief',
      'getWeaponStats',
      'getOpponentRecord',
      'getDropZones',
      'getClanLeaderboard',
      'getLeagueStanding',
      'getTournaments',
      'getTournamentResults',
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

  it('lit les parties du clan de la fermeture, bornées, par soirée de jeu', async () => {
    mocks.squadMatchFindMany.mockResolvedValue([match])
    const result = (await run('getRecentMatches', { limit: 50 })) as { matches: Array<Record<string, unknown>> }
    const query = mocks.squadMatchFindMany.mock.calls[0][0]
    expect(query.where).toEqual({ members: { some: { member: { clanId: 292 } } } })
    expect(query.take).toBe(10)
    // 01:30 à Paris le 23 : c'est encore la soirée du 22.
    expect(result.matches[0]).toMatchObject({ matchId: 'cmatch1', map: 'Erangel', session: '2026-10-22', placement: 3, squadKills: 18, squadDamage: 2846, squad: ['NovakTV', 'Menez69'], telemetryAnalyzed: true })
  })

  it('filtre par carte d’après son nom affiché, et refuse une carte inconnue', async () => {
    mocks.squadMatchFindMany.mockResolvedValue([])
    await run('getRecentMatches', { mapName: 'erangel' })
    expect(mocks.squadMatchFindMany.mock.calls[0][0].where.mapName).toEqual({ in: ['Baltic_Main'] })
    expect(mocks.squadMatchFindMany.mock.calls[0][0].take).toBe(5)
    expect(await run('getRecentMatches', { mapName: 'Mars' })).toMatchObject({ error: 'map_not_found' })
    expect(mocks.squadMatchFindMany).toHaveBeenCalledTimes(1)
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
  it('rattache chaque partie à sa ville et mesure ce qu’elle rapporte', async () => {
    // Erangel fait 819 200 cm de côté : 409 600 = 50 %, au centre de Pochinki.
    mocks.dropFindMany.mockResolvedValue([
      { squadMatchId: 'm1', mapName: 'Baltic_Main', x: 409600, y: 409600, nearbyPlayerCount250m: 12, pressureLevel: 'hot', squadMatch: { placement: 1 } },
      { squadMatchId: 'm1', mapName: 'Baltic_Main', x: 410000, y: 409000, nearbyPlayerCount250m: 12, pressureLevel: 'hot', squadMatch: { placement: 1 } },
      { squadMatchId: 'm2', mapName: 'Baltic_Main', x: 409600, y: 409600, nearbyPlayerCount250m: 4, pressureLevel: 'calm', squadMatch: { placement: 14 } },
      { squadMatchId: 'm3', mapName: 'Baltic_Main', x: 100, y: 100, nearbyPlayerCount250m: 0, pressureLevel: 'calm', squadMatch: { placement: 7 } },
    ])
    const result = await run('getDropZones', { mapName: 'Erangel' })
    const where = mocks.dropFindMany.mock.calls[0][0].where
    expect(where.member).toEqual({ clanId: 292 })
    expect(where.mapName).toEqual({ in: ['Baltic_Main'] })
    expect(result).toEqual({
      map: 'Erangel',
      days: 90,
      matches: 3,
      zones: [
        { zone: 'Pochinki', landings: 2, avgNearbyPlayers250m: 8, hotDropPercent: 50, avgPlacement: 7.5, top10Percent: 50, winPercent: 50 },
        { zone: 'Hors ville', landings: 1, avgNearbyPlayers250m: 0, hotDropPercent: 0, avgPlacement: 7, top10Percent: 100, winPercent: 0 },
      ],
      zonesTruncated: false,
    })
  })

  it('exige une carte connue', async () => {
    expect(await run('getDropZones', {})).toMatchObject({ error: 'map_not_found' })
    expect(mocks.dropFindMany).not.toHaveBeenCalled()
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
  // Deux manches : [SRTY] gagne la première, [FUN] la seconde ; NovakTV finit MVP aux dégâts (kills à égalité).
  const matches = [
    { id: 'cmB', createdAt: new Date('2026-10-23T21:00:00Z'), mapName: 'Desert_Main', gameMode: 'squad', placement: 1, members: [row(1, 1, 'Alpha', 1, 4, 500), row(2, 292, 'NovakTV', 3, 2, 400), row(3, 3, 'Charlie', 2, 2, 300)] },
    { id: 'cmA', createdAt: new Date('2026-10-23T20:00:00Z'), mapName: 'Baltic_Main', gameMode: 'squad', placement: 2, members: [row(1, 1, 'Alpha', 2, 3, 350), row(2, 292, 'NovakTV', 1, 5, 900), row(3, 3, 'Charlie', 4, 1, 100)] },
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
    members: { 1: { displayName: 'Alpha', clanId: 1 }, 2: { displayName: 'NovakTV', clanId: 292 }, 3: { displayName: 'Charlie', clanId: 3 } },
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
    expect(result.rounds[0].podium[0]).toMatchObject({ rank: 1, label: '[SRTY] Serenity', placement: 1, kills: 5 })
    expect(result.rounds[0].yourClan).toEqual([expect.objectContaining({ rank: 1, placement: 1, kills: 5 })])
    expect(result.rounds[0].mvp).toEqual({ label: expect.stringContaining('NovakTV'), kills: 5 })
    expect(result.rounds[1].yourClan[0]).toMatchObject({ placement: 3, kills: 2 })
    // Jamais d'identifiant de compte ni d'adresse dans un résultat d'outil.
    expect(JSON.stringify(result)).not.toMatch(/userId|memberId|@/)
  })
})
