import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clanMemberFindMany: vi.fn(),
  matchFindMany: vi.fn(),
  squadMatchFindMany: vi.fn(),
  fetchRecentMatchIdsForPlayers: vi.fn(),
  fetchMatchOverview: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: { findMany: mocks.clanMemberFindMany },
    match: { findMany: mocks.matchFindMany },
    squadMatch: { findMany: mocks.squadMatchFindMany },
  },
}))
vi.mock('@/lib/pubg', () => ({
  fetchRecentMatchIdsForPlayers: mocks.fetchRecentMatchIdsForPlayers,
  fetchMatchOverview: mocks.fetchMatchOverview,
}))

import {
  DISCOVERY_MATCH_READ_LIMIT,
  discoverTournamentRounds,
  pickDiscoveryMembers,
  walkMatchList,
  type MatchMoment,
} from './tournament-round-discovery'

const at = (iso: string) => new Date(iso).getTime()
// Soirée du 23/10/2026 (UTC) : tournoi de 19:50 à 21:40.
const WINDOW = { startAt: at('2026-10-23T19:50:00Z'), endAt: at('2026-10-23T21:40:00Z') }

describe('walkMatchList — liste PUBG d’un joueur, de la plus récente à la plus ancienne', () => {
  it('garde les parties personnalisées de la fenêtre et s’arrête à la première partie antérieure au début', async () => {
    const known = new Map<string, MatchMoment>([
      ['r2', { createdAt: at('2026-10-23T20:12:20Z'), matchType: 'custom' }],
      ['r1', { createdAt: at('2026-10-23T19:53:20Z'), matchType: 'custom' }],
      ['avant', { createdAt: at('2026-10-23T18:56:00Z'), matchType: 'airoyale' }],
    ])
    const read = vi.fn()
    const walk = await walkMatchList(['r2', 'r1', 'avant', 'jamais-lue'], known, WINDOW, read, { remaining: 5 })
    expect(walk).toEqual({ rounds: ['r2', 'r1'], truncated: false })
    expect(read).not.toHaveBeenCalled()
  })

  it('ne lit pas une partie inconnue plus récente que la fenêtre (une partie connue plus ancienne est encore après la fin)', async () => {
    const known = new Map<string, MatchMoment>([
      ['apres-fin', { createdAt: at('2026-10-23T21:44:36Z'), matchType: 'custom' }],
      ['r4', { createdAt: at('2026-10-23T21:11:44Z'), matchType: 'custom' }],
    ])
    const read = vi.fn()
    const walk = await walkMatchList(['ce-matin', 'apres-fin', 'r4'], known, WINDOW, read, { remaining: 5 })
    expect(read).not.toHaveBeenCalled()
    expect(walk.rounds).toEqual(['r4'])
  })

  it('lit les parties inconnues du haut de liste, retient la manche, ignore une partie publique, s’arrête avant le début', async () => {
    const moments: Record<string, MatchMoment> = {
      r3: { createdAt: at('2026-10-23T20:41:27Z'), matchType: 'custom' },
      publique: { createdAt: at('2026-10-23T20:00:00Z'), matchType: 'official' },
      avant: { createdAt: at('2026-10-23T19:00:00Z'), matchType: 'official' },
    }
    const read = vi.fn(async (matchId: string) => moments[matchId] ?? null)
    const known = new Map<string, MatchMoment>()
    const walk = await walkMatchList(['r3', 'publique', 'avant', 'plus-vieille'], known, WINDOW, read, { remaining: 10 })
    expect(walk.rounds).toEqual(['r3'])
    expect(read.mock.calls.map(([matchId]) => matchId)).toEqual(['r3', 'publique', 'avant'])
    // Les lectures complètent `known` : un autre joueur de la même partie ne la relira pas.
    expect(known.get('r3')).toEqual(moments.r3)
  })

  it('budget épuisé : s’arrête et le signale, la synchronisation suivante reprendra', async () => {
    const read = vi.fn(async () => ({ createdAt: at('2026-10-23T21:00:00Z'), matchType: 'custom' }))
    const budget = { remaining: 2 }
    const walk = await walkMatchList(['a', 'b', 'c'], new Map(), WINDOW, read, budget)
    expect(walk).toEqual({ rounds: ['a', 'b'], truncated: true })
    expect(budget.remaining).toBe(0)
  })

  it('une partie illisible est sautée', async () => {
    const read = vi.fn(async (matchId: string) => (matchId === 'r1' ? { createdAt: at('2026-10-23T19:53:20Z'), matchType: 'custom' } : null))
    const walk = await walkMatchList(['illisible', 'r1'], new Map(), WINDOW, read, { remaining: 5 })
    expect(walk.rounds).toEqual(['r1'])
  })
})

describe('pickDiscoveryMembers', () => {
  const member = (id: number, lastMatchAt: string | null) => ({
    id,
    pubgAccountId: `account.${id}`,
    platformShard: 'steam',
    lastMatchAt: lastMatchAt ? new Date(lastMatchAt) : null,
  })

  it('celui qui clique, puis ceux déjà vus dans une manche, puis les plus récemment actifs, dans la limite', () => {
    const members = [member(1, '2026-10-01T00:00:00Z'), member(2, null), member(3, '2026-10-23T21:00:00Z'), member(4, '2026-10-20T00:00:00Z'), member(5, '2026-10-22T00:00:00Z')]
    const picked = pickDiscoveryMembers(members, { actorMemberId: 2, roundMemberIds: new Set([1]) }, 4)
    expect(picked.map((entry) => entry.id)).toEqual([2, 1, 3, 5])
  })
})

