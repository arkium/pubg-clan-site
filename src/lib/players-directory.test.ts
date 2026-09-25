import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Annuaire des joueurs — logique de src/lib/players-directory.ts.
 * Matrice de tests : docs/TODO/players.md §9.B. Les routes sont couvertes par
 * players-directory-route-contracts.test.ts.
 */

// Les mocks Prisma listent les modèles un par un : tout modèle utilisé par le code testé
// doit apparaître ici, sinon l'appel renvoie `undefined` loin de la cause réelle.
const mocks = vi.hoisted(() => ({
  clanMemberFindMany: vi.fn(),
  playerFindMany: vi.fn(),
  playerCount: vi.fn(),
  clanFindMany: vi.fn(),
  clanEncounterFindMany: vi.fn(),
  clanEncounterGroupBy: vi.fn(),
  playerClanChangeFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: { findMany: mocks.clanMemberFindMany },
    player: { findMany: mocks.playerFindMany, count: mocks.playerCount },
    clan: { findMany: mocks.clanFindMany },
    clanEncounter: { findMany: mocks.clanEncounterFindMany, groupBy: mocks.clanEncounterGroupBy },
    playerClanChange: { findMany: mocks.playerClanChangeFindMany },
  },
}))

import {
  PLAYER_DIRECTORY_ENCOUNTER_SORT_MAX_CANDIDATES,
  SOLO_PLAYER_WHERE,
  buildMemberIndex,
  buildNameFilter,
  buildPlayersWhere,
  buildPubgLookupUrl,
  classifyMember,
  escapeLikePattern,
  listPlayersDirectory,
  parsePlayersDirectoryQuery,
  sortPlayerIdsByEncounters,
  summarizeEncounters,
  toDirectoryRow,
  type DirectoryMember,
  type DirectoryPlayer,
  type PlayersDirectoryQuery,
} from '@/lib/players-directory'

const SMK = { id: 7, tag: 'SMK', name: 'Smoke', isActive: true, isSystem: false }
const BEE = { id: 8, tag: 'BEE', name: 'Killer Bees', isActive: true, isSystem: false }
const UNG = { id: 1, tag: 'UNG', name: 'Ungrouped', isActive: true, isSystem: true }

function member(overrides: Partial<DirectoryMember> = {}): DirectoryMember {
  return {
    id: 11,
    displayName: 'Lord_Kromb',
    pubgPlayerName: 'Lord_Kromb',
    pubgAccountId: 'account.lord',
    platformShard: 'steam',
    playerId: 'player-lord',
    isActive: true,
    joinStatus: 'active',
    archivedReason: null,
    clan: SMK,
    ...overrides,
  }
}

function player(overrides: Partial<DirectoryPlayer> = {}): DirectoryPlayer {
  return {
    id: 'player-lord',
    pubgAccountId: 'account.lord',
    platformShard: 'steam',
    pubgPlayerName: 'Lord_Kromb',
    isFavorite: false,
    firstSeenAt: new Date('2026-09-01T00:00:00.000Z'),
    lastSeenAt: new Date('2026-09-25T10:00:00.000Z'),
    clanResolvedAt: new Date('2026-09-24T00:00:00.000Z'),
    opponentClan: { id: 'opp-smk', tag: 'SMK', name: 'Smoke' },
    ...overrides,
  }
}

function query(overrides: Partial<PlayersDirectoryQuery> = {}): PlayersDirectoryQuery {
  return {
    status: 'all',
    q: '',
    seenByClanId: null,
    page: 1,
    pageSize: 25,
    sortBy: 'lastSeenAt',
    sortOrder: 'desc',
    ...overrides,
  }
}

