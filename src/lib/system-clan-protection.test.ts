import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Chantier 0 — Protection du clan systeme (`Clan.isSystem`).
 *
 * Couvre le bug du 2026-09-20 : `resolvePubgClanForLocalClan` retombait sur le clan
 * PUBG du premier membre actif quand le clan n'avait pas de `pubgClanId`, et
 * `syncTrackedClanStats` ecrivait ce clan-la sur le parking "Ungrouped", qui devenait
 * alors un clan suivi ordinaire contenant tous les joueurs sans clan.
 *
 * Convention du depot : les tests vivent dans `src/lib/`, jamais a cote des routes
 * (vitest.config.ts n'inclut que `src/lib/**\/*.test.ts`).
 */

// Les mocks Prisma listent les modeles un par un : tout modele utilise par le code
// teste doit apparaitre ici, sinon l'appel renvoie `undefined` et le test casse loin
// de la cause reelle (piege documente dans CLAUDE.md).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    clanMember: {
      count: vi.fn(),
    },
    playerStats: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/pubg', () => ({
  fetchClanMembers: vi.fn(),
  fetchLifetimeStats: vi.fn(),
  fetchPlayerClan: vi.fn(),
  fetchPubgClanById: vi.fn(),
  searchPlayerByName: vi.fn(),
}))

vi.mock('@/lib/stats-calculator', () => ({
  recalculateStatsForClan: vi.fn(async () => undefined),
}))

import { prisma } from '@/lib/prisma'
import { fetchPlayerClan, fetchPubgClanById } from '@/lib/pubg'
import {
  getOrCreateUngroupedClan,
  syncClanMembership,
  syncTrackedClanStats,
  upsertTrackedClanFromPubg,
} from '@/lib/clan-service'

const mockedPrisma = vi.mocked(prisma, true)
const mockedFetchPlayerClan = vi.mocked(fetchPlayerClan)
const mockedFetchPubgClanById = vi.mocked(fetchPubgClanById)

const SYSTEM_CLAN = {
  id: 99,
  name: 'Ungrouped',
  tag: 'UNG',
  platformShard: 'steam',
  pubgClanId: null,
  isSystem: true,
  members: [
    {
      id: 1,
      pubgAccountId: 'account.membre-avec-clan',
      pubgPlayerName: 'JoueurQuiARejointUnClan',
      platformShard: 'steam',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedPrisma.playerStats.findMany.mockResolvedValue([] as never)
  mockedPrisma.clanMember.count.mockResolvedValue(1 as never)
  mockedPrisma.clan.update.mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: SYSTEM_CLAN.id,
    name: SYSTEM_CLAN.name,
    tag: SYSTEM_CLAN.tag,
    platformShard: SYSTEM_CLAN.platformShard,
    pubgClanId: SYSTEM_CLAN.pubgClanId,
    clanStats: args.data.clanStats,
  })) as never)
})

