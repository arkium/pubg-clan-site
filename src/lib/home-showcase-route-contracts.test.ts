import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest ne collecte que `src/lib/**` (voir vitest.config.ts) : comme les autres *-route-contracts.test.ts, ce
// fichier vit dans src/lib et importe le handler depuis src/app. Aucune lecture en base : Prisma est simulé.
const mocks = vi.hoisted(() => ({
  clanCount: vi.fn(),
  memberCount: vi.fn(),
  queryRaw: vi.fn(),
  squadMatchFindMany: vi.fn(),
  matchFindMany: vi.fn(),
  killEventFindMany: vi.fn(),
  playerFindMany: vi.fn(),
  telemetryFindMany: vi.fn(),
  telemetryCount: vi.fn(),
  getClanLeague: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: { count: mocks.clanCount },
    clanMember: { count: mocks.memberCount },
    $queryRaw: mocks.queryRaw,
    squadMatch: { findMany: mocks.squadMatchFindMany },
    match: { findMany: mocks.matchFindMany },
    killEvent: { findMany: mocks.killEventFindMany },
    player: { findMany: mocks.playerFindMany },
    squadMatchTelemetry: { findMany: mocks.telemetryFindMany, count: mocks.telemetryCount },
  },
}))

// Hub des clans : la Ligue de la semaine, simulée (son calcul a ses propres tests).
vi.mock('@/lib/clan-league-service', () => ({ getClanLeague: mocks.getClanLeague }))

vi.mock('@/lib/weapon-label-service', () => ({
  getWeaponLabels: async () => ({ WeapKar98k_C: 'Kar98k', WeapM416_C: 'M416' }),
}))

vi.mock('@/lib/map-label-service', () => ({
  getMapLabels: async () => ({ Desert_Main: 'Miramar', Baltic_Main: 'Erangel' }),
}))

import { GET } from '@/app/api/home/showcase/route'
import { CACHE_TTL_MS, getHomeShowcase, resetHomeShowcaseCache } from '@/lib/home-showcase-service'

const ACTIVE = { isActive: true, isSystem: false, archivedAt: null }

function squadMember(memberId: number, clanId: number, tag: string, kills: number, damage: number, clan = ACTIVE) {
  return {
    memberId,
    kills,
    damage,
    revives: 0,
    longestKill: 120 + memberId,
    member: {
      displayName: `Joueur ${memberId}`,
      pubgPlayerName: `pubg${memberId}`,
      clanId,
      clan: { name: `Clan ${tag}`, tag, ...clan },
    },
  }
}

function win(id: string, members: ReturnType<typeof squadMember>[], mapName = 'Desert_Main') {
  return {
    id,
    pubgMatchId: `pubg-${id}`,
    gameMode: 'squad-fpp',
    matchType: 'official',
    mapName,
    createdAt: new Date('2026-09-26T20:00:00Z'),
    totalKills: 12,
    totalDamage: 1834.6,
    members,
  }
}

beforeEach(() => {
  resetHomeShowcaseCache()
  vi.clearAllMocks()
  mocks.clanCount.mockResolvedValue(29)
  mocks.memberCount.mockResolvedValue(399)
  mocks.queryRaw.mockResolvedValue([{ kills: BigInt(7957), wins: BigInt(198) }])
  mocks.telemetryCount.mockResolvedValue(26707)
  mocks.getClanLeague.mockResolvedValue({
    standings: [{ clanId: 10, name: 'Clan SMK', tag: 'SMK', imageUrl: null, rank: 1, powerScore: 1486.4, matches: 44, previousRank: 2 }],
    qualifying: [{ clanId: 20, name: 'Clan FUN', tag: 'FUN', imageUrl: null, matches: 3, required: 5 }],
    withoutMatch: [{ clanId: 30, name: 'Clan ZZZ', tag: 'ZZZ', imageUrl: null }],
  })
  mocks.squadMatchFindMany.mockResolvedValue([
    // Équipe mixte : deux membres SMK, un FUN → rattachée à SMK.
    win('w1', [squadMember(1, 10, 'SMK', 6, 812), squadMember(2, 10, 'SMK', 2, 300), squadMember(3, 20, 'FUN', 4, 590)]),
    // Seuls des joueurs du clan technique : écartée.
    win('w2', [squadMember(4, 99, 'UNG', 5, 500, { isActive: true, isSystem: true, archivedAt: null })]),
    win('w3', [squadMember(5, 20, 'FUN', 3, 400)], 'Baltic_Main'),
  ])
  mocks.matchFindMany.mockResolvedValue([
    { pubgMatchId: 'pubg-w1', duration: 1654 },
    { pubgMatchId: 'pubg-w1', duration: 1654 },
  ])
  mocks.killEventFindMany.mockResolvedValue([
    {
      id: 'k1',
      squadMatchId: 'w1',
      killerAccountId: 'account.one',
      victimAccountId: 'account.outside',
      killerMemberId: 1,
      timestampSeconds: 300,
      matchDate: new Date('2026-09-26T20:00:00Z'),
      weaponName: 'WeapKar98k_C',
      distance: 31_240,
      headshot: true,
      killerMember: { displayName: 'Joueur 1', pubgPlayerName: 'pubg1', clan: { tag: 'SMK', isSystem: false } },
      victimMember: null,
    },
    {
      id: 'k2',
      squadMatchId: 'w1',
      killerAccountId: 'account.three',
      victimAccountId: 'account.tracked',
      killerMemberId: 3,
      timestampSeconds: 400,
      matchDate: new Date('2026-09-26T20:00:00Z'),
      weaponName: 'WeapM416_C',
      distance: 4_800,
      headshot: false,
      killerMember: { displayName: 'Joueur 3', pubgPlayerName: 'pubg3', clan: { tag: 'FUN', isSystem: false } },
      victimMember: { clan: { tag: 'UNG', isSystem: true } },
    },
  ])
  // Instantanés en clair (format d'avant la compression) : decodeTelemetryRow les laisse tels quels.
  mocks.telemetryFindMany.mockResolvedValue([
    {
      squadMatchId: 'w1',
      phaseSnapshots: [
        { isGame: 0.1, numAliveTeams: 29 },
        { isGame: 1, numAliveTeams: 25 },
      ],
      phaseSnapshotsGz: null,
    },
  ])
  mocks.playerFindMany.mockResolvedValue([{ pubgAccountId: 'account.outside', opponentClan: { tag: 'ABC' } }])
})

