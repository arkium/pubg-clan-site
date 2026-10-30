import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Synchronisation des parties d'un clan (docs/TODO/synchro-parties-30-min.md) : parties récentes lues par lots de 10
 * joueurs et par shard, en priorité haute — plus aucun `players/{id}` ni `seasons/lifetime` par membre — et un détail
 * de partie lu une fois par passage. Prisma et l'API PUBG sont simulés : aucun accès à la base ni à PUBG.
 */

const mocks = vi.hoisted(() => ({
  clanFindUnique: vi.fn(),
  clanUpdate: vi.fn(),
  memberFindUnique: vi.fn(),
  memberFindFirst: vi.fn(),
  memberFindMany: vi.fn(),
  memberUpdate: vi.fn(),
  matchFindMany: vi.fn(),
  matchUpsert: vi.fn(),
  fetchRecentMatchIdsForPlayers: vi.fn(),
  fetchMatchDetails: vi.fn(),
  fetchRecentMatchIds: vi.fn(),
  fetchAllRecentMatchIds: vi.fn(),
  searchPlayerByName: vi.fn(),
  analyzeMatchForSquads: vi.fn(),
  captureEncounteredPlayers: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: { findUnique: mocks.clanFindUnique, update: mocks.clanUpdate },
    clanMember: { findUnique: mocks.memberFindUnique, findFirst: mocks.memberFindFirst, findMany: mocks.memberFindMany, update: mocks.memberUpdate },
    match: { findMany: mocks.matchFindMany, upsert: mocks.matchUpsert },
  },
}))
vi.mock('@/lib/pubg', () => ({
  fetchRecentMatchIdsForPlayers: mocks.fetchRecentMatchIdsForPlayers,
  fetchMatchDetails: mocks.fetchMatchDetails,
  fetchRecentMatchIds: mocks.fetchRecentMatchIds,
  fetchAllRecentMatchIds: mocks.fetchAllRecentMatchIds,
  searchPlayerByName: mocks.searchPlayerByName,
}))
vi.mock('@/lib/squad-detector', () => ({ analyzeMatchForSquads: mocks.analyzeMatchForSquads }))
vi.mock('@/lib/encountered-players', () => ({ captureEncounteredPlayers: mocks.captureEncounteredPlayers, countBotsInMatch: () => 0 }))

import { importMatchesForMember, syncClanMatches } from './matches-sync-service'

const member = (id: number, shard = 'steam') => ({
  id,
  displayName: `Joueur ${id}`,
  pubgPlayerName: `joueur${id}`,
  pubgAccountId: `account.${id}`,
  platformShard: shard,
  isActive: true,
})

const details = (matchId: string) => ({
  id: matchId,
  gameMode: 'squad-fpp',
  matchType: 'official',
  mapName: 'Baltic_Main',
  createdAt: '2026-10-27T18:00:00Z',
  durationSeconds: 1800,
  rosters: [],
  stats: { kills: 2, knockouts: 1, assists: 0, damageDealt: 210, headshotKills: 0, revives: 0, position: 1 },
})

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.matchFindMany.mockResolvedValue([])
  mocks.matchUpsert.mockResolvedValue({})
  mocks.memberFindUnique.mockResolvedValue({ lastMatchAt: null })
  mocks.memberFindFirst.mockResolvedValue(null)
  mocks.memberUpdate.mockResolvedValue({})
  mocks.analyzeMatchForSquads.mockResolvedValue(null)
  mocks.captureEncounteredPlayers.mockResolvedValue(undefined)
  mocks.fetchMatchDetails.mockImplementation(async (matchId: string) => details(matchId))
})

