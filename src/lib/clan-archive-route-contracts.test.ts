import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrats des routes touchées par l'arrêt de suivi d'un clan — docs/TODO/clan-archive.md §5.
 *
 * Les modules métier sont les vrais (clan-archive, clan-service, player-clan-change) ; seuls
 * la base et les services externes sont mockés. Convention du dépôt : les tests vivent dans
 * `src/lib/` et importent les handlers depuis `src/app/` (vitest.config.ts ne collecte que
 * `src/lib`). La logique elle-même est couverte par clan-archive.test.ts, le refus par
 * clan-contact-email.test.ts et le cron par clan-lifecycle/membership-sync.test.ts.
 */

vi.mock('server-only', () => ({}))

// Les mocks Prisma listent les modèles un par un : tout modèle utilisé par les routes testées
// doit apparaître ici (piège documenté dans CLAUDE.md).
const mocks = vi.hoisted(() => ({
  requireSuperUser: vi.fn(),
  getSessionFromRequest: vi.fn(),
  clanFindUnique: vi.fn(),
  clanFindFirst: vi.fn(),
  clanFindMany: vi.fn(),
  clanCount: vi.fn(),
  clanUpdate: vi.fn(),
  clanUpdateMany: vi.fn(),
  clanCreate: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindFirst: vi.fn(),
  memberCount: vi.fn(),
  memberCreate: vi.fn(),
  memberUpdate: vi.fn(),
  txClanUpdateMany: vi.fn(),
  txMemberUpdateMany: vi.fn(),
  changeCount: vi.fn(),
  changeCreate: vi.fn(),
  runFindFirst: vi.fn(),
  runFindMany: vi.fn(),
  identityFindFirst: vi.fn(),
  identityFindUnique: vi.fn(),
  identityCreate: vi.fn(),
  opponentClanFindUnique: vi.fn(),
  transaction: vi.fn(),
  fetchPubgClanById: vi.fn(),
  fetchPlayerClan: vi.fn(),
  searchPlayerByName: vi.fn(),
  notifyJoinRequest: vi.fn(),
  notifyClanCreationRequest: vi.fn(),
  createNotificationForMember: vi.fn(),
  sendClanApprovedEmail: vi.fn(),
  applyPendingPromotionsForClan: vi.fn(),
  countPendingPromotionsForClan: vi.fn(),
  getClanLifecycleSettings: vi.fn(),
  listArchiveCandidates: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    clan: {
      findUnique: mocks.clanFindUnique,
      findFirst: mocks.clanFindFirst,
      findMany: mocks.clanFindMany,
      count: mocks.clanCount,
      update: mocks.clanUpdate,
      updateMany: mocks.clanUpdateMany,
      create: mocks.clanCreate,
    },
    clanMember: {
      findMany: mocks.memberFindMany,
      findFirst: mocks.memberFindFirst,
      count: mocks.memberCount,
      create: mocks.memberCreate,
      update: mocks.memberUpdate,
    },
    playerClanChange: { count: mocks.changeCount, create: mocks.changeCreate },
    clanLifecycleRun: { findFirst: mocks.runFindFirst, findMany: mocks.runFindMany },
    memberIdentity: {
      findFirst: mocks.identityFindFirst,
      findUnique: mocks.identityFindUnique,
      create: mocks.identityCreate,
    },
    opponentClan: { findUnique: mocks.opponentClanFindUnique },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({ requireSuperUser: mocks.requireSuperUser }))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/pubg', () => ({
  fetchClanMembers: vi.fn(),
  fetchLifetimeStats: vi.fn(),
  fetchPlayerClan: mocks.fetchPlayerClan,
  fetchPubgClanById: mocks.fetchPubgClanById,
  searchPlayerByName: mocks.searchPlayerByName,
}))
vi.mock('@/lib/stats-calculator', () => ({ recalculateStatsForClan: vi.fn(async () => undefined) }))
vi.mock('@/lib/role-service', () => ({ initializeDefaultRoles: vi.fn(async () => undefined) }))
vi.mock('@/lib/notification-service', () => ({
  notifyJoinRequest: mocks.notifyJoinRequest,
  notifyClanCreationRequest: mocks.notifyClanCreationRequest,
  createNotificationForMember: mocks.createNotificationForMember,
}))
vi.mock('@/lib/clan-lifecycle/clan-decision-email', () => ({ sendClanApprovedEmail: mocks.sendClanApprovedEmail }))
vi.mock('@/lib/clan-lifecycle/pending-promotions', () => ({
  applyPendingPromotionsForClan: mocks.applyPendingPromotionsForClan,
  countPendingPromotionsForClan: mocks.countPendingPromotionsForClan,
}))
vi.mock('@/lib/clan-lifecycle/config', () => ({
  getClanLifecycleSettings: mocks.getClanLifecycleSettings,
  resetClanLifecycleConfigCache: vi.fn(),
  setClanLifecycleDiscordWebhookUrl: vi.fn(),
  setClanLifecycleMode: vi.fn(),
  setConfirmationsRequired: vi.fn(),
  setMaxMovesRatioPercent: vi.fn(),
  setUngroupedArchiveAfterDays: vi.fn(),
  setUngroupedAutoArchive: vi.fn(),
  setUngroupedAutoPromote: vi.fn(),
}))
vi.mock('@/lib/clan-lifecycle/ungrouped-archive', () => ({ listArchiveCandidates: mocks.listArchiveCandidates }))