describe('parsePlayersDirectoryQuery', () => {
  it('applique les valeurs par défaut', () => {
    expect(parsePlayersDirectoryQuery(new URLSearchParams())).toEqual({
      status: 'all',
      q: '',
      seenByClanId: null,
      page: 1,
      pageSize: 25,
      sortBy: 'lastSeenAt',
      sortOrder: 'desc',
    })
  })

  it('retombe sur les défauts pour des paramètres invalides', () => {
    const parsed = parsePlayersDirectoryQuery(
      new URLSearchParams('status=bogus&page=-2&pageSize=abc&sortBy=kills&sortOrder=up&seenByClanId=1.5')
    )
    expect(parsed).toMatchObject({
      status: 'all',
      page: 1,
      pageSize: 25,
      sortBy: 'lastSeenAt',
      sortOrder: 'desc',
      seenByClanId: null,
    })
  })

  it('plafonne pageSize à 100', () => {
    expect(parsePlayersDirectoryQuery(new URLSearchParams('pageSize=5000')).pageSize).toBe(100)
  })

  it('trie les pseudos par ordre alphabétique par défaut', () => {
    expect(parsePlayersDirectoryQuery(new URLSearchParams('sortBy=pubgPlayerName')).sortOrder).toBe('asc')
    expect(parsePlayersDirectoryQuery(new URLSearchParams('sortBy=totalEncounters')).sortOrder).toBe('desc')
  })

  it('nettoie et tronque la recherche', () => {
    const long = 'x'.repeat(200)
    expect(parsePlayersDirectoryQuery(new URLSearchParams({ q: '  lord  ' })).q).toBe('lord')
    expect(parsePlayersDirectoryQuery(new URLSearchParams({ q: long })).q).toHaveLength(64)
  })
})

describe('recherche par pseudo', () => {
  it('cherche par préfixe par défaut', () => {
    expect(buildNameFilter('lord')).toEqual({ startsWith: 'lord' })
  })

  it('cherche une sous-chaîne quand la saisie commence par * ou %', () => {
    expect(buildNameFilter('*kromb')).toEqual({ contains: 'kromb' })
    expect(buildNameFilter('%kromb')).toEqual({ contains: 'kromb' })
  })

  it('échappe _ et % : Lord_Kromb ne doit pas trouver LordXKromb', () => {
    expect(buildNameFilter('Lord_Kromb')).toEqual({ startsWith: 'Lord\\_Kromb' })
    expect(buildNameFilter('*100%')).toEqual({ contains: '100\\%' })
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
  })

  it('ignore une saisie vide ou réduite au joker', () => {
    expect(buildNameFilter('   ')).toBeNull()
    expect(buildNameFilter('*')).toBeNull()
  })
})

describe('classifyMember', () => {
  it.each([
    ['membre actif d un clan suivi', {}, 'tracked', null],
    ['membre actif du parking', { clan: UNG }, 'parking', null],
    ['demande /join en attente', { joinStatus: 'pending', isActive: false }, 'pending', null],
    ['archivé pour inactivité', { isActive: false, archivedReason: 'ungrouped_inactive' }, 'archived', 'ungrouped_inactive'],
    ['parti', { isActive: false, joinStatus: 'left' }, 'stopped', 'left'],
    ['rejeté', { isActive: false, joinStatus: 'rejected' }, 'stopped', 'rejected'],
    ['désactivé à la main', { isActive: false }, 'stopped', 'deactivated'],
    ['actif dans un clan inactif', { clan: { ...SMK, isActive: false } }, 'stopped', 'clan_inactive'],
    ['actif sans clan', { clan: null }, 'stopped', 'no_clan'],
    // Ancienne « watchlist » : hors statistiques et hors synchronisations (tracked-isolation.test.ts).
    ['fiche watchlist', { joinStatus: 'tracked' }, 'stopped', 'tracked'],
  ] as const)('%s', (_label, overrides, status, reason) => {
    expect(classifyMember(member(overrides as Partial<DirectoryMember>))).toEqual({ status, reason })
  })
})