describe('syncClanMatches — lecture groupée des parties récentes', () => {
  it('un appel pour 10 membres, par shard, en priorité haute ; plus de players/{id} ni de seasons/lifetime', async () => {
    const steam = Array.from({ length: 23 }, (_, index) => member(index + 1))
    const kakao = [member(101, 'kakao'), member(102, 'kakao')]
    mocks.clanFindUnique.mockResolvedValue({ id: 7, name: 'Clan', members: [...steam, ...kakao] })
    mocks.fetchRecentMatchIdsForPlayers.mockImplementation(async (accountIds: string[]) => new Map(accountIds.map((accountId) => [accountId, []])))

    const result = await syncClanMatches(7)

    expect(mocks.fetchRecentMatchIdsForPlayers.mock.calls.map(([accountIds, shard]) => [accountIds.length, shard])).toEqual([
      [10, 'steam'],
      [10, 'steam'],
      [3, 'steam'],
      [2, 'kakao'],
    ])
    for (const [, , context] of mocks.fetchRecentMatchIdsForPlayers.mock.calls) {
      expect(context).toEqual({ clanId: 7, source: 'clan-match-sync', priority: 'high' })
    }
    expect(mocks.fetchRecentMatchIds).not.toHaveBeenCalled()
    expect(mocks.fetchAllRecentMatchIds).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'success', membersProcessed: 25, importedCount: 0 })
  })

  it('importe les seules parties nouvelles, un même cache de détails pour tous les membres du passage', async () => {
    mocks.clanFindUnique.mockResolvedValue({ id: 7, name: 'Clan', members: [member(1), member(2)] })
    mocks.fetchRecentMatchIdsForPlayers.mockResolvedValue(
      new Map([
        ['account.1', ['shared', 'old']],
        ['account.2', ['shared']],
      ])
    )
    mocks.matchFindMany.mockImplementation(async ({ where }: { where: { memberId: number } }) =>
      where.memberId === 1 ? [{ pubgMatchId: 'old' }] : []
    )

    const result = await syncClanMatches(7)

    expect(mocks.fetchMatchDetails.mock.calls.map(([matchId, playerId]) => [matchId, playerId])).toEqual([
      ['shared', 'account.1'],
      ['shared', 'account.2'],
    ])
    const [firstCache, secondCache] = mocks.fetchMatchDetails.mock.calls.map((call) => call[4])
    expect(firstCache).toBeInstanceOf(Map)
    expect(secondCache).toBe(firstCache)
    expect(mocks.fetchMatchDetails.mock.calls[0][3]).toEqual({ clanId: 7, memberId: 1, source: 'clan-match-sync' })
    expect(mocks.matchUpsert).toHaveBeenCalledTimes(2)
    expect(mocks.analyzeMatchForSquads).toHaveBeenCalledTimes(2)
    // Les joueurs croisés d'une partie ne se relisent qu'une fois.
    expect(mocks.captureEncounteredPlayers).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ status: 'success', importedCount: 2 })
  })

  it('un membre absent de la réponse PUBG ou un lot en échec : erreur pour ses seuls membres, les autres importés', async () => {
    const members = Array.from({ length: 12 }, (_, index) => member(index + 1))
    mocks.clanFindUnique.mockResolvedValue({ id: 7, name: 'Clan', members })
    mocks.fetchRecentMatchIdsForPlayers
      .mockResolvedValueOnce(new Map(members.slice(0, 9).map((entry) => [entry.pubgAccountId, [`m${entry.id}`]])))
      .mockRejectedValueOnce(new Error('[PUBG] API request failed (500)'))

    const result = await syncClanMatches(7)

    expect(result.status).toBe('partial')
    expect(result.errors).toEqual([
      'Member Joueur 10: absent de la réponse PUBG (compte introuvable)',
      'Member Joueur 11: failed to fetch match IDs — [PUBG] API request failed (500)',
      'Member Joueur 12: failed to fetch match IDs — [PUBG] API request failed (500)',
    ])
    expect(result.importedCount).toBe(9)
  })

  it('résout d’abord le compte PUBG d’un membre qui n’en a pas, puis le lit avec les autres', async () => {
    mocks.clanFindUnique.mockResolvedValue({ id: 7, name: 'Clan', members: [{ ...member(1), pubgAccountId: null }, member(2)] })
    mocks.searchPlayerByName.mockResolvedValue({ accountId: 'account.found' })
    mocks.fetchRecentMatchIdsForPlayers.mockResolvedValue(new Map([['account.found', []], ['account.2', []]]))

    await syncClanMatches(7)

    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: 1 }, data: { pubgAccountId: 'account.found' } })
    expect(mocks.fetchRecentMatchIdsForPlayers).toHaveBeenCalledWith(['account.found', 'account.2'], 'steam', expect.anything())
  })
})

