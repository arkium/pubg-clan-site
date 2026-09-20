import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Chantier 3 — Rétrogradation vers le clan système par un Owner.
 *
 * Deux règles se répondent :
 *   - `DELETE /api/members/[id]` (arrêt de suivi) devient SuperUser : il coupe la
 *     synchronisation PUBG, donc fait disparaître le joueur de l'écosystème.
 *   - `PATCH /api/members/[id]` s'ouvre à un Owner **uniquement** quand la cible est
 *     le clan système du même shard. Toute autre cible reste SuperUser.
 *
 * Convention du dépôt : le test vit dans `src/lib/` et importe les handlers depuis
 * `src/app/` (vitest.config.ts n'inclut que `src/lib/**\/*.test.ts`).
 */

// vi.mock est hoiste au-dessus des declarations : les mocks doivent l'etre aussi.
const mocks = vi.hoisted(() => ({
  clanMemberFindUnique: vi.fn(),
  clanMemberUpdate: vi.fn(),
  clanFindUnique: vi.fn(),
  clanMemberRoleDeleteMany: vi.fn(),
  playerClanChangeCreate: vi.fn(),
  requireSuperUser: vi.fn(),
  requirePermission: vi.fn(),
  getSessionFromRequest: vi.fn(),
}))

// Les modèles Prisma sont listés un par un : tout modèle touché par la route doit
// figurer ici, sinon l'appel renvoie `undefined` (piège documenté dans CLAUDE.md).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: {
      findUnique: mocks.clanMemberFindUnique,
      update: mocks.clanMemberUpdate,
    },
    clan: {
      findUnique: mocks.clanFindUnique,
    },
    clanMemberRole: {
      deleteMany: mocks.clanMemberRoleDeleteMany,
    },
    playerClanChange: {
      create: mocks.playerClanChangeCreate,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        clanMember: { update: mocks.clanMemberUpdate },
        clanMemberRole: { deleteMany: mocks.clanMemberRoleDeleteMany },
        playerClanChange: { create: mocks.playerClanChangeCreate },
      }),
  },
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireSuperUser: mocks.requireSuperUser,
  requirePermission: mocks.requirePermission,
  requireSameClanAsMember: vi.fn(async () => null),
}))

vi.mock('@/lib/auth-session', () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}))

vi.mock('@/lib/clan-service', () => ({
  syncTrackedClanStats: vi.fn(async () => undefined),
}))

vi.mock('@/lib/role-service', () => ({
  initializeDefaultRoles: vi.fn(async () => undefined),
  assignDefaultMemberRole: vi.fn(async () => undefined),
}))

import { DELETE as deleteMember, PATCH as patchMember } from '@/app/api/members/[id]/route'

const FORBIDDEN = Response.json({ error: 'Forbidden' }, { status: 403 })

const SYSTEM_CLAN = {
  id: 99,
  name: 'Ungrouped',
  tag: 'UNG',
  platformShard: 'steam',
  isActive: true,
  isSystem: true,
  pubgClanId: null,
}

const OTHER_TRACKED_CLAN = {
  id: 7,
  name: 'FR-Alliance-BE',
  tag: 'FR',
  platformShard: 'steam',
  isActive: true,
  isSystem: false,
  pubgClanId: 'clan.fr',
}

function buildMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    displayName: 'Vvila',
    isActive: true,
    clanId: 1,
    platformShard: 'steam',
    pubgAccountId: 'account.vvila',
    clan: { name: 'D32', tag: 'SMK', isSystem: false, pubgClanId: 'clan.smk' },
    roles: [{ role: { name: 'Member' } }],
    ...overrides,
  }
}

function patchRequest(clanId: number) {
  return new Request('http://localhost/api/members/11', {
    method: 'PATCH',
    body: JSON.stringify({ clanId }),
  }) as never
}

const params = Promise.resolve({ id: '11' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSuperUser.mockResolvedValue(null)
  mocks.requirePermission.mockReturnValue(async () => null)
  mocks.getSessionFromRequest.mockResolvedValue({ userId: 42 })
  mocks.clanMemberUpdate.mockResolvedValue({})
  mocks.clanMemberRoleDeleteMany.mockResolvedValue({ count: 1 })
  mocks.playerClanChangeCreate.mockResolvedValue({ id: 'chg_1' })
})

