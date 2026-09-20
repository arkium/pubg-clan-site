import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Chantier 2 — promotion d'un joueur du clan technique vers son vrai clan.
 *
 * Trois cas, et la règle qui les sépare : on déplace librement vers un clan **déjà
 * validé**, jamais vers un clan qui ne l'est pas. Faire entrer un clan dans la ligue
 * reste une décision SuperUser, exactement comme sur `/join`.
 */

const mocks = vi.hoisted(() => ({
  runFindFirst: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
  memberFindMany: vi.fn(),
  memberUpdate: vi.fn(),
  clanFindMany: vi.fn(),
  clanFindFirst: vi.fn(),
  clanCreate: vi.fn(),
  changeFindMany: vi.fn(),
  changeUpdateMany: vi.fn(),
  changeUpdate: vi.fn(),
  changeCreate: vi.fn(),
  changeCount: vi.fn(),
  fetchStates: vi.fn(),
  fetchClanById: vi.fn(),
  getMode: vi.fn(),
  getConfirmations: vi.fn(),
  getMaxRatio: vi.fn(),
  getAutoPromote: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const tx = {
    clanMember: { update: mocks.memberUpdate },
    playerClanChange: {
      updateMany: mocks.changeUpdateMany,
      update: mocks.changeUpdate,
      create: mocks.changeCreate,
    },
  }
  return {
    prisma: {
      clanLifecycleRun: {
        findFirst: mocks.runFindFirst,
        create: mocks.runCreate,
        update: mocks.runUpdate,
      },
      clanMember: { findMany: mocks.memberFindMany, update: mocks.memberUpdate },
      clan: { findMany: mocks.clanFindMany, findFirst: mocks.clanFindFirst, create: mocks.clanCreate },
      playerClanChange: {
        findMany: mocks.changeFindMany,
        updateMany: mocks.changeUpdateMany,
        update: mocks.changeUpdate,
        create: mocks.changeCreate,
        count: mocks.changeCount,
      },
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
    },
  }
})

vi.mock('@/lib/clan-lifecycle/clan-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/clan-lifecycle/clan-state')>()
  return { ...actual, fetchPlayersClanStates: mocks.fetchStates }
})

vi.mock('@/lib/pubg', () => ({ fetchPubgClanById: mocks.fetchClanById }))

vi.mock('@/lib/clan-lifecycle/config', () => ({
  getClanLifecycleMode: mocks.getMode,
  getConfirmationsRequired: mocks.getConfirmations,
  getMaxMovesRatioPercent: mocks.getMaxRatio,
  getUngroupedAutoPromote: mocks.getAutoPromote,
}))

vi.mock('@/lib/notification-service', () => ({
  notifyClanCreationRequest: vi.fn(async () => undefined),
}))

import { runMembershipSyncPass } from '@/lib/clan-lifecycle/membership-sync'
import { applyPendingPromotionsForClan } from '@/lib/clan-lifecycle/pending-promotions'

const KMS = { id: 180, tag: 'KMS', pubgClanId: 'clan.kms', isSystem: false, platformShard: 'steam' }
const UNG = { id: 201, tag: 'UNG', pubgClanId: null, isSystem: true, platformShard: 'steam' }

/** Membre parqué dans le clan technique. */
function parkedMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    displayName: 'Vvila',
    pubgAccountId: 'account.vvila',
    platformShard: 'steam',
    clanId: UNG.id,
    clan: { tag: UNG.tag, pubgClanId: null, isSystem: true },
    ...overrides,
  }
}

function fillers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...parkedMember(),
    id: 500 + i,
    pubgAccountId: `account.filler${i}`,
    displayName: `Filler${i}`,
  }))
}

