import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Chantier 1 — passage de synchronisation d'appartenance.
 *
 * Les scénarios vérifient surtout que les garde-fous de « Sûreté d'exécution »
 * sont réellement câblés : verrou de run (D), mode observation (B), coupe-circuit
 * et confirmations multiples (A), transaction mouvement + trace (C).
 */

const mocks = vi.hoisted(() => ({
  syncOpponentIdentity: vi.fn(),
  runFindFirst: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
  memberFindMany: vi.fn(),
  memberUpdate: vi.fn(),
  clanFindMany: vi.fn(),
  changeFindMany: vi.fn(),
  changeFindFirst: vi.fn(),
  changeUpdateMany: vi.fn(),
  changeCreate: vi.fn(),
  fetchStates: vi.fn(),
  getMode: vi.fn(),
  getConfirmations: vi.fn(),
  getMaxRatio: vi.fn(),
  getAutoPromote: vi.fn(),
  fetchClanById: vi.fn(),
  clanFindFirst: vi.fn(),
  clanCreate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const tx = {
    clanMember: { update: mocks.memberUpdate },
    playerClanChange: { updateMany: mocks.changeUpdateMany, create: mocks.changeCreate },
  }
  return {
    prisma: {
      clanLifecycleRun: {
        findFirst: mocks.runFindFirst,
        create: mocks.runCreate,
        update: mocks.runUpdate,
        updateMany: vi.fn(),
      },
      clanMember: { findMany: mocks.memberFindMany, update: mocks.memberUpdate },
      clan: { findMany: mocks.clanFindMany, findFirst: mocks.clanFindFirst, create: mocks.clanCreate },
      playerClanChange: {
        findMany: mocks.changeFindMany,
        // Dédoublonnage de la trace « clan archivé » (docs/TODO/clan-archive.md).
        findFirst: mocks.changeFindFirst,
        updateMany: mocks.changeUpdateMany,
        create: mocks.changeCreate,
      },
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
    },
  }
})

vi.mock('@/lib/clan-lifecycle/clan-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/clan-lifecycle/clan-state')>()
  return { ...actual, fetchPlayersClanStates: mocks.fetchStates }
})

// Les mocks listent les exports un par un : tout export utilise par le code teste
// doit figurer ici, sinon vitest leve « No export is defined on the mock ».
// Le miroir adversaire (Player/EncounteredPlayer) suit chaque mouvement applique :
// il est mocke ici pour verifier l'appel sans toucher a Prisma.
vi.mock('@/lib/player-clan-identity', () => ({
  syncOpponentIdentityForMemberId: mocks.syncOpponentIdentity,
}))

vi.mock('@/lib/clan-lifecycle/config', () => ({
  getClanLifecycleMode: mocks.getMode,
  getConfirmationsRequired: mocks.getConfirmations,
  getMaxMovesRatioPercent: mocks.getMaxRatio,
  getUngroupedAutoPromote: mocks.getAutoPromote,
}))

vi.mock('@/lib/pubg', () => ({ fetchPubgClanById: mocks.fetchClanById }))

vi.mock('@/lib/notification-service', () => ({
  notifyClanCreationRequest: vi.fn(async () => undefined),
}))

import { describeDiscrepancy, runMembershipSyncPass } from '@/lib/clan-lifecycle/membership-sync'

const SMK = { id: 1, tag: 'SMK', pubgClanId: 'clan.smk', isSystem: false, platformShard: 'steam' }
const KMS = { id: 180, tag: 'KMS', pubgClanId: 'clan.kms', isSystem: false, platformShard: 'steam' }
const UNG = { id: 201, tag: 'UNG', pubgClanId: null, isSystem: true, platformShard: 'steam' }

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    displayName: 'Vvila',
    pubgAccountId: 'account.vvila',
    platformShard: 'steam',
    clanId: SMK.id,
    clan: { tag: SMK.tag, pubgClanId: SMK.pubgClanId, isSystem: false },
    ...overrides,
  }
}

/**
 * Membres conformes servant de fond : sans eux, un seul mouvement represente 100 %
 * de l'effectif et fait legitimement sauter le coupe-circuit.
 */
function fillerMembers(count: number) {
  return Array.from({ length: count }, (_, i) =>
    member({ id: 500 + i, pubgAccountId: `account.filler${i}`, displayName: `Filler${i}` })
  )
}

function fillerStates(members: ReturnType<typeof fillerMembers>) {
  return members.map(
    (m) => [m.pubgAccountId, { kind: 'has_clan' as const, clanId: SMK.pubgClanId }] as const
  )
}