describe('Chantier 3 — un Owner peut basculer un membre vers le clan système', () => {
  it('accepte la bascule sous `manage_members` sans exiger le SuperUser', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(buildMember())
    mocks.clanFindUnique.mockResolvedValue(SYSTEM_CLAN)

    const response = await patchMember(patchRequest(SYSTEM_CLAN.id), { params })

    expect(response.status).toBe(200)
    // La permission demandée porte sur le clan ACTUEL du membre, pas sur la cible.
    expect(mocks.requirePermission).toHaveBeenCalledWith('manage_members')
    expect(mocks.requireSuperUser).not.toHaveBeenCalled()
  })

  it('exige le SuperUser dès que la cible est un clan suivi ordinaire', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(buildMember())
    mocks.clanFindUnique.mockResolvedValue(OTHER_TRACKED_CLAN)

    await patchMember(patchRequest(OTHER_TRACKED_CLAN.id), { params })

    expect(mocks.requireSuperUser).toHaveBeenCalled()
    expect(mocks.requirePermission).not.toHaveBeenCalled()
  })

  it('refuse un Owner qui tenterait de passer par le clan système pour contourner la règle', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(
      buildMember({ roles: [{ role: { name: 'Owner' } }] })
    )
    mocks.clanFindUnique.mockResolvedValue(SYSTEM_CLAN)

    const response = await patchMember(patchRequest(SYSTEM_CLAN.id), { params })

    expect(response.status).toBe(403)
    expect(mocks.clanMemberUpdate).not.toHaveBeenCalled()
  })

  it('refuse la bascule si les plateformes diffèrent', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(buildMember({ platformShard: 'xbox' }))
    mocks.clanFindUnique.mockResolvedValue(SYSTEM_CLAN)

    const response = await patchMember(patchRequest(SYSTEM_CLAN.id), { params })

    // Shard différent → ce n'est plus la bascule autorisée, on repasse SuperUser,
    // puis la règle de plateforme rejette de toute façon.
    expect(mocks.requireSuperUser).toHaveBeenCalled()
    expect(response.status).toBe(400)
  })

  it('applique la permission refusée par le middleware', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(buildMember())
    mocks.clanFindUnique.mockResolvedValue(SYSTEM_CLAN)
    mocks.requirePermission.mockReturnValue(async () => FORBIDDEN)

    const response = await patchMember(patchRequest(SYSTEM_CLAN.id), { params })

    expect(response.status).toBe(403)
    expect(mocks.clanMemberUpdate).not.toHaveBeenCalled()
  })
})

describe('Chantier 3 — la bascule laisse une trace dans le même mouvement', () => {
  it('écrit un PlayerClanChange `manual_demotion` dans la transaction', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(buildMember())
    mocks.clanFindUnique.mockResolvedValue(SYSTEM_CLAN)

    await patchMember(patchRequest(SYSTEM_CLAN.id), { params })

    expect(mocks.playerClanChangeCreate).toHaveBeenCalledTimes(1)
    const { data } = mocks.playerClanChangeCreate.mock.calls[0][0]
    expect(data).toMatchObject({
      clanMemberId: 11,
      previousClanId: 1,
      newClanId: SYSTEM_CLAN.id,
      source: 'manual_demotion',
      status: 'applied',
      triggeredByUserId: 42,
    })
    expect(data.appliedAt).toBeInstanceOf(Date)
  })

  it('distingue un transfert SuperUser par la source `manual_transfer`', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(buildMember())
    mocks.clanFindUnique.mockResolvedValue(OTHER_TRACKED_CLAN)

    await patchMember(patchRequest(OTHER_TRACKED_CLAN.id), { params })

    const { data } = mocks.playerClanChangeCreate.mock.calls[0][0]
    expect(data.source).toBe('manual_transfer')
  })
})

describe("Chantier 3 — l'arrêt de suivi devient SuperUser", () => {
  it('refuse un Owner sur DELETE', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue({
      id: 11,
      displayName: 'Vvila',
      isActive: true,
      clanId: 1,
      roles: [{ role: { name: 'Member' } }],
    })
    mocks.requireSuperUser.mockResolvedValue(FORBIDDEN)

    const request = new Request('http://localhost/api/members/11', { method: 'DELETE' }) as never
    const response = await deleteMember(request, { params })

    expect(response.status).toBe(403)
    expect(mocks.clanMemberUpdate).not.toHaveBeenCalled()
  })
})
