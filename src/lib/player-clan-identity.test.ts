import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Miroir « adversaire » de l'appartenance de clan (src/lib/player-clan-identity.ts).
 *
 * Couvre l'incident du 2026-09-22 : WESTEN88, promu de `UNG` vers `47R` par le
 * cycle de vie, restait listé comme « candidat détecté » de BOFTEAM sur
 * `/settings/opponents`, et le bouton « Ajouter à l'effectif » l'aurait déplacé
 * hors de son clan sans trace.
 *
 * Convention du dépôt : les tests vivent dans `src/lib/`, jamais à côté des routes
 * (vitest.config.ts ne collecte que `src/lib`).
 */

vi.mock('server-only', () => ({}))

// Les mocks Prisma listent les modèles un par un : tout modèle utilisé par le code
// testé doit apparaître ici, sinon l'appel renvoie `undefined` et le test casse loin
// de la cause réelle (piège documenté dans CLAUDE.md).
const mocks = vi.hoisted(() => ({
  requireSuperUser: vi.fn(),
  getSessionFromRequest: vi.fn(),
  opponentClanUpsert: vi.fn(),
  playerUpsert: vi.fn(),
  playerFindUnique: vi.fn(),
  encounteredPlayerUpdateMany: vi.fn(),
  clanMemberFindUnique: vi.fn(),
  clanMemberFindFirst: vi.fn(),
  clanMemberFindMany: vi.fn(),
  clanMemberUpdate: vi.fn(),
  clanMemberCreate: vi.fn(),
  clanFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  playerClanChangeCreate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
    opponentClan: { upsert: mocks.opponentClanUpsert },
    player: { upsert: mocks.playerUpsert, findUnique: mocks.playerFindUnique },
    encounteredPlayer: { updateMany: mocks.encounteredPlayerUpdateMany },
    clanMember: {
      findUnique: mocks.clanMemberFindUnique,
      findFirst: mocks.clanMemberFindFirst,
      findMany: mocks.clanMemberFindMany,
      update: mocks.clanMemberUpdate,
      create: mocks.clanMemberCreate,
    },
    clan: { findUnique: mocks.clanFindUnique },
    playerClanChange: { create: mocks.playerClanChangeCreate },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireSuperUser: mocks.requireSuperUser,
}))

vi.mock('@/lib/auth-session', () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}))

import {
  syncOpponentIdentityForMember,
  syncOpponentIdentityForMemberId,
} from '@/lib/player-clan-identity'
import { GET as getClanMembersRoute } from '@/app/api/settings/opponents/clans/[clanId]/members/route'
import { POST as postTrackRoute } from '@/app/api/settings/opponents/track/route'

const ACCOUNT = 'account.271f449a07a84053a1c36c46add067d5'

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSuperUser.mockResolvedValue(null)
  mocks.getSessionFromRequest.mockResolvedValue({ userId: 1 })
  mocks.opponentClanUpsert.mockResolvedValue({ id: 'opp-47r' })
  mocks.playerUpsert.mockResolvedValue({ id: 'player-1' })
  mocks.encounteredPlayerUpdateMany.mockResolvedValue({ count: 18 })
})

describe('syncOpponentIdentityForMember', () => {
  it('réécrit OpponentClan, Player et toutes les lignes EncounteredPlayer du compte', async () => {
    const result = await syncOpponentIdentityForMember({
      pubgAccountId: ACCOUNT,
      platformShard: 'steam',
      pubgPlayerName: 'WESTEN88',
      clan: { pubgClanId: 'clan.47r', tag: '47R', name: '47RONIN47' },
    })

    expect(result).toEqual({
      playerId: 'player-1',
      opponentClanId: 'opp-47r',
      encounteredRowsUpdated: 18,
    })

    expect(mocks.opponentClanUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pubgClanId_platformShard: { pubgClanId: 'clan.47r', platformShard: 'steam' } },
      })
    )
    expect(mocks.playerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ opponentClanId: 'opp-47r' }) })
    )
    // Toutes les lignes du compte, pas seulement celles d'un clan observateur :
    // un compte n'a qu'une appartenance.
    expect(mocks.encounteredPlayerUpdateMany).toHaveBeenCalledWith({
      where: { pubgAccountId: ACCOUNT, platformShard: 'steam' },
      data: expect.objectContaining({
        playerId: 'player-1',
        pubgClanId: 'clan.47r',
        pubgClanTag: '47R',
        pubgClanName: '47RONIN47',
      }),
    })
  })

  it('remet le miroir a null quand le clan suivi n a pas de pubgClanId (parking)', async () => {
    const result = await syncOpponentIdentityForMember({
      pubgAccountId: ACCOUNT,
      platformShard: 'steam',
      clan: { pubgClanId: null, tag: 'UNG', name: 'Ungrouped' },
    })

    expect(result?.opponentClanId).toBeNull()
    expect(mocks.opponentClanUpsert).not.toHaveBeenCalled()
    expect(mocks.encounteredPlayerUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pubgClanId: null, pubgClanTag: null, pubgClanName: null }),
      })
    )
  })

  it('ne fait rien sans compte PUBG', async () => {
    const result = await syncOpponentIdentityForMember({
      pubgAccountId: null,
      platformShard: 'steam',
      clan: null,
    })

    expect(result).toBeNull()
    expect(mocks.playerUpsert).not.toHaveBeenCalled()
  })
})