describe('Chantier 0 — un clan systeme ne peut pas etre absorbe par un clan PUBG', () => {
  it("n'interroge jamais l'API PUBG pour deviner le clan d'un clan systeme", async () => {
    mockedPrisma.clan.findUnique.mockResolvedValue(SYSTEM_CLAN as never)

    await syncTrackedClanStats(SYSTEM_CLAN.id)

    // C'est exactement le fallback qui renommait le parking : il ne doit plus courir.
    expect(mockedFetchPlayerClan).not.toHaveBeenCalled()
    expect(mockedFetchPubgClanById).not.toHaveBeenCalled()
  })

  it("n'ecrit ni name, ni tag, ni pubgClanId sur un clan systeme", async () => {
    mockedPrisma.clan.findUnique.mockResolvedValue(SYSTEM_CLAN as never)

    await syncTrackedClanStats(SYSTEM_CLAN.id)

    expect(mockedPrisma.clan.update).toHaveBeenCalledTimes(1)
    const updateArgs = mockedPrisma.clan.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(updateArgs.data).not.toHaveProperty('name')
    expect(updateArgs.data).not.toHaveProperty('tag')
    expect(updateArgs.data).not.toHaveProperty('pubgClanId')
    expect(updateArgs.data).toHaveProperty('clanStats')
  })

  it('continue de mettre a jour les statistiques du clan systeme', async () => {
    mockedPrisma.clan.findUnique.mockResolvedValue(SYSTEM_CLAN as never)

    const result = await syncTrackedClanStats(SYSTEM_CLAN.id)

    // Le parking reste suivi : seule son identite est figee, pas ses stats.
    expect(result.name).toBe('Ungrouped')
    expect(mockedPrisma.clan.update).toHaveBeenCalled()
  })

  it('adopte en revanche l identite PUBG pour un clan ordinaire', async () => {
    const ordinaryClan = {
      ...SYSTEM_CLAN,
      id: 1,
      name: 'D32',
      tag: 'SMK',
      isSystem: false,
      pubgClanId: 'clan.reel',
    }
    mockedPrisma.clan.findUnique.mockResolvedValue(ordinaryClan as never)
    mockedFetchPubgClanById.mockResolvedValue({
      id: 'clan.reel',
      name: 'D32-renomme',
      tag: 'SMK2',
    } as never)

    await syncTrackedClanStats(ordinaryClan.id)

    const updateArgs = mockedPrisma.clan.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(updateArgs.data).toMatchObject({
      name: 'D32-renomme',
      tag: 'SMK2',
      pubgClanId: 'clan.reel',
    })
  })
})

describe('Chantier 0 — identification du clan systeme par isSystem, pas par son nom', () => {
  it('retrouve le clan systeme meme s il a ete renomme a la main en base', async () => {
    const renamed = { id: 99, name: 'Parking-renomme', tag: 'XXX', platformShard: 'steam', isSystem: true }
    mockedPrisma.clan.findFirst.mockResolvedValue(renamed as never)

    const clan = await getOrCreateUngroupedClan('steam')

    expect(clan).toEqual(renamed)
    // La recherche porte sur isSystem + shard, jamais sur le nom.
    const where = (mockedPrisma.clan.findFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where
    expect(where).toEqual({ platformShard: 'steam', isSystem: true })
    expect(mockedPrisma.clan.create).not.toHaveBeenCalled()
  })

  it('cree le clan systeme avec isSystem: true quand il n existe pas', async () => {
    mockedPrisma.clan.findFirst.mockResolvedValue(null as never)
    mockedPrisma.clan.create.mockResolvedValue({ id: 100 } as never)

    await getOrCreateUngroupedClan('steam')

    const createArgs = mockedPrisma.clan.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(createArgs.data).toMatchObject({ name: 'Ungrouped', tag: 'UNG', isSystem: true })
  })

  it("exclut les clans systeme de l'absorption par un clan PUBG homonyme", async () => {
    mockedPrisma.clan.findFirst.mockResolvedValue(null as never)
    mockedPrisma.clan.create.mockResolvedValue({ id: 101 } as never)

    await upsertTrackedClanFromPubg({ id: 'clan.x', name: 'Ungrouped', tag: 'UNG' } as never, 'steam')

    const where = (mockedPrisma.clan.findFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where
    expect(where).toMatchObject({ isSystem: false })
  })
})

describe('Chantier 0 — pas de roster PUBG a comparer pour un clan systeme', () => {
  it('refuse syncClanMembership avec un message explicite', async () => {
    mockedPrisma.clan.findUnique.mockResolvedValue({
      pubgClanId: null,
      platformShard: 'steam',
      isSystem: true,
      members: [],
    } as never)

    await expect(syncClanMembership(99)).rejects.toThrow(/clan technique/i)
    expect(mockedFetchPubgClanById).not.toHaveBeenCalled()
  })
})