describe('discoverTournamentRounds — l’organisateur observateur (tournoi FUN du 23/10/2026)', () => {
  const KUSAKI = { id: 493, pubgAccountId: 'account.kusaki', platformShard: 'steam', lastMatchAt: new Date('2026-10-23T18:56:00Z') }
  const CHRIS = { id: 600, pubgAccountId: 'account.chris', platformShard: 'steam', lastMatchAt: new Date('2026-10-22T22:00:00Z') }
  const MOMENTS: Record<string, MatchMoment> = {
    r1: { createdAt: at('2026-10-23T19:53:20Z'), matchType: 'custom' },
    r2: { createdAt: at('2026-10-23T20:12:20Z'), matchType: 'custom' },
    airoyale: { createdAt: at('2026-10-23T18:56:00Z'), matchType: 'airoyale' },
    hier: { createdAt: at('2026-10-22T21:00:00Z'), matchType: 'official' },
  }

  beforeEach(() => {
    ;(globalThis as { tournamentMatchMoments?: unknown }).tournamentMatchMoments = undefined
    mocks.clanMemberFindMany.mockReset().mockResolvedValue([KUSAKI, CHRIS])
    // En base : les parties d'hier soir et d'avant le tournoi ; les manches de ce soir ne sont pas encore importées.
    mocks.matchFindMany.mockReset().mockResolvedValue([
      { pubgMatchId: 'airoyale', pubgCreatedAt: new Date(MOMENTS.airoyale.createdAt), matchType: 'airoyale' },
      { pubgMatchId: 'hier', pubgCreatedAt: new Date(MOMENTS.hier.createdAt), matchType: 'official' },
    ])
    mocks.squadMatchFindMany.mockReset().mockResolvedValue([])
    // PUBG : la manche 1 n'est pas dans la liste de Kusaki_, observateur ; elle est dans celle de Chris.
    mocks.fetchRecentMatchIdsForPlayers.mockReset().mockResolvedValue(
      new Map([
        ['account.kusaki', ['r2', 'airoyale', 'hier']],
        ['account.chris', ['r2', 'r1', 'hier']],
      ])
    )
    mocks.fetchMatchOverview.mockReset().mockImplementation(async (matchId: string) => ({
      createdAt: new Date(MOMENTS[matchId].createdAt).toISOString(),
      matchType: MOMENTS[matchId].matchType,
    }))
  })

  const input = {
    organizerClanId: 16,
    startAt: new Date('2026-10-23T19:50:00Z'),
    endAt: new Date('2026-10-23T21:40:00Z'),
    actorMemberId: 493,
    roundMemberIds: new Set<number>(),
    now: new Date('2026-10-23T20:35:00Z'),
  }

  it('retrouve la manche 1 par un coéquipier du clan, en ne lisant chaque partie inconnue qu’une fois', async () => {
    const discovery = await discoverTournamentRounds(input)
    expect(discovery.rounds).toEqual([
      { pubgMatchId: 'r2', shard: 'steam' },
      { pubgMatchId: 'r1', shard: 'steam' },
    ])
    expect(discovery.membersRead).toBe(2)
    // r2 (commune aux deux listes) et r1 : deux lectures, jamais l'Air Royale ni la partie d'hier, connues en base.
    expect(mocks.fetchMatchOverview.mock.calls.map(([matchId]) => matchId)).toEqual(['r2', 'r1'])
    expect(discovery.matchesRead).toBe(2)
    // Les listes des joueurs se lisent groupées, avec l'origine de l'appel pour le journal PUBG.
    expect(mocks.fetchRecentMatchIdsForPlayers).toHaveBeenCalledWith(['account.kusaki', 'account.chris'], 'steam', {
      clanId: 16,
      source: 'tournament-sync',
      priority: 'high',
    })
  })

  it('d’une synchronisation à l’autre, une partie déjà lue ne l’est plus (relance automatique)', async () => {
    await discoverTournamentRounds(input)
    mocks.fetchMatchOverview.mockClear()
    const again = await discoverTournamentRounds(input)
    expect(again.rounds).toHaveLength(2)
    expect(mocks.fetchMatchOverview).not.toHaveBeenCalled()
  })

  it('avant le début ou plus de 14 jours après la fin : aucun appel PUBG', async () => {
    await discoverTournamentRounds({ ...input, now: new Date('2026-10-23T19:00:00Z') })
    await discoverTournamentRounds({ ...input, now: new Date('2026-11-08T00:00:00Z') })
    expect(mocks.clanMemberFindMany).not.toHaveBeenCalled()
    expect(mocks.fetchRecentMatchIdsForPlayers).not.toHaveBeenCalled()
  })

  it('les lectures sont plafonnées par synchronisation : la suivante reprend', async () => {
    const many = Array.from({ length: DISCOVERY_MATCH_READ_LIMIT + 3 }, (_, index) => `m${index}`)
    mocks.fetchRecentMatchIdsForPlayers.mockResolvedValue(new Map([['account.kusaki', many]]))
    mocks.fetchMatchOverview.mockImplementation(async () => ({ createdAt: '2026-10-23T21:00:00Z', matchType: 'custom' }))
    const discovery = await discoverTournamentRounds(input)
    expect(discovery.matchesRead).toBe(DISCOVERY_MATCH_READ_LIMIT)
    expect(discovery.truncated).toBe(true)
  })
})
