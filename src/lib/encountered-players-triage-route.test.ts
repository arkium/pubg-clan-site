import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrat de `GET /api/settings/encountered-players`, l'onglet Triage de `/settings/players` : une ligne par identité
 * `Player` depuis la fin d'EncounteredPlayer, étape 3 (src/lib/encountered-players-triage.ts). La recherche par nom
 * échappe `_` et `%` comme l'annuaire (docs/TODO/players.md §3.E), et un `*` seul ne charge pas toute la table.
 *
 * Convention du dépôt : les tests vivent dans `src/lib/` et importent les handlers depuis `src/app/`.
 */

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requireSuperUser: vi.fn(),
  playerFindMany: vi.fn(),
  playerCount: vi.fn(),
  clanEncounterFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    player: { findMany: mocks.playerFindMany, count: mocks.playerCount },
    clanEncounter: { findMany: mocks.clanEncounterFindMany },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireSuperUser: mocks.requireSuperUser,
}))

import { GET as getTriageRoute } from '@/app/api/settings/encountered-players/route'

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSuperUser.mockResolvedValue(null)
  mocks.playerFindMany.mockResolvedValue([])
  mocks.playerCount.mockResolvedValue(0)
  mocks.clanEncounterFindMany.mockResolvedValue([])
})

function get(query: string) {
  return getTriageRoute(new Request(`http://localhost/api/settings/encountered-players?${query}`))
}

function search(q: string) {
  return get(`q=${encodeURIComponent(q)}`)
}

function firstRead() {
  return mocks.playerFindMany.mock.calls[0][0]
}

function nameClauseOfFirstRead() {
  return firstRead().where.AND.filter((clause: Record<string, unknown>) => 'pubgPlayerName' in clause)
}

const seen = new Date('2026-10-21T20:00:00Z')

function player(overrides: Record<string, unknown> = {}) {
  return {
    id: 'player-1',
    pubgAccountId: 'account.1',
    platformShard: 'steam',
    pubgPlayerName: 'Kromb',
    encounterCount: 7,
    resolveAttempts: 0,
    clanResolvedAt: null,
    lastSeenAt: seen,
    opponentClanId: null,
    opponentClan: null,
    ...overrides,
  }
}

function encounter(playerId: string, clanId: number, tag: string, encounterCount: number) {
  return { playerId, encounterCount, lastSeenAt: seen, clan: { id: clanId, name: `Clan ${tag}`, tag } }
}

describe('GET /api/settings/encountered-players — recherche par nom', () => {
  it('refuse sans droits, sans lecture en base', async () => {
    mocks.requireSuperUser.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))

    const result = await search('Lord')

    expect(result.status).toBe(403)
    expect(mocks.playerFindMany).not.toHaveBeenCalled()
  })

  it('échappe `_` dans un préfixe : Lord_Kromb ne trouve plus LordXKromb', async () => {
    const result = await search('Lord_Kromb')

    expect(result.status).toBe(200)
    expect(nameClauseOfFirstRead()).toEqual([{ pubgPlayerName: { startsWith: 'Lord\\_Kromb' } }])
  })

  it('`*` en tête demande une sous-chaîne, `%` et `\\` y restent littéraux', async () => {
    await search('*50%\\x')

    expect(nameClauseOfFirstRead()).toEqual([{ pubgPlayerName: { contains: '50\\%\\\\x' } }])
  })

  it('`%` en tête demande aussi une sous-chaîne', async () => {
    await search('%Kromb')

    expect(nameClauseOfFirstRead()).toEqual([{ pubgPlayerName: { contains: 'Kromb' } }])
  })

  it('une recherche reste paginée : un `*` seul ne filtre rien et ne lit qu’une page', async () => {
    const result = await search('*')
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(mocks.playerCount).toHaveBeenCalledTimes(1)
    expect(firstRead()).toEqual(expect.objectContaining({ take: 20, skip: 0 }))
    expect(nameClauseOfFirstRead()).toEqual([])
    expect(body.total).toBe(0)
  })
})