/** Historique d'observations deja confirmees (N-1 lignes), du plus ancien au plus recent. */
function priorObservations(count: number, newPubgClanId: string | null) {
  return Array.from({ length: count }, (_, i) => ({
    newPubgClanId,
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
  mocks.changeCreate.mockResolvedValue({ id: 'chg' })
  mocks.changeFindMany.mockResolvedValue([])
  mocks.changeFindFirst.mockResolvedValue(null)
  mocks.clanFindMany.mockResolvedValue([SMK, KMS, UNG])
  mocks.getMode.mockResolvedValue('apply')
  mocks.getConfirmations.mockResolvedValue(3)
  mocks.getMaxRatio.mockResolvedValue(10)
  mocks.getAutoPromote.mockResolvedValue(true)
  mocks.clanFindFirst.mockResolvedValue(null)
  mocks.clanCreate.mockResolvedValue({ id: 999, name: 'X', tag: 'X' })
  mocks.fetchClanById.mockResolvedValue(null)
})

describe('describeDiscrepancy — comparaison état observé / clan du site', () => {
  const inSmk = { clanPubgId: 'clan.smk', clanIsSystem: false }
  const inUng = { clanPubgId: null, clanIsSystem: true }

  it('ne conclut rien sur un état incertain', () => {
    expect(describeDiscrepancy(inSmk, { kind: 'unknown', reason: 'request_failed' })).toBeNull()
  })

  it('considère conforme un joueur sans clan déjà dans le clan technique', () => {
    expect(describeDiscrepancy(inUng, { kind: 'no_clan' })).toBeNull()
  })

  it('signale un joueur sans clan encore rattaché à un clan suivi', () => {
    expect(describeDiscrepancy(inSmk, { kind: 'no_clan' })).toEqual({
      targetKind: 'system',
      targetPubgClanId: null,
    })
  })

  it('considère conforme un joueur dont le clan PUBG correspond', () => {
    expect(describeDiscrepancy(inSmk, { kind: 'has_clan', clanId: 'clan.smk' })).toBeNull()
  })

  it('signale un changement vers un autre clan', () => {
    expect(describeDiscrepancy(inSmk, { kind: 'has_clan', clanId: 'clan.kms' })).toEqual({
      targetKind: 'tracked',
      targetPubgClanId: 'clan.kms',
    })
  })
})

describe('Garde-fou D — verrou de run', () => {
  it('refuse de démarrer si un passage est déjà en cours', async () => {
    mocks.runFindFirst.mockResolvedValue({ id: 'run_en_cours', startedAt: new Date() })

    const summary = await runMembershipSyncPass()

    expect(summary.status).toBe('skipped')
    expect(summary.message).toMatch(/deja en cours/i)
    expect(mocks.runCreate).not.toHaveBeenCalled()
    expect(mocks.fetchStates).not.toHaveBeenCalled()
  })
})

describe('Garde-fou A — rien ne bouge sans N confirmations', () => {
  it('écrit une observation mais ne déplace personne à la première divergence', async () => {
    mocks.memberFindMany.mockResolvedValue([member()])
    mocks.fetchStates.mockResolvedValue(new Map([['account.vvila', { kind: 'no_clan' }]]))
    // Une seule observation en base : celle qu'on vient d'ecrire.
    mocks.changeFindMany.mockResolvedValue(priorObservations(1, null))

    const summary = await runMembershipSyncPass()

    expect(summary.discrepanciesFound).toBe(1)
    expect(summary.awaitingConfirmation).toBe(1)
    expect(summary.movementsPlanned).toBe(0)
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('déplace vers le clan technique une fois la série confirmée', async () => {
    const filler = fillerMembers(19)
    mocks.memberFindMany.mockResolvedValue([member(), ...filler])
    mocks.fetchStates.mockResolvedValue(
      new Map([['account.vvila', { kind: 'no_clan' }], ...fillerStates(filler)])
    )
    mocks.changeFindMany.mockResolvedValue(priorObservations(3, null))

    const summary = await runMembershipSyncPass()

    expect(summary.circuitBreakerTripped).toBe(false)
    expect(summary.movementsPlanned).toBe(1)
    expect(summary.movementsApplied).toBe(1)
    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: 11 }, data: { clanId: UNG.id } })

    const applied = mocks.changeCreate.mock.calls.map((c) => c[0].data).find((d) => d.status === 'applied')
    expect(applied).toMatchObject({ source: 'auto_demotion', newClanId: UNG.id, runId: 'run_1' })
  })

  it('transfère vers un clan suivi quand le clan détecté est connu', async () => {
    const filler = fillerMembers(19)
    mocks.memberFindMany.mockResolvedValue([member(), ...filler])
    mocks.fetchStates.mockResolvedValue(
      new Map([
        ['account.vvila', { kind: 'has_clan', clanId: 'clan.kms' }],
        ...fillerStates(filler),
      ])
    )
    mocks.changeFindMany.mockResolvedValue(priorObservations(3, 'clan.kms'))

    const summary = await runMembershipSyncPass()

    expect(summary.movementsApplied).toBe(1)
    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: 11 }, data: { clanId: KMS.id } })
    // Regression WESTEN88 (2026-09-22) : le miroir adversaire doit suivre, sinon
    // `/settings/opponents` continue de rattacher le joueur a son ancien clan.
    expect(mocks.syncOpponentIdentity).toHaveBeenCalledWith(11)

    const applied = mocks.changeCreate.mock.calls.map((c) => c[0].data).find((d) => d.status === 'applied')
    expect(applied).toMatchObject({ source: 'auto_transfer', newClanId: KMS.id })
  })

  it('envoie au parking un joueur parti vers un clan non suivi', async () => {
    const filler = fillerMembers(19)
    mocks.memberFindMany.mockResolvedValue([member(), ...filler])
    mocks.fetchStates.mockResolvedValue(
      new Map([
        ['account.vvila', { kind: 'has_clan', clanId: 'clan.inconnu' }],
        ...fillerStates(filler),
      ])
    )
    mocks.changeFindMany.mockResolvedValue(priorObservations(3, 'clan.inconnu'))

    const summary = await runMembershipSyncPass()

    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: 11 }, data: { clanId: UNG.id } })
    const applied = mocks.changeCreate.mock.calls.map((c) => c[0].data).find((d) => d.status === 'applied')
    expect(applied?.source).toBe('auto_demotion')
    expect(summary.movementsApplied).toBe(1)
  })
})