function observations(count: number, pubgClanId: string | null) {
  return Array.from({ length: count }, (_, i) => ({
    newPubgClanId: pubgClanId,
    detectedAt: new Date(2026, 8, 20, 10, i),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runFindFirst.mockResolvedValue(null)
  mocks.runCreate.mockResolvedValue({ id: 'run_1', startedAt: new Date() })
  mocks.runUpdate.mockResolvedValue({})
  mocks.memberUpdate.mockResolvedValue({})
  mocks.changeUpdateMany.mockResolvedValue({ count: 0 })
  mocks.changeUpdate.mockResolvedValue({})
  mocks.changeCreate.mockResolvedValue({ id: 'chg' })
  mocks.changeFindMany.mockResolvedValue([])
  mocks.clanFindMany.mockResolvedValue([KMS, UNG])
  mocks.clanFindFirst.mockResolvedValue(null)
  mocks.clanCreate.mockResolvedValue({ id: 999, name: 'NouveauClan', tag: 'NEW' })
  mocks.getMode.mockResolvedValue('apply')
  mocks.getConfirmations.mockResolvedValue(3)
  mocks.getMaxRatio.mockResolvedValue(10)
  mocks.getAutoPromote.mockResolvedValue(true)
})

describe('Cas A — le clan détecté est déjà suivi', () => {
  it('sort le joueur du parking avec la source `ungrouped_promotion`', async () => {
    const filler = fillers(19)
    mocks.memberFindMany.mockResolvedValue([parkedMember(), ...filler])
    mocks.fetchStates.mockResolvedValue(
      new Map([
        ['account.vvila', { kind: 'has_clan', clanId: 'clan.kms' }],
        ...filler.map((m) => [m.pubgAccountId, { kind: 'no_clan' as const }] as const),
      ])
    )
    mocks.changeFindMany.mockResolvedValue(observations(3, 'clan.kms'))

    const summary = await runMembershipSyncPass()

    expect(summary.movementsApplied).toBe(1)
    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: 11 }, data: { clanId: KMS.id } })

    const applied = mocks.changeCreate.mock.calls
      .map((c) => c[0].data)
      .find((d) => d.status === 'applied')
    // Depuis le parking, ce n'est pas un transfert ordinaire mais une promotion.
    expect(applied?.source).toBe('ungrouped_promotion')
    expect(mocks.clanCreate).not.toHaveBeenCalled()
  })

  it("laisse le joueur dans le parking quand la promotion automatique est désactivée", async () => {
    mocks.getAutoPromote.mockResolvedValue(false)
    const filler = fillers(19)
    mocks.memberFindMany.mockResolvedValue([parkedMember(), ...filler])
    mocks.fetchStates.mockResolvedValue(
      new Map([
        ['account.vvila', { kind: 'has_clan', clanId: 'clan.kms' }],
        ...filler.map((m) => [m.pubgAccountId, { kind: 'no_clan' as const }] as const),
      ])
    )
    mocks.changeFindMany.mockResolvedValue(observations(3, 'clan.kms'))

    const summary = await runMembershipSyncPass()

    expect(summary.movementsPlanned).toBe(0)
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })
})

describe('Cas B — le clan détecté est inconnu', () => {
  it('crée le clan INACTIF et ne déplace personne', async () => {
    const filler = fillers(19)
    mocks.memberFindMany.mockResolvedValue([parkedMember(), ...filler])
    mocks.fetchStates.mockResolvedValue(
      new Map([
        ['account.vvila', { kind: 'has_clan', clanId: 'clan.inconnu' }],
        ...filler.map((m) => [m.pubgAccountId, { kind: 'no_clan' as const }] as const),
      ])
    )
    mocks.changeFindMany.mockResolvedValue(observations(3, 'clan.inconnu'))
    mocks.fetchClanById.mockResolvedValue({ id: 'clan.inconnu', name: 'NouveauClan', tag: 'NEW' })

    const summary = await runMembershipSyncPass()

    expect(summary.pendingClanRequests).toBe(1)
    // Le garde-fou central : un clan n'entre jamais actif automatiquement.
    expect(mocks.clanCreate.mock.calls[0][0].data).toMatchObject({
      pubgClanId: 'clan.inconnu',
      isActive: false,
    })
    expect(summary.movementsApplied).toBe(0)
    expect(mocks.memberUpdate).not.toHaveBeenCalled()

    const pendingEvent = mocks.changeCreate.mock.calls
      .map((c) => c[0].data)
      .find((d) => d.status === 'pending')
    expect(pendingEvent).toMatchObject({ newClanId: 999, source: 'ungrouped_promotion' })
  })

  it('ne recrée pas un clan déjà demandé lors d’un passage précédent', async () => {
    mocks.clanFindFirst.mockResolvedValue({ id: 999, isActive: false })
    const filler = fillers(19)
    mocks.memberFindMany.mockResolvedValue([parkedMember(), ...filler])
    mocks.fetchStates.mockResolvedValue(
      new Map([
        ['account.vvila', { kind: 'has_clan', clanId: 'clan.inconnu' }],
        ...filler.map((m) => [m.pubgAccountId, { kind: 'no_clan' as const }] as const),
      ])
    )
    mocks.changeFindMany.mockResolvedValue(observations(3, 'clan.inconnu'))

    const summary = await runMembershipSyncPass()

    expect(summary.pendingClanRequests).toBe(0)
    expect(mocks.clanCreate).not.toHaveBeenCalled()
    expect(mocks.fetchClanById).not.toHaveBeenCalled()
  })
})