describe('buildMemberIndex', () => {
  it('rattache par playerId, et par compte PUBG quand playerId est vide', () => {
    const index = buildMemberIndex(
      [member(), member({ id: 12, playerId: null, pubgAccountId: 'account.bee', clan: BEE })],
      [{ id: 'player-bee', pubgAccountId: 'account.bee', platformShard: 'steam' }]
    )

    expect(index.trackedPlayerIds.sort()).toEqual(['player-bee', 'player-lord'])
    expect(index.byPlayerId.get('player-bee')?.member.id).toBe(12)
  })

  it('ne rattache pas un compte identique d un autre shard', () => {
    const index = buildMemberIndex(
      [member({ playerId: null, platformShard: 'kakao' })],
      [{ id: 'player-lord', pubgAccountId: 'account.lord', platformShard: 'steam' }]
    )
    expect(index.linkedPlayerIds).toEqual([])
  })

  it('signale les membres suivis sans ligne Player, pas les anciens membres', () => {
    const index = buildMemberIndex(
      [
        member({ id: 16, playerId: null, displayName: 'bibou5996' }),
        member({ id: 17, playerId: null, isActive: false, joinStatus: 'left' }),
      ],
      []
    )
    expect(index.unlinkedMembers.map((m) => m.id)).toEqual([16])
  })

  it('retient la fiche la plus forte quand un joueur en a plusieurs', () => {
    const index = buildMemberIndex(
      [
        member({ id: 20, isActive: false, archivedReason: 'ungrouped_inactive', clan: UNG }),
        member({ id: 21, playerId: null }),
      ],
      [{ id: 'player-lord', pubgAccountId: 'account.lord', platformShard: 'steam' }]
    )

    const link = index.byPlayerId.get('player-lord')
    expect(link?.member.id).toBe(21)
    expect(link?.status).toBe('tracked')
    expect(index.linkedPlayerIds).toEqual(['player-lord'])
  })

  it('départage deux fiches de même statut par la plus récente', () => {
    const index = buildMemberIndex(
      [member({ id: 30, isActive: false, joinStatus: 'left' }), member({ id: 31, isActive: false })],
      []
    )
    expect(index.byPlayerId.get('player-lord')?.member.id).toBe(31)
  })
})

describe('buildPlayersWhere', () => {
  const index = { trackedPlayerIds: ['p1', 'p2'], linkedPlayerIds: ['p1', 'p2', 'p3'] }

  it('tracked : uniquement les joueurs suivis', () => {
    expect(buildPlayersWhere(query({ status: 'tracked' }), index)).toEqual({
      where: { AND: [{ id: { in: ['p1', 'p2'] } }] },
      empty: false,
    })
  })

  it('tracked sans aucun joueur suivi : aucune requête', () => {
    expect(buildPlayersWhere(query({ status: 'tracked' }), { trackedPlayerIds: [], linkedPlayerIds: [] }).empty).toBe(
      true
    )
  })

  it('untracked : exclut tout joueur ayant une fiche, archivée comprise', () => {
    expect(buildPlayersWhere(query({ status: 'untracked' }), index).where).toEqual({
      AND: [{ id: { notIn: ['p1', 'p2', 'p3'] } }],
    })
    expect(buildPlayersWhere(query({ status: 'untracked' }), { trackedPlayerIds: [], linkedPlayerIds: [] }).where).toEqual(
      {}
    )
  })

  it('noclan : résolu sans clan, les joueurs jamais résolus exclus', () => {
    expect(buildPlayersWhere(query({ status: 'noclan' }), index).where).toEqual({
      AND: [{ clanResolvedAt: { not: null }, opponentClanId: null }],
    })
  })

  it('favorites : Player.isFavorite seulement', () => {
    expect(buildPlayersWhere(query({ status: 'favorites' }), index).where).toEqual({ AND: [{ isFavorite: true }] })
  })

  it('combine statut, recherche et clan observateur', () => {
    expect(buildPlayersWhere(query({ status: 'tracked', q: 'lord', seenByClanId: 7 }), index).where).toEqual({
      AND: [
        { id: { in: ['p1', 'p2'] } },
        { pubgPlayerName: { startsWith: 'lord' } },
        { encounters: { some: { clanId: 7 } } },
      ],
    })
  })
})

describe('summarizeEncounters', () => {
  it('agrège un joueur croisé par plusieurs clans sur une seule ligne', () => {
    const summaries = summarizeEncounters([
      {
        playerId: 'p1',
        clanId: 8,
        encounterCount: 5,
        teammateEncounterCount: 1,
        lastSeenAt: new Date(),
        clan: { tag: 'BEE', name: 'Killer Bees' },
      },
      {
        playerId: 'p1',
        clanId: 7,
        encounterCount: 10,
        teammateEncounterCount: 2,
        lastSeenAt: new Date(),
        clan: { tag: 'SMK', name: 'Smoke' },
      },
    ])

    expect(summaries.size).toBe(1)
    expect(summaries.get('p1')).toEqual({
      total: 15,
      asTeammate: 3,
      asOpponent: 12,
      distinctClanCount: 2,
      byClan: [
        { clanId: 7, tag: 'SMK', name: 'Smoke', total: 10, asTeammate: 2 },
        { clanId: 8, tag: 'BEE', name: 'Killer Bees', total: 5, asTeammate: 1 },
      ],
    })
  })
})

