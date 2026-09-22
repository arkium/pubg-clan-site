import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Garde-fou E — sémantique d'annulation, et purge du clan technique (chantier 5).
 *
 * L'annulation est la partie du journal qui peut faire des dégâts : restaurer un
 * état périmé est pire que ne rien faire. Les trois refus testés ici sont donc au
 * moins aussi importants que le succès.
 */

const mocks = vi.hoisted(() => ({
  syncOpponentIdentity: vi.fn(),
  changeFindUnique: vi.fn(),
  changeFindFirst: vi.fn(),
  changeUpdate: vi.fn(),
  changeCreate: vi.fn(),
  memberUpdate: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindUnique: vi.fn(),
  memberUpdateMany: vi.fn(),
  getArchiveDays: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const tx = {
    clanMember: { update: mocks.memberUpdate },
    playerClanChange: { update: mocks.changeUpdate, create: mocks.changeCreate },
  }
  return {
    prisma: {
      playerClanChange: {
        findUnique: mocks.changeFindUnique,
        findFirst: mocks.changeFindFirst,
        update: mocks.changeUpdate,
        create: mocks.changeCreate,
      },
      clanMember: {
        update: mocks.memberUpdate,
        findMany: mocks.memberFindMany,
        findUnique: mocks.memberFindUnique,
        updateMany: mocks.memberUpdateMany,
      },
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
    },
  }
})

// Le miroir adversaire (Player/EncounteredPlayer) suit chaque mouvement : il est
// mocké ici pour vérifier qu'il est bien appelé, sans toucher à Prisma.
vi.mock('@/lib/player-clan-identity', () => ({
  syncOpponentIdentityForMemberId: mocks.syncOpponentIdentity,
}))

vi.mock('@/lib/clan-lifecycle/config', () => ({
  getUngroupedArchiveAfterDays: mocks.getArchiveDays,
}))

import { revertPlayerClanChange } from '@/lib/clan-lifecycle/revert'
import {
  archiveMembers,
  listUngroupedMembers,
  reactivateArchivedMember,
  selectArchiveCandidates,
  type ArchiveCandidate,
} from '@/lib/clan-lifecycle/ungrouped-archive'

const BASE_DATE = new Date('2026-09-20T12:00:00Z')

function change(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chg_1',
    status: 'applied',
    clanMemberId: 11,
    pubgAccountId: 'account.vvila',
    platformShard: 'steam',
    previousClanId: 1,
    previousPubgClanId: 'clan.smk',
    previousPubgClanTag: 'SMK',
    newClanId: 201,
    newPubgClanId: null,
    newPubgClanTag: 'UNG',
    appliedAt: BASE_DATE,
    detectedAt: BASE_DATE,
    clanMember: { id: 11, displayName: 'Vvila', clanId: 201, isActive: true },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.changeFindFirst.mockResolvedValue(null)
  mocks.changeUpdate.mockResolvedValue({})
  mocks.changeCreate.mockResolvedValue({ id: 'chg_inverse' })
  mocks.memberUpdate.mockResolvedValue({})
  mocks.memberUpdateMany.mockResolvedValue({ count: 0 })
  mocks.getArchiveDays.mockResolvedValue(90)
})

