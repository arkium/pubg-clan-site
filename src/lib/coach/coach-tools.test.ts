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
  loadDebrief: vi.fn(),
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
  },
}))
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

import { COACH_TOOL_DECLARATIONS, createCoachTools } from '@/lib/coach/coach-tools'

const scope = { clanId: 292, memberId: 100, memberName: 'NovakTV' }
const tools = createCoachTools(scope)
const run = (name: string, args: Record<string, unknown> = {}) => tools.run({ name, args })

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
})

describe('déclarations', () => {
  it('expose les cinq outils sans jamais laisser le modèle choisir le clan ou le compte', () => {
    expect(COACH_TOOL_DECLARATIONS.map((tool) => tool.name)).toEqual(['getRecentMatches', 'getMatchDebrief', 'getWeaponStats', 'getOpponentRecord', 'getDropZones'])
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