describe('Cas C — aucun clan détecté', () => {
  it('laisse le joueur dans le parking sans rien écrire', async () => {
    mocks.memberFindMany.mockResolvedValue([parkedMember()])
    mocks.fetchStates.mockResolvedValue(new Map([['account.vvila', { kind: 'no_clan' }]]))

    const summary = await runMembershipSyncPass()

    // Sans clan et deja au parking : c'est l'etat attendu, pas un ecart.
    expect(summary.discrepanciesFound).toBe(0)
    expect(summary.movementsPlanned).toBe(0)
    expect(mocks.clanCreate).not.toHaveBeenCalled()
  })
})

describe("Application différée à l'approbation du clan", () => {
  it('déplace les membres en attente et marque les lignes appliquées', async () => {
    mocks.changeFindMany.mockResolvedValue([
      {
        id: 'chg_1',
        clanMemberId: 11,
        pubgAccountId: 'account.vvila',
        platformShard: 'steam',
        previousClanId: UNG.id,
        previousPubgClanId: null,
        previousPubgClanTag: 'UNG',
        newPubgClanId: 'clan.inconnu',
        newPubgClanTag: 'NEW',
        clanMember: { id: 11, displayName: 'Vvila', clanId: UNG.id, isActive: true },
      },
    ])

    const applied = await applyPendingPromotionsForClan(999, 42)

    expect(applied).toEqual([{ memberId: 11, memberName: 'Vvila', fromClanId: UNG.id }])
    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: 11 }, data: { clanId: 999 } })
    expect(mocks.changeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'chg_1' } })
    )
  })

  it('clôt sans déplacer une ligne devenue caduque', async () => {
    mocks.changeFindMany.mockResolvedValue([
      {
        id: 'chg_2',
        clanMemberId: 11,
        pubgAccountId: 'account.vvila',
        platformShard: 'steam',
        previousClanId: UNG.id,
        previousPubgClanId: null,
        previousPubgClanTag: 'UNG',
        newPubgClanId: 'clan.inconnu',
        newPubgClanTag: 'NEW',
        // Le membre a ete retire entre la detection et l'approbation.
        clanMember: { id: 11, displayName: 'Vvila', clanId: UNG.id, isActive: false },
      },
    ])

    const applied = await applyPendingPromotionsForClan(999)

    expect(applied).toEqual([])
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
    expect(mocks.changeUpdate).toHaveBeenCalledWith({
      where: { id: 'chg_2' },
      data: { status: 'ignored' },
    })
  })

  it('ignore un membre déjà rattaché au clan approuvé', async () => {
    mocks.changeFindMany.mockResolvedValue([
      {
        id: 'chg_3',
        clanMemberId: 11,
        pubgAccountId: 'account.vvila',
        platformShard: 'steam',
        previousClanId: UNG.id,
        previousPubgClanId: null,
        previousPubgClanTag: 'UNG',
        newPubgClanId: 'clan.inconnu',
        newPubgClanTag: 'NEW',
        clanMember: { id: 11, displayName: 'Vvila', clanId: 999, isActive: true },
      },
    ])

    const applied = await applyPendingPromotionsForClan(999)

    expect(applied).toEqual([])
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })
})