describe('Garde-fou E — ce que l’annulation refuse', () => {
  it('refuse un mouvement qui n’a jamais été appliqué', async () => {
    mocks.changeFindUnique.mockResolvedValue(change({ status: 'observed' }))

    const result = await revertPlayerClanChange('chg_1')

    expect(result).toMatchObject({ ok: false, reason: 'not_applied' })
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('refuse quand un mouvement plus récent existe — règle anti-écrasement', async () => {
    mocks.changeFindUnique.mockResolvedValue(change())
    mocks.changeFindFirst.mockResolvedValue({ id: 'chg_2', detectedAt: new Date() })

    const result = await revertPlayerClanChange('chg_1')

    expect(result).toMatchObject({ ok: false, reason: 'superseded' })
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('refuse quand le clan actuel ne correspond plus à ce mouvement', async () => {
    // Le membre a ete deplace autrement depuis : restaurer serait deviner.
    mocks.changeFindUnique.mockResolvedValue(
      change({ clanMember: { id: 11, displayName: 'Vvila', clanId: 7, isActive: true } })
    )

    const result = await revertPlayerClanChange('chg_1')

    expect(result).toMatchObject({ ok: false, reason: 'state_mismatch' })
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('refuse un membre qui n’est plus suivi', async () => {
    mocks.changeFindUnique.mockResolvedValue(
      change({ clanMember: { id: 11, displayName: 'Vvila', clanId: 201, isActive: false } })
    )

    const result = await revertPlayerClanChange('chg_1')

    expect(result).toMatchObject({ ok: false, reason: 'member_missing' })
  })

  it('refuse un mouvement sans clan d’origine connu', async () => {
    mocks.changeFindUnique.mockResolvedValue(change({ previousClanId: null }))

    const result = await revertPlayerClanChange('chg_1')

    expect(result).toMatchObject({ ok: false, reason: 'no_previous_clan' })
  })

  it('refuse un identifiant inconnu', async () => {
    mocks.changeFindUnique.mockResolvedValue(null)

    expect(await revertPlayerClanChange('inexistant')).toMatchObject({
      ok: false,
      reason: 'not_found',
    })
  })
})

describe('Garde-fou E — ce que l’annulation fait', () => {
  it('restaure le clan précédent, marque l’original et écrit une ligne inverse', async () => {
    mocks.changeFindUnique.mockResolvedValue(change())

    const result = await revertPlayerClanChange('chg_1', 42)

    expect(result).toMatchObject({ ok: true, memberId: 11, restoredClanId: 1 })
    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: 11 }, data: { clanId: 1 } })

    // Rien n'est efface : l'original passe a `reverted`...
    expect(mocks.changeUpdate).toHaveBeenCalledWith({
      where: { id: 'chg_1' },
      data: { status: 'reverted' },
    })

    // ...et une ligne inverse est ecrite, dans le bon sens.
    const inverse = mocks.changeCreate.mock.calls[0][0].data
    expect(inverse).toMatchObject({
      source: 'manual_revert',
      status: 'applied',
      previousClanId: 201,
      newClanId: 1,
      triggeredByUserId: 42,
    })

    // Le miroir adversaire suit l'annulation comme il suit le mouvement : sans
    // cet appel, `/settings/opponents` resterait sur le clan annule.
    expect(mocks.syncOpponentIdentity).toHaveBeenCalledWith(11)
  })
})

describe('Chantier 5 — sélection des candidats à l’archivage', () => {
  function candidate(inactiveDays: number | null, id = 1): ArchiveCandidate {
    return {
      memberId: id,
      displayName: `J${id}`,
      pubgPlayerName: `J${id}`,
      platformShard: 'steam',
      lastMatchAt: inactiveDays === null ? null : new Date(),
      inactiveDays,
      eligibleAt: null,
    }
  }

  it('retient les inactifs au-delà du seuil, pas ceux en deçà', () => {
    const selected = selectArchiveCandidates(
      [candidate(120, 1), candidate(90, 2), candidate(89, 3), candidate(10, 4)],
      90
    )

    // 90 jours pile est atteint, donc eligible ; 89 ne l'est pas.
    expect(selected.map((c) => c.memberId)).toEqual([1, 2])
  })

  it('retient un membre qui n’a jamais joué', () => {
    const selected = selectArchiveCandidates([candidate(null, 5)], 90)

    expect(selected.map((c) => c.memberId)).toEqual([5])
  })

  it('calcule la date d’éligibilité pour que l’UI puisse la montrer', async () => {
    const lastMatch = new Date('2026-06-01T00:00:00Z')
    mocks.memberFindMany.mockResolvedValue([
      {
        id: 1,
        displayName: 'Vvila',
        pubgPlayerName: 'Vvila',
        platformShard: 'steam',
        lastMatchAt: lastMatch,
      },
    ])

    const { members, thresholdDays } = await listUngroupedMembers({ thresholdDays: 30 })

    expect(thresholdDays).toBe(30)
    expect(members[0].eligibleAt?.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })
})

describe('Chantier 5 — archivage et réactivation', () => {
  it('n’archive que des membres réellement dans un clan système', async () => {
    // Un identifiant errant ne doit pas permettre d'archiver un membre d'un clan suivi.
    mocks.memberFindMany.mockResolvedValue([])

    const result = await archiveMembers([11, 12])

    expect(result).toEqual({ archived: 0 })
    expect(mocks.memberUpdateMany).not.toHaveBeenCalled()
  })

  it('archive en posant la raison, pour distinguer d’un arrêt de suivi', async () => {
    mocks.memberFindMany.mockResolvedValue([{ id: 11 }])
    mocks.memberUpdateMany.mockResolvedValue({ count: 1 })

    const result = await archiveMembers([11], 42)

    expect(result).toEqual({ archived: 1 })
    const args = mocks.memberUpdateMany.mock.calls[0][0]
    expect(args.data).toMatchObject({ isActive: false, archivedReason: 'ungrouped_inactive' })
    expect(args.data.archivedAt).toBeInstanceOf(Date)
  })

  it('ne fait rien sur une liste vide', async () => {
    expect(await archiveMembers([])).toEqual({ archived: 0 })
    expect(mocks.memberFindMany).not.toHaveBeenCalled()
  })

  it('réactive un membre archivé', async () => {
    mocks.memberFindUnique.mockResolvedValue({
      id: 11,
      isActive: false,
      archivedReason: 'ungrouped_inactive',
    })

    expect(await reactivateArchivedMember(11)).toEqual({ reactivated: true })
    expect(mocks.memberUpdate).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { isActive: true, archivedAt: null, archivedReason: null },
    })
  })

  it('ne réactive pas un arrêt de suivi ordinaire', async () => {
    // isActive: false sans raison d'archivage = arret de suivi decide par un humain.
    mocks.memberFindUnique.mockResolvedValue({ id: 11, isActive: false, archivedReason: null })

    expect(await reactivateArchivedMember(11)).toEqual({ reactivated: false })
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })
})