describe('Garde-fou A — un état incertain ne produit rien', () => {
  it('ne compte ni divergence ni observation', async () => {
    mocks.memberFindMany.mockResolvedValue([member()])
    mocks.fetchStates.mockResolvedValue(
      new Map([['account.vvila', { kind: 'unknown', reason: 'missing_from_response' }]])
    )

    const summary = await runMembershipSyncPass()

    expect(summary.statesUnknown).toBe(1)
    expect(summary.discrepanciesFound).toBe(0)
    expect(mocks.changeCreate).not.toHaveBeenCalled()
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })
})

describe("Remise à zéro de la série quand l'observation redevient conforme", () => {
  it('clôt les observations ouvertes sans rien déplacer', async () => {
    mocks.memberFindMany.mockResolvedValue([member()])
    mocks.fetchStates.mockResolvedValue(
      new Map([['account.vvila', { kind: 'has_clan', clanId: 'clan.smk' }]])
    )

    const summary = await runMembershipSyncPass()

    expect(summary.discrepanciesFound).toBe(0)
    expect(mocks.changeUpdateMany).toHaveBeenCalledWith({
      where: { clanMemberId: 11, status: 'observed' },
      data: { status: 'ignored' },
    })
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })
})

describe('Garde-fou B — mode observation', () => {
  it('identifie les mouvements sans en appliquer aucun', async () => {
    mocks.getMode.mockResolvedValue('observe')
    const filler = fillerMembers(19)
    mocks.memberFindMany.mockResolvedValue([member(), ...filler])
    mocks.fetchStates.mockResolvedValue(
      new Map([['account.vvila', { kind: 'no_clan' }], ...fillerStates(filler)])
    )
    mocks.changeFindMany.mockResolvedValue(priorObservations(3, null))

    const summary = await runMembershipSyncPass()

    expect(summary.movementsPlanned).toBe(1)
    expect(summary.movementsApplied).toBe(0)
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
    expect(summary.message).toMatch(/observation/i)
  })
})

describe('Garde-fou A — coupe-circuit', () => {
  it("abandonne le passage sans rien appliquer quand trop de membres bougeraient", async () => {
    const members = Array.from({ length: 4 }, (_, i) =>
      member({ id: 100 + i, pubgAccountId: `account.${i}`, displayName: `J${i}` })
    )
    mocks.memberFindMany.mockResolvedValue(members)
    mocks.fetchStates.mockResolvedValue(
      new Map(members.map((m) => [m.pubgAccountId, { kind: 'no_clan' as const }]))
    )
    mocks.changeFindMany.mockResolvedValue(priorObservations(3, null))
    // 4 mouvements sur 4 membres = 100 %, tres au-dessus du seuil de 10 %.

    const summary = await runMembershipSyncPass()

    expect(summary.circuitBreakerTripped).toBe(true)
    expect(summary.status).toBe('aborted')
    expect(summary.movementsPlanned).toBe(4)
    expect(summary.movementsApplied).toBe(0)
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
    expect(summary.message).toMatch(/coupe-circuit/i)
  })
})