describe('sortPlayerIdsByEncounters', () => {
  const totals = new Map([
    ['a', 5],
    ['b', 15],
    ['c', 5],
  ])

  it('trie par total puis départage par id, dans le sens demandé', () => {
    expect(sortPlayerIdsByEncounters(['a', 'b', 'c'], totals, 'desc')).toEqual(['b', 'c', 'a'])
    expect(sortPlayerIdsByEncounters(['c', 'b', 'a'], totals, 'asc')).toEqual(['a', 'c', 'b'])
  })

  it('compte zéro pour un joueur sans rencontre', () => {
    expect(sortPlayerIdsByEncounters(['z', 'b'], totals, 'desc')).toEqual(['b', 'z'])
  })
})

describe('lignes', () => {
  it('construit le lien PUBG Lookup avec le shard du joueur', () => {
    expect(buildPubgLookupUrl('kakao', 'Lord Kromb')).toBe('https://pubglookup.com/players/kakao/Lord%20Kromb')
  })

  it('distingue clan connu, solo résolu et clan inconnu', () => {
    expect(toDirectoryRow(player(), undefined, undefined, undefined).pubgClan).toEqual({
      state: 'clan',
      opponentClanId: 'opp-smk',
      tag: 'SMK',
      name: 'Smoke',
    })
    expect(toDirectoryRow(player({ opponentClan: null }), undefined, undefined, undefined).pubgClan).toEqual({
      state: 'solo',
    })
    expect(
      toDirectoryRow(player({ opponentClan: null, clanResolvedAt: null }), undefined, undefined, undefined).pubgClan
    ).toEqual({ state: 'unknown' })
  })

  it('marque non suivi un joueur sans fiche, avec des rencontres à zéro', () => {
    const row = toDirectoryRow(player(), undefined, undefined, undefined)
    expect(row.tracking).toEqual({ status: 'untracked', reason: null, member: null })
    expect(row.encounters.total).toBe(0)
  })
})