import { GET as getClanFollow, PATCH as patchClanFollow } from '@/app/api/settings/clans/[id]/route'
import { POST as trackClanRoute } from '@/app/api/settings/clans/route'
import { GET as getArchivedClans } from '@/app/api/settings/clan-lifecycle/archived-clans/route'
import { GET as getPendingClans } from '@/app/api/settings/clan-lifecycle/pending-clans/route'
import { GET as getLifecycleOverview } from '@/app/api/settings/clan-lifecycle/route'
import { POST as approveClanRoute } from '@/app/api/clans/[clanId]/approve/route'
import { POST as joinRoute } from '@/app/api/join/route'
import { ensureTrackedClanForPlayer } from '@/lib/clan-service'

const ARCHIVED_AT = new Date('2026-09-25T18:00:00.000Z')
const ACTIVE_CLAN = {
  id: 7,
  name: 'Smoke',
  tag: 'SMK',
  platformShard: 'steam',
  pubgClanId: 'clan.smk',
  isActive: true,
  isSystem: false,
  archivedAt: null,
  archivedReason: null,
}

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () => Response.json({ error: 'Forbidden' }, { status: 403 })

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const clanParams = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSuperUser.mockResolvedValue(null)
  mocks.getSessionFromRequest.mockResolvedValue({ userId: 1, isSuperUser: true })
  mocks.clanFindUnique.mockResolvedValue(ACTIVE_CLAN)
  mocks.memberFindMany.mockResolvedValue([])
  mocks.memberCount.mockResolvedValue(0)
  mocks.txClanUpdateMany.mockResolvedValue({ count: 1 })
  mocks.txMemberUpdateMany.mockResolvedValue({ count: 0 })
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      clan: { updateMany: mocks.txClanUpdateMany },
      clanMember: { updateMany: mocks.txMemberUpdateMany },
      playerClanChange: { create: mocks.changeCreate },
    })
  )
  mocks.notifyJoinRequest.mockResolvedValue(undefined)
  mocks.notifyClanCreationRequest.mockResolvedValue(undefined)
})