describe('GET /api/home/showcase', () => {
  it('répond sans session, avec les compteurs, les Top 1 et le kill feed', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.stats).toMatchObject({ clans: 29, players: 399, weekKills: 7957, weekWins: 198 })
    expect(body.stats.isoWeek).toBeGreaterThanOrEqual(1)
    expect(body.dinners.map((dinner: { squadMatchId: string }) => dinner.squadMatchId)).toEqual(['w1', 'w3'])

    const [first] = body.dinners
    expect(first).toMatchObject({
      clanId: 10,
      clanTag: 'SMK',
      mapLabel: 'Miramar',
      mapImage: '/maps/pubg/Desert_Main.webp',
      durationSeconds: 1654,
      teamCount: 29,
      teamMode: 'squad',
      damage: 1835,
      longestKillMeters: 123,
      debriefPath: '/clans/10/telemetry/matches/w1/debrief',
    })
    expect(first.squad[0]).toMatchObject({ memberId: 1, kills: 6, weapons: ['Kar98k'], mvp: true })
    expect(first.squad.filter((member: { mvp: boolean }) => member.mvp)).toHaveLength(1)
    expect(body.dinners[1].durationSeconds).toBeNull()
    // Pas de télémétrie : pas de nombre d'équipes (« #1 » seul).
    expect(body.dinners[1].teamCount).toBeNull()
    // La télémétrie n'est lue que pour les Top 1 affichés.
    expect(mocks.telemetryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { squadMatchId: { in: ['w1', 'w3'] } } })
    )
  })

  it('réduit chaque victime au tag de son clan, jamais à son pseudo ni à son compte', async () => {
    const body = await (await GET()).json()
    const kills = body.killFeed.filter((entry: { kind: string }) => entry.kind === 'kill')
    expect(kills.find((entry: { id: string }) => entry.id === 'k1')).toMatchObject({ victimClanTag: 'ABC', distanceMeters: 312 })
    // Victime suivie, mais du clan technique : pas de tag.
    expect(kills.find((entry: { id: string }) => entry.id === 'k2')).toMatchObject({ victimClanTag: null })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('account.')
    // Le Player n'est interrogé que pour les victimes hors site.
    expect(mocks.playerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pubgAccountId: { in: ['account.outside'] } } })
    )
  })

  it('hub des clans : Ligue de la semaine (Normal), tous les clans suivis, et le compteur de parties analysées', async () => {
    const body = await (await GET()).json()
    expect(mocks.getClanLeague).toHaveBeenCalledWith('week', 'official', expect.any(Date))
    expect(body.stats.analyzedMatches).toBe(26707)
    expect(body.clans.map((clan: { tag: string }) => clan.tag)).toEqual(['SMK', 'FUN', 'ZZZ'])
    expect(body.clans[0]).toMatchObject({
      overviewPath: '/clans/10/overview',
      league: { status: 'ranked', rank: 1, powerScore: 1486, matches: 44, rankDelta: 1 },
    })
  })

  it('une Ligue en échec masque le hub, jamais la vitrine', async () => {
    mocks.getClanLeague.mockRejectedValueOnce(new Error('ligue indisponible'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.clans).toEqual([])
    expect(body.dinners.length).toBeGreaterThan(0)
    errorSpy.mockRestore()
  })

  it('renvoie 500 quand la lecture échoue', async () => {
    mocks.clanCount.mockRejectedValueOnce(new Error('db down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await GET()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal Server Error' })
    errorSpy.mockRestore()
  })
})

describe('home-showcase-service — cache', () => {
  it('ne relit la base qu’une fois par période de cache, appels simultanés compris', async () => {
    const now = Date.UTC(2026, 8, 26, 20)
    await Promise.all([getHomeShowcase(now), getHomeShowcase(now + 1_000)])
    await getHomeShowcase(now + CACHE_TTL_MS - 1)
    expect(mocks.squadMatchFindMany).toHaveBeenCalledTimes(1)

    await getHomeShowcase(now + CACHE_TTL_MS)
    expect(mocks.squadMatchFindMany).toHaveBeenCalledTimes(2)
  })

  it('ne garde pas une lecture en échec', async () => {
    const now = Date.UTC(2026, 8, 26, 20)
    mocks.clanCount.mockRejectedValueOnce(new Error('db down'))
    await expect(getHomeShowcase(now)).rejects.toThrow('db down')
    await expect(getHomeShowcase(now + 1_000)).resolves.toMatchObject({ stats: { clans: 29 } })
  })
})