describe('listPlayersDirectory', () => {
  const state = {
    accounts: [] as Array<{ id: string; pubgAccountId: string; platformShard: string }>,
    candidates: [] as Array<{ id: string }>,
    page: [] as DirectoryPlayer[],
  }

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    state.accounts = []
    state.candidates = []
    state.page = []

    // Trois lectures de Player, distinguées par leur `select` : rattachement des comptes,
    // candidats du tri par rencontres, page affichée.
    mocks.playerFindMany.mockImplementation(async (args: { select?: Record<string, unknown> }) => {
      const keys = Object.keys(args.select ?? {})
      if (keys.length === 1) return state.candidates
      if (!keys.includes('pubgPlayerName')) return state.accounts
      return state.page
    })
    mocks.clanMemberFindMany.mockResolvedValue([])
    mocks.playerCount.mockResolvedValue(0)
    mocks.clanFindMany.mockResolvedValue([])
    mocks.clanEncounterFindMany.mockResolvedValue([])
    mocks.clanEncounterGroupBy.mockResolvedValue([])
    mocks.playerClanChangeFindMany.mockResolvedValue([])
  })

  it('compteurs : suivis via la fiche, non suivis déduits du total', async () => {
    mocks.clanMemberFindMany.mockResolvedValue([
      member(),
      member({ id: 12, playerId: null, pubgAccountId: 'account.bee', clan: BEE }),
      member({ id: 13, playerId: 'player-old', pubgAccountId: 'account.old', isActive: false, archivedReason: 'ungrouped_inactive', clan: UNG }),
      member({ id: 16, playerId: null, pubgAccountId: 'account.bibou', displayName: 'bibou5996' }),
    ])
    state.accounts = [{ id: 'player-bee', pubgAccountId: 'account.bee', platformShard: 'steam' }]
    mocks.playerCount.mockImplementation(async (args?: { where?: unknown }) =>
      args?.where === SOLO_PLAYER_WHERE ? 12 : 100
    )

    const result = await listPlayersDirectory(query(), { includeCounters: true })

    expect(result.counters).toEqual({ totalPlayers: 100, trackedPlayers: 2, untrackedPlayers: 97, soloPlayers: 12 })
    expect(result.unlinkedMembers).toEqual([{ id: 16, displayName: 'bibou5996', clanTag: 'SMK' }])
    // Sans filtre, le total de la liste réutilise le COUNT(*) des compteurs.
    expect(result.pagination.total).toBe(100)
    expect(mocks.playerCount).toHaveBeenCalledTimes(2)
  })

  it('le filtre noclan et le compteur solo comptent la même chose', async () => {
    await listPlayersDirectory(query({ status: 'noclan' }), { includeCounters: true })

    const wheres = mocks.playerCount.mock.calls.map(([args]) => args?.where)
    expect(wheres).toContainEqual(SOLO_PLAYER_WHERE)
    expect(wheres).toContainEqual({ AND: [SOLO_PLAYER_WHERE] })
  })

  it('tracked sans joueur suivi : ne lit pas la table Player', async () => {
    const result = await listPlayersDirectory(query({ status: 'tracked' }))

    expect(result.rows).toEqual([])
    expect(result.pagination.total).toBe(0)
    expect(mocks.playerCount).not.toHaveBeenCalled()
  })

  it('transmet pagination et tri stable, et calcule totalPages', async () => {
    mocks.playerCount.mockResolvedValue(51)

    const result = await listPlayersDirectory(query({ page: 3, sortBy: 'pubgPlayerName', sortOrder: 'asc' }))

    expect(mocks.playerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 25, orderBy: [{ pubgPlayerName: 'asc' }, { id: 'asc' }] })
    )
    expect(result.pagination).toEqual({ page: 3, pageSize: 25, total: 51, totalPages: 3 })
  })

  it('refuse le tri par rencontres sur un trop grand ensemble et retombe sur la dernière vue', async () => {
    mocks.playerCount.mockResolvedValue(PLAYER_DIRECTORY_ENCOUNTER_SORT_MAX_CANDIDATES + 1)

    const result = await listPlayersDirectory(query({ sortBy: 'totalEncounters' }))

    expect(result.sort).toEqual({
      by: 'lastSeenAt',
      order: 'desc',
      fallback: {
        requested: 'totalEncounters',
        reason: 'too_many_candidates',
        maxCandidates: PLAYER_DIRECTORY_ENCOUNTER_SORT_MAX_CANDIDATES,
      },
    })
    expect(mocks.clanEncounterGroupBy).not.toHaveBeenCalled()
    expect(mocks.playerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }] })
    )
  })

  it('trie un ensemble borné par rencontres totales', async () => {
    mocks.playerCount.mockResolvedValue(3)
    state.candidates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    mocks.clanEncounterGroupBy.mockResolvedValue([
      { playerId: 'a', _sum: { encounterCount: 5 } },
      { playerId: 'b', _sum: { encounterCount: 15 } },
      { playerId: 'c', _sum: { encounterCount: 5 } },
    ])
    state.page = [player({ id: 'a' }), player({ id: 'b' }), player({ id: 'c' })]

    const result = await listPlayersDirectory(query({ sortBy: 'totalEncounters', pageSize: 2 }))

    expect(mocks.playerFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: { in: ['b', 'c'] } } }))
    expect(result.rows.map((row) => row.playerId)).toEqual(['b', 'c'])
    expect(result.sort.fallback).toBeNull()
  })

  it('associe la mutation la plus récente des 30 derniers jours', async () => {
    const now = new Date('2026-09-25T12:00:00.000Z')
    mocks.clanMemberFindMany.mockResolvedValue([member()])
    mocks.playerCount.mockResolvedValue(1)
    state.page = [player()]
    mocks.playerClanChangeFindMany.mockResolvedValue([
      { id: 'chg-2', clanMemberId: 11, status: 'applied', source: 'auto_transfer', detectedAt: new Date('2026-09-24T01:45:00.000Z') },
      { id: 'chg-1', clanMemberId: 11, status: 'observed', source: 'player_sync', detectedAt: new Date('2026-09-20T01:45:00.000Z') },
    ])

    const result = await listPlayersDirectory(query(), { now })

    expect(mocks.playerClanChangeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clanMemberId: { in: [11] }, detectedAt: { gte: new Date('2026-08-26T12:00:00.000Z') } },
      })
    )
    expect(result.rows[0].recentChange).toEqual({
      id: 'chg-2',
      status: 'applied',
      source: 'auto_transfer',
      detectedAt: '2026-09-24T01:45:00.000Z',
    })
    expect(result.rows[0].tracking.status).toBe('tracked')
  })
})