describe('PATCH /api/settings/clans/[id]', () => {
  it.each([
    ['sans session', unauthorized, 401],
    ['compte non SuperUser', forbidden, 403],
  ])('%s → %i, sans lecture en base', async (_label, response, status) => {
    mocks.requireSuperUser.mockResolvedValue(response())

    const result = await patchClanFollow(jsonRequest('/api/settings/clans/7', { action: 'archive' }, 'PATCH'), clanParams('7'))

    expect(result.status).toBe(status)
    expect(mocks.clanFindUnique).not.toHaveBeenCalled()
  })

  it.each([
    ['identifiant invalide', 'abc', { action: 'archive' }],
    ['action inconnue', '7', { action: 'delete' }],
    ['sort des membres inconnu', '7', { action: 'archive', membersDisposition: 'kick' }],
    ['corps JSON invalide', '7', '{pas du json'],
  ])('%s → 400', async (_label, id, body) => {
    const result = await patchClanFollow(jsonRequest(`/api/settings/clans/${id}`, body, 'PATCH'), clanParams(id))

    expect(result.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('clan inconnu → 404', async () => {
    mocks.clanFindUnique.mockResolvedValue(null)

    const result = await patchClanFollow(jsonRequest('/api/settings/clans/404', { action: 'archive' }, 'PATCH'), clanParams('404'))

    expect(result.status).toBe(404)
  })

  it('refuse (400) d’archiver le clan technique', async () => {
    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isSystem: true })

    const result = await patchClanFollow(
      jsonRequest('/api/settings/clans/7', { action: 'archive', membersDisposition: 'ungrouped' }, 'PATCH'),
      clanParams('7')
    )
    const body = await result.json()

    expect(result.status).toBe(400)
    expect(body.code).toBe('system_clan')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('exige le sort des membres d’un clan non vide (400)', async () => {
    mocks.memberFindMany.mockResolvedValue([{ id: 11, pubgAccountId: 'account.a', platformShard: 'steam' }])

    const result = await patchClanFollow(jsonRequest('/api/settings/clans/7', { action: 'archive' }, 'PATCH'), clanParams('7'))

    expect(result.status).toBe(400)
    expect((await result.json()).code).toBe('disposition_required')
  })

  it('archive un clan vide et le dit', async () => {
    const result = await patchClanFollow(jsonRequest('/api/settings/clans/7', { action: 'archive' }, 'PATCH'), clanParams('7'))
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(body.outcome).toBe('archived')
    expect(body.message).toBe('Le clan [SMK] Smoke n’est plus suivi.')
  })

  it('journalise le déplacement vers le parking avec l’auteur de l’action', async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: 42 })
    mocks.memberFindMany.mockResolvedValue([{ id: 11, pubgAccountId: 'account.a', platformShard: 'steam' }])
    mocks.clanFindFirst.mockResolvedValue({ id: 201, tag: 'UNG', isSystem: true })

    const result = await patchClanFollow(
      jsonRequest('/api/settings/clans/7', { action: 'archive', membersDisposition: 'ungrouped' }, 'PATCH'),
      clanParams('7')
    )
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(body.message).toContain('1 membre(s) déplacé(s) vers le parking Ungrouped')
    expect(mocks.changeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: 'manual_demotion', newClanId: 201, triggeredByUserId: 42 }),
    })
  })

  it('réactive un clan archivé ; refuse (409) un clan en attente', async () => {
    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false, archivedAt: ARCHIVED_AT })
    mocks.clanUpdateMany.mockResolvedValue({ count: 1 })

    const reactivated = await patchClanFollow(
      jsonRequest('/api/settings/clans/7', { action: 'reactivate' }, 'PATCH'),
      clanParams('7')
    )
    expect(reactivated.status).toBe(200)
    expect((await reactivated.json()).outcome).toBe('reactivated')

    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false, archivedAt: null })
    const pending = await patchClanFollow(jsonRequest('/api/settings/clans/7', { action: 'reactivate' }, 'PATCH'), clanParams('7'))
    expect(pending.status).toBe(409)
    expect((await pending.json()).code).toBe('clan_pending')
  })
})

describe('GET /api/settings/clans/[id]', () => {
  it('décrit l’état et le nombre de membres actifs', async () => {
    mocks.memberCount.mockResolvedValue(3)

    const result = await getClanFollow(new Request('http://localhost/api/settings/clans/7'), clanParams('7'))
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(body).toMatchObject({ clan: { id: 7, state: 'active' }, activeMembers: 3 })
  })

  it('clan inconnu → 404 ; non SuperUser → 403', async () => {
    mocks.clanFindUnique.mockResolvedValue(null)
    expect((await getClanFollow(new Request('http://localhost/x'), clanParams('9'))).status).toBe(404)

    mocks.requireSuperUser.mockResolvedValue(forbidden())
    expect((await getClanFollow(new Request('http://localhost/x'), clanParams('9'))).status).toBe(403)
  })
})