describe('GET /api/settings/encountered-players — une ligne par identité Player', () => {
  it('file par défaut : clause compacte sur Player, ordre du cron, tri des seuls identifiants puis relecture', async () => {
    mocks.playerFindMany.mockResolvedValueOnce([{ id: 'p-2' }, { id: 'p-1' }]).mockResolvedValueOnce([
      player({ id: 'p-1', pubgAccountId: 'account.1' }),
      player({ id: 'p-2', pubgAccountId: 'account.2' }),
    ])

    const body = await (await get('status=never_attempted&status=retry_pending&status=failed')).json()

    const { where, orderBy, select } = firstRead()
    expect(where).toEqual({ AND: [{ clanResolvedAt: null, encounterCount: { gte: 2 } }] })
    expect(select).toEqual({ id: true })
    expect(mocks.playerFindMany.mock.calls[1][0].where).toEqual({ id: { in: ['p-2', 'p-1'] } })
    // L'ordre est celui du tri, pas celui de la relecture.
    expect(body.rows.map((row: { id: string }) => row.id)).toEqual(['p-2', 'p-1'])
    expect(orderBy).toEqual([
      { combatInteractionsCount: 'desc' },
      { encounterCount: 'desc' },
      { resolveAttempts: 'desc' },
      { id: 'desc' },
    ])
    expect(mocks.playerCount).toHaveBeenCalledWith({ where })
  })

  it('sans statut, seuls les joueurs croisés au moins une fois sont listés', async () => {
    await get('')

    expect(firstRead().where).toEqual({ AND: [{ encounterCount: { gt: 0 } }] })
  })

  it('assemble la ligne : statut global, clan PUBG, compteurs tous clans et détail par clan suivi', async () => {
    mocks.playerCount.mockResolvedValue(1)
    mocks.playerFindMany.mockResolvedValue([
      player({
        resolveAttempts: 1,
        clanResolvedAt: new Date('2026-10-20T10:00:00Z'),
        opponentClanId: 'oc-1',
        opponentClan: { tag: 'KRM', name: 'Kromb Squad' },
      }),
    ])
    mocks.clanEncounterFindMany.mockResolvedValue([encounter('player-1', 3, 'AAA', 5), encounter('player-1', 9, 'BBB', 2)])

    const body = await (await get('status=resolved_with_clan')).json()

    expect(mocks.clanEncounterFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { playerId: { in: ['player-1'] } } }))
    expect(body.total).toBe(1)
    expect(body.players).toEqual(body.rows)
    expect(body.rows[0]).toEqual(
      expect.objectContaining({
        id: 'player-1',
        playerId: 'player-1',
        pubgAccountId: 'account.1',
        pubgClanTag: 'KRM',
        pubgClanName: 'Kromb Squad',
        status: 'resolved_with_clan',
        clanId: 3,
        clanTag: 'AAA',
        encounterCount: 5,
        totalEncounterCount: 7,
        distinctClanCount: 2,
        resolveAttempts: 1,
        clanResolvedAt: '2026-10-20T10:00:00.000Z',
        lastSeenAt: seen.toISOString(),
      })
    )
    expect(body.rows[0].clans.map((clan: { clanTag: string }) => clan.clanTag)).toEqual(['AAA', 'BBB'])
  })

  it('filtre par clan suivi : semi-jointure sur ClanEncounter, ce clan affiché en tête', async () => {
    mocks.playerFindMany.mockResolvedValue([player()])
    mocks.clanEncounterFindMany.mockResolvedValue([encounter('player-1', 3, 'AAA', 5), encounter('player-1', 9, 'BBB', 2)])

    const body = await (await get('clanId=9')).json()

    expect(firstRead().where.AND).toContainEqual({ encounters: { some: { clanId: 9 } } })
    expect(body.rows[0]).toEqual(expect.objectContaining({ clanId: 9, clanTag: 'BBB', encounterCount: 2, status: 'never_attempted' }))
  })

  it('tri par nombre de clans : appliqué à la page lue dans l’ordre de la file', async () => {
    mocks.playerFindMany.mockResolvedValue([player({ id: 'p-a' }), player({ id: 'p-b' })])
    mocks.clanEncounterFindMany.mockResolvedValue([
      encounter('p-a', 1, 'AAA', 3),
      encounter('p-b', 1, 'AAA', 2),
      encounter('p-b', 2, 'BBB', 2),
    ])

    const body = await (await get('sortBy=distinctClanCount&sortOrder=desc')).json()

    expect(firstRead().orderBy[0]).toEqual({ combatInteractionsCount: 'desc' })
    expect(body.rows.map((row: { id: string }) => row.id)).toEqual(['p-b', 'p-a'])
  })

  it('les tris par colonne passent à la base, avec un départage stable', async () => {
    await get('sortBy=lastSeenAt&sortOrder=asc')
    expect(firstRead().orderBy).toEqual([{ lastSeenAt: 'asc' }, { id: 'desc' }])

    mocks.playerFindMany.mockClear()
    await get('sortBy=totalEncounterCount&sortOrder=desc&page=3')
    expect(firstRead()).toEqual(expect.objectContaining({ orderBy: [{ encounterCount: 'desc' }, { id: 'desc' }], skip: 40 }))
  })
})