describe('syncOpponentIdentityForMemberId', () => {
  it('efface le miroir d un membre desactive : il redevient un joueur externe', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue({
      pubgAccountId: ACCOUNT,
      pubgPlayerName: 'WESTEN88',
      platformShard: 'steam',
      isActive: false,
      clan: { pubgClanId: 'clan.47r', tag: '47R', name: '47RONIN47' },
    })

    await syncOpponentIdentityForMemberId(191)

    expect(mocks.opponentClanUpsert).not.toHaveBeenCalled()
    expect(mocks.playerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ opponentClanId: null }) })
    )
  })

  it('journalise sans propager : un miroir en echec n annule pas un mouvement deja decide', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.clanMemberFindUnique.mockRejectedValue(new Error('DB down'))

    await expect(syncOpponentIdentityForMemberId(191)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('GET /api/settings/opponents/clans/[clanId]/members', () => {
  it('signale un candidat deja membre actif d un autre clan suivi', async () => {
    mocks.clanFindUnique.mockResolvedValue({ pubgClanId: 'clan.bofs', platformShard: 'steam' })
    mocks.clanMemberFindMany.mockResolvedValue([])
    mocks.queryRaw.mockResolvedValue([
      {
        playerId: 'player-1',
        pubgPlayerName: 'WESTEN88',
        pubgAccountId: ACCOUNT,
        lastSeenAt: new Date('2026-09-20T19:53:18.073Z'),
        trackedMemberId: 191,
        trackedClanId: 12,
        trackedClanTag: '47R',
      },
    ])

    const response = await getClanMembersRoute(new Request('http://localhost/x'), {
      params: Promise.resolve({ clanId: '4' }),
    })
    const body = await response.json()

    expect(body.missingCandidates[0].trackedElsewhere).toEqual({
      memberId: 191,
      clanId: 12,
      clanTag: '47R',
    })
  })
})

describe('POST /api/settings/opponents/track', () => {
  function trackRequest(body: unknown) {
    return new Request('http://localhost/api/settings/opponents/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  }

  beforeEach(() => {
    mocks.playerFindUnique.mockResolvedValue({
      id: 'player-1',
      pubgAccountId: ACCOUNT,
      pubgPlayerName: 'WESTEN88',
      platformShard: 'steam',
    })
    mocks.clanMemberFindFirst.mockResolvedValue({
      id: 191,
      clanId: 12,
      isActive: true,
      joinStatus: 'active',
    })
  })

  it('refuse (409) de deplacer un membre actif d un autre clan sans confirmation', async () => {
    mocks.clanFindUnique.mockResolvedValue({ id: 12, tag: '47R', name: '47RONIN47' })

    const response = await postTrackRoute(trackRequest({ playerId: 'player-1', targetClanId: 4 }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe('member_tracked_elsewhere')
    expect(body.currentClan).toEqual({ id: 12, tag: '47R', name: '47RONIN47' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('deplace et trace le mouvement quand le SuperUser confirme', async () => {
    mocks.clanMemberUpdate.mockResolvedValue({ id: 191, clanId: 4 })
    mocks.clanFindUnique.mockResolvedValue({ pubgClanId: 'clan.bofs', tag: 'BOFS' })
    mocks.clanMemberFindUnique.mockResolvedValue({
      pubgAccountId: ACCOUNT,
      pubgPlayerName: 'WESTEN88',
      platformShard: 'steam',
      isActive: true,
      clan: { pubgClanId: 'clan.bofs', tag: 'BOFS', name: 'BOFTEAM' },
    })
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        clanMember: { update: mocks.clanMemberUpdate },
        clan: { findUnique: mocks.clanFindUnique },
        playerClanChange: { create: mocks.playerClanChangeCreate },
      })
    )

    const response = await postTrackRoute(
      trackRequest({ playerId: 'player-1', targetClanId: 4, confirmMove: true })
    )

    expect(response.status).toBe(200)
    // Le mouvement et sa trace ensemble : un transfert sans ligne de journal
    // serait invisible dans `/settings/clan-lifecycle`.
    expect(mocks.playerClanChangeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clanMemberId: 191,
          previousClanId: 12,
          newClanId: 4,
          source: 'manual_transfer',
        }),
      })
    )
    // Et le miroir suit le mouvement.
    expect(mocks.playerUpsert).toHaveBeenCalled()
  })
})