describe('listes du cycle de vie', () => {
  it('« Clans en attente » exclut les clans archivés', async () => {
    mocks.clanFindMany.mockResolvedValue([])

    await getPendingClans(new Request('http://localhost/api/settings/clan-lifecycle/pending-clans'))

    expect(mocks.clanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: false, isSystem: false, archivedAt: null } })
    )
  })

  it('« Clans archivés » liste les archivés avec leur motif', async () => {
    mocks.clanFindMany.mockResolvedValue([
      {
        id: 375,
        name: 'RASTAMAN879',
        tag: 'RST',
        platformShard: 'steam',
        archivedAt: ARCHIVED_AT,
        archivedReason: 'rejected',
        createdAt: new Date('2026-09-24T00:00:00.000Z'),
        _count: { members: 1 },
      },
    ])

    const result = await getArchivedClans(new Request('http://localhost/api/settings/clan-lifecycle/archived-clans'))
    const body = await result.json()

    expect(mocks.clanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: false, archivedAt: { not: null } } })
    )
    expect(body.clans[0]).toMatchObject({
      id: 375,
      archivedReason: 'rejected',
      archivedAt: ARCHIVED_AT.toISOString(),
      attachedMembers: 1,
    })
  })

  it('le tableau de bord compte séparément les clans en attente et archivés', async () => {
    mocks.getClanLifecycleSettings.mockResolvedValue({ webhookUrl: null })
    mocks.listArchiveCandidates.mockResolvedValue({ thresholdDays: 90, candidates: [] })
    mocks.runFindFirst.mockResolvedValue(null)
    mocks.runFindMany.mockResolvedValue([])
    mocks.changeCount.mockResolvedValue(0)
    mocks.clanCount.mockImplementation(async (args: { where: { archivedAt: unknown } }) =>
      args.where.archivedAt === null ? 1 : 4
    )

    const result = await getLifecycleOverview(new Request('http://localhost/api/settings/clan-lifecycle'))
    const body = await result.json()

    expect(body.counters).toMatchObject({ pendingClans: 1, archivedClans: 4 })
  })

  it('refuse (409) de valider un clan archivé : la réactivation a sa propre action', async () => {
    mocks.clanFindUnique.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false, archivedAt: ARCHIVED_AT, members: [] })

    const result = await approveClanRoute(jsonRequest('/api/clans/7/approve', {}), {
      params: Promise.resolve({ clanId: '7' }),
    })

    expect(result.status).toBe(409)
    expect((await result.json()).code).toBe('clan_archived')
    expect(mocks.clanUpdate).not.toHaveBeenCalled()
    expect(mocks.applyPendingPromotionsForClan).not.toHaveBeenCalled()
  })
})

describe('« Suivre ce clan » — POST /api/settings/clans', () => {
  beforeEach(() => {
    mocks.fetchPubgClanById.mockResolvedValue({ id: 'clan.smk', name: 'Smoke', tag: 'SMK' })
    mocks.clanFindFirst.mockResolvedValue({ ...ACTIVE_CLAN })
  })

  it('ne répond plus « succès » pour un clan archivé : 409 avec de quoi le réactiver', async () => {
    mocks.clanUpdate.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false, archivedAt: ARCHIVED_AT, archivedReason: 'unfollowed' })

    const result = await trackClanRoute(jsonRequest('/api/settings/clans', { pubgClanId: 'clan.smk' }))
    const body = await result.json()

    expect(result.status).toBe(409)
    expect(body.code).toBe('clan_archived')
    expect(body.clan).toEqual({ id: 7, name: 'Smoke', tag: 'SMK', archivedReason: 'unfollowed' })
  })

  it('signale un clan déjà en attente de validation', async () => {
    mocks.clanUpdate.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false })

    const body = await (await trackClanRoute(jsonRequest('/api/settings/clans', { pubgClanId: 'clan.smk' }))).json()

    expect(body).toMatchObject({ success: true, state: 'pending' })
  })

  it('reste un succès pour un clan actif', async () => {
    mocks.clanUpdate.mockResolvedValue(ACTIVE_CLAN)

    const result = await trackClanRoute(jsonRequest('/api/settings/clans', { pubgClanId: 'clan.smk' }))

    expect(result.status).toBe(200)
    expect((await result.json()).state).toBe('active')
  })
})