describe('Journal du passage', () => {
  it('clôt le run avec ses compteurs', async () => {
    mocks.memberFindMany.mockResolvedValue([member()])
    mocks.fetchStates.mockResolvedValue(
      new Map([['account.vvila', { kind: 'has_clan', clanId: 'clan.smk' }]])
    )

    await runMembershipSyncPass()

    const update = mocks.runUpdate.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'run_1' })
    expect(update.data).toMatchObject({ status: 'success', membersScanned: 1, statesHasClan: 1 })
    expect(update.data.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('marque le run en échec et remonte le message', async () => {
    mocks.memberFindMany.mockRejectedValue(new Error('base indisponible'))

    const summary = await runMembershipSyncPass()

    expect(summary.status).toBe('failed')
    expect(summary.message).toBe('base indisponible')
    expect(mocks.runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
    )
  })
})

describe('Clan archivé — ni cible, ni nouvelle demande (docs/TODO/clan-archive.md)', () => {
  const ARCHIVED = {
    id: 300,
    tag: 'OLD',
    pubgClanId: 'clan.old',
    platformShard: 'steam',
    archivedAt: new Date('2026-09-25T10:00:00.000Z'),
  }

  // La requête des clans archivés filtre sur `archivedAt` ; les autres reçoivent les clans actifs.
  function withArchivedClan() {
    mocks.clanFindMany.mockImplementation(async (args: { where?: { archivedAt?: unknown } }) =>
      args?.where?.archivedAt ? [ARCHIVED] : [SMK, KMS, UNG]
    )
  }

  const parkedMember = () =>
    member({ clanId: UNG.id, clan: { tag: UNG.tag, pubgClanId: null, isSystem: true } })

  it('un joueur du parking resté dans un clan archivé : pas d’écart, une seule trace `ignored`', async () => {
    withArchivedClan()
    mocks.memberFindMany.mockResolvedValue([parkedMember()])
    mocks.fetchStates.mockResolvedValue(new Map([['account.vvila', { kind: 'has_clan', clanId: 'clan.old' }]]))

    const summary = await runMembershipSyncPass()

    expect(summary.discrepanciesFound).toBe(0)
    expect(summary.archivedClanDestinations).toBe(1)
    // La série d'observations ouverte est close…
    expect(mocks.changeUpdateMany).toHaveBeenCalledWith({
      where: { clanMemberId: 11, status: 'observed' },
      data: { status: 'ignored' },
    })
    // … et une trace unique, datée depuis l'archivage, est écrite.
    expect(mocks.changeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ newClanId: 300, status: 'ignored', detectedAt: { gte: ARCHIVED.archivedAt } }),
      })
    )
    expect(mocks.changeCreate).toHaveBeenCalledTimes(1)
    expect(mocks.changeCreate.mock.calls[0][0].data).toMatchObject({
      clanMemberId: 11,
      newClanId: 300,
      newPubgClanId: 'clan.old',
      source: 'player_sync',
      status: 'ignored',
      runId: 'run_1',
    })
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
    expect(mocks.clanFindFirst).not.toHaveBeenCalled()
    expect(mocks.fetchClanById).not.toHaveBeenCalled()
  })

  it('n’écrit pas la trace une seconde fois pour le même archivage', async () => {
    withArchivedClan()
    mocks.memberFindMany.mockResolvedValue([parkedMember()])
    mocks.fetchStates.mockResolvedValue(new Map([['account.vvila', { kind: 'has_clan', clanId: 'clan.old' }]]))
    mocks.changeFindFirst.mockResolvedValue({ id: 'chg-old' })

    const summary = await runMembershipSyncPass()

    expect(summary.archivedClanDestinations).toBe(1)
    expect(mocks.changeCreate).not.toHaveBeenCalled()
  })

  it('un membre parti d’un clan suivi vers un clan archivé part au parking, sans nouvelle demande', async () => {
    withArchivedClan()
    const filler = fillerMembers(19)
    mocks.memberFindMany.mockResolvedValue([member(), ...filler])
    mocks.fetchStates.mockResolvedValue(
      new Map([['account.vvila', { kind: 'has_clan', clanId: 'clan.old' }], ...fillerStates(filler)])
    )
    mocks.changeFindMany.mockResolvedValue(priorObservations(3, 'clan.old'))

    const summary = await runMembershipSyncPass()

    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: 11 }, data: { clanId: UNG.id } })
    const applied = mocks.changeCreate.mock.calls.map((c) => c[0].data).find((d) => d.status === 'applied')
    expect(applied?.source).toBe('auto_demotion')
    // Ni recherche du clan en base, ni appel PUBG, ni demande de validation.
    expect(summary.pendingClanRequests).toBe(0)
    expect(mocks.clanFindFirst).not.toHaveBeenCalled()
    expect(mocks.fetchClanById).not.toHaveBeenCalled()
  })
})