describe('syncClanMatches — fraîcheur des parties (docs/TODO/fraicheur-des-parties.md)', () => {
  const NOW = new Date('2026-10-30T20:00:00Z')
  // Partie commencée `startedMinutesAgo` avant maintenant, de 30 min : sa fin est 30 min plus tard.
  const playedAgo = (matchId: string, startedMinutesAgo: number) => ({
    ...details(matchId),
    createdAt: new Date(NOW.getTime() - startedMinutesAgo * 60_000).toISOString(),
  })
  const httpError = (status: number) => Object.assign(new Error(`[PUBG] API request failed (${status}) GET /shards/steam/matches/x`), { status })

  function tracker(retry: Record<number, string[]> = {}) {
    return {
      retryIds: vi.fn((memberId: number) => retry[memberId] ?? []),
      failed: vi.fn(),
      imported: vi.fn(),
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rend le délai depuis la fin de chaque partie nouvelle, une fois par partie (le plus petit), rattrapages à part', async () => {
    mocks.clanFindUnique.mockResolvedValue({ id: 7, name: 'Clan', members: [member(1), member(2)] })
    mocks.fetchRecentMatchIdsForPlayers.mockResolvedValue(
      new Map([
        ['account.1', ['recente', 'ancienne']],
        ['account.2', ['recente']],
      ])
    )
    const played: Record<string, number> = { recente: 45, ancienne: 3 * 24 * 60 }
    mocks.fetchMatchDetails.mockImplementation(async (matchId: string) => playedAgo(matchId, played[matchId]))

    const result = await syncClanMatches(7)

    // Partie de 30 min commencée il y a 45 min : finie il y a 15 min, comptée une fois pour ses deux membres.
    expect(result.newMatchDelaysMinutes).toEqual([15])
    expect(result.catchUpMatches).toBe(1)
  })

  it('confie une lecture en échec aux parties en attente, avec son code, et signale chaque import', async () => {
    mocks.clanFindUnique.mockResolvedValue({ id: 7, name: 'Clan', members: [member(1)] })
    mocks.fetchRecentMatchIdsForPlayers.mockResolvedValue(new Map([['account.1', ['publiee', 'pas-encore', 'incident']]]))
    mocks.fetchMatchDetails.mockImplementation(async (matchId: string) => {
      if (matchId === 'pas-encore') throw httpError(404)
      if (matchId === 'incident') throw httpError(502)
      return playedAgo(matchId, 40)
    })
    const pending = tracker()

    const result = await syncClanMatches(7, { pending })

    expect(pending.failed.mock.calls.map(([failure]) => failure)).toEqual([
      { matchId: 'pas-encore', clanId: 7, memberId: 1, status: 404 },
      { matchId: 'incident', clanId: 7, memberId: 1, status: 502 },
    ])
    expect(pending.imported).toHaveBeenCalledWith(1, 'publiee')
    expect(result.skippedCount).toBe(1) // la 404 reste une partie sautée, pas une erreur
    expect(result.errorsCount).toBe(1)
  })

  it('retente au tour suivant une partie en attente que PUBG ne liste plus ; sort celle déjà importée ailleurs', async () => {
    mocks.clanFindUnique.mockResolvedValue({ id: 7, name: 'Clan', members: [member(1)] })
    mocks.fetchRecentMatchIdsForPlayers.mockResolvedValue(new Map([['account.1', []]]))
    mocks.matchFindMany.mockResolvedValue([{ pubgMatchId: 'deja-importee' }])
    mocks.fetchMatchDetails.mockImplementation(async (matchId: string) => playedAgo(matchId, 60))
    const pending = tracker({ 1: ['en-attente', 'deja-importee'] })

    const result = await syncClanMatches(7, { pending })

    expect(mocks.fetchMatchDetails.mock.calls.map(([matchId]) => matchId)).toEqual(['en-attente'])
    expect(pending.imported.mock.calls).toEqual([
      [1, 'deja-importee'],
      [1, 'en-attente'],
    ])
    expect(result.importedCount).toBe(1)
  })

  it('le rattrapage de la carrière journalise son origine propre et ne touche pas aux parties en attente', async () => {
    mocks.matchFindMany.mockResolvedValue([])
    mocks.memberFindMany.mockResolvedValue([{ pubgAccountId: 'account.1' }])
    await importMatchesForMember({
      clanId: 7,
      member: { id: 1, displayName: 'Joueur 1', platformShard: 'steam', pubgAccountId: 'account.1' },
      matchIds: ['b'],
    })
    expect(mocks.fetchMatchDetails.mock.calls[0][3]).toEqual({ clanId: 7, memberId: 1, source: 'clan-lifetime-catchup' })
  })
})

describe('importMatchesForMember — rattrapage par la carrière', () => {
  const input = { clanId: 7, member: { id: 1, displayName: 'Joueur 1', platformShard: 'steam', pubgAccountId: 'account.1' }, matchIds: ['a', 'b'] }

  it('rien de nouveau : une seule lecture de la base, aucun appel PUBG', async () => {
    mocks.matchFindMany.mockResolvedValue([{ pubgMatchId: 'a' }, { pubgMatchId: 'b' }])
    await expect(importMatchesForMember(input)).resolves.toEqual({ importedCount: 0, errors: [] })
    expect(mocks.matchFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.memberFindMany).not.toHaveBeenCalled()
    expect(mocks.fetchMatchDetails).not.toHaveBeenCalled()
  })

  it('importe la partie que seule la carrière connaît', async () => {
    mocks.matchFindMany.mockResolvedValue([{ pubgMatchId: 'a' }])
    mocks.memberFindMany.mockResolvedValue([{ pubgAccountId: 'account.1' }])
    await expect(importMatchesForMember(input)).resolves.toEqual({ importedCount: 1, errors: [] })
    expect(mocks.fetchMatchDetails.mock.calls.map(([matchId]) => matchId)).toEqual(['b'])
  })
})