describe('ensureTrackedClanForPlayer', () => {
  beforeEach(() => {
    mocks.fetchPlayerClan.mockResolvedValue({ id: 'clan.smk', name: 'Smoke', tag: 'SMK' })
    mocks.clanFindFirst.mockResolvedValue({ ...ACTIVE_CLAN })
  })

  it('ne rattache personne à un clan archivé : les appelants se replient sur Ungrouped', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    mocks.clanUpdate.mockResolvedValue({ ...ACTIVE_CLAN, isActive: false, archivedAt: ARCHIVED_AT })

    await expect(ensureTrackedClanForPlayer('account.a', 'steam')).resolves.toBeNull()
    info.mockRestore()
  })

  it('rattache toujours à un clan actif', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    mocks.clanUpdate.mockResolvedValue(ACTIVE_CLAN)

    const result = await ensureTrackedClanForPlayer('account.a', 'steam')

    expect(result?.clan.id).toBe(7)
    info.mockRestore()
  })
})

describe('POST /api/join sur un clan archivé', () => {
  function joinRequest(mode: 'preview' | 'join') {
    return jsonRequest('/api/join', { pubgPlayerName: 'Vvila', platformShard: 'steam', mode })
  }

  beforeEach(() => {
    mocks.searchPlayerByName.mockResolvedValue({ accountId: 'account.vvila', playerName: 'Vvila' })
    mocks.memberFindFirst.mockResolvedValue(null)
    mocks.fetchPlayerClan.mockResolvedValue({ id: 'clan.old', name: 'Old Clan', tag: 'OLD' })
    mocks.identityFindFirst.mockResolvedValue(null)
    mocks.identityFindUnique.mockResolvedValue(null)
    mocks.identityCreate.mockResolvedValue({})
    mocks.memberCreate.mockResolvedValue({ id: 500 })
  })

  it.each(['preview', 'join'] as const)(
    'suivi arrêté : refusé dès le mode %s (409), sans écriture',
    async (mode) => {
      mocks.clanFindFirst.mockResolvedValue({
        id: 300,
        name: 'Old Clan',
        tag: 'OLD',
        isActive: false,
        archivedAt: ARCHIVED_AT,
        archivedReason: 'unfollowed',
      })

      const result = await joinRoute(joinRequest(mode))
      const body = await result.json()

      expect(result.status).toBe(409)
      expect(body.code).toBe('CLAN_NOT_FOLLOWED')
      expect(mocks.memberCreate).not.toHaveBeenCalled()
      expect(mocks.clanUpdateMany).not.toHaveBeenCalled()
    }
  )

  it('clan refusé : l’aperçu annonce la nouvelle soumission', async () => {
    mocks.clanFindFirst.mockResolvedValue({
      id: 300,
      name: 'Old Clan',
      tag: 'OLD',
      isActive: false,
      archivedAt: ARCHIVED_AT,
      archivedReason: 'rejected',
    })

    const body = await (await joinRoute(joinRequest('preview'))).json()

    expect(body.clan.reopensRejectedRequest).toBe(true)
    expect(mocks.clanUpdateMany).not.toHaveBeenCalled()
  })

  it('clan refusé : la demande le remet en attente et prévient les SuperUsers', async () => {
    mocks.clanFindFirst.mockResolvedValue({
      id: 300,
      name: 'Old Clan',
      tag: 'OLD',
      isActive: false,
      archivedAt: ARCHIVED_AT,
      archivedReason: 'rejected',
    })
    mocks.clanUpdateMany.mockResolvedValue({ count: 1 })

    const result = await joinRoute(joinRequest('join'))
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(mocks.clanUpdateMany).toHaveBeenCalledWith({
      where: { id: 300, isActive: false, archivedReason: 'rejected' },
      data: { archivedAt: null, archivedReason: null },
    })
    expect(mocks.memberCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ clanId: 300, joinStatus: 'pending', isActive: false }),
    })
    expect(mocks.notifyClanCreationRequest).toHaveBeenCalledWith(300, 'Old Clan', 'OLD', 'Vvila')
    expect(body.message).toContain('avait été refusé')
  })
})
