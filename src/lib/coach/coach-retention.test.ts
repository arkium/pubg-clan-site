import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  conversationDeleteMany: vi.fn(),
  conversationCount: vi.fn(),
  usageDeleteMany: vi.fn(),
  usageCount: vi.fn(),
  memoryDeleteMany: vi.fn(),
  memoryCount: vi.fn(),
  memberFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    coachConversation: { deleteMany: mocks.conversationDeleteMany, count: mocks.conversationCount },
    coachUsage: { deleteMany: mocks.usageDeleteMany, count: mocks.usageCount },
    coachMemory: { deleteMany: mocks.memoryDeleteMany, count: mocks.memoryCount },
    clanMember: { findMany: mocks.memberFindMany },
  },
}))

import {
  COACH_CONVERSATION_RETENTION_DAYS,
  COACH_USAGE_RETENTION_DAYS,
  purgeCoachHistoryForPubgName,
  purgeExpiredCoachHistory,
} from '@/lib/coach/coach-retention'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.memoryDeleteMany.mockResolvedValue({ count: 0 })
  mocks.memoryCount.mockResolvedValue(0)
})

describe('conservation de l’historique du Coach IA', () => {
  it('supprime les fils inactifs depuis 12 mois, l’usage de plus de 13 mois et les mémoires expirées', async () => {
    mocks.conversationDeleteMany.mockResolvedValue({ count: 3 })
    mocks.usageDeleteMany.mockResolvedValue({ count: 40 })
    mocks.memoryDeleteMany.mockResolvedValue({ count: 2 })
    const now = new Date('2026-10-24T01:15:00Z')

    expect(await purgeExpiredCoachHistory(now)).toEqual({ conversations: 3, usages: 40, memories: 2 })

    expect(COACH_CONVERSATION_RETENTION_DAYS).toBe(365)
    expect(COACH_USAGE_RETENTION_DAYS).toBe(395)
    expect(mocks.conversationDeleteMany).toHaveBeenCalledWith({
      where: { updatedAt: { lt: new Date('2025-10-24T01:15:00Z') } },
    })
    expect(mocks.usageDeleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2025-09-24T01:15:00Z') } },
    })
    // La mémoire porte sa propre échéance (90 jours après la dernière mise à jour, posée à l'écriture).
    expect(mocks.memoryDeleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } })
  })
})

describe('demande « Purger mon historique »', () => {
  const where = {
    byAccountOrMember: { OR: [{ userId: { in: [7] } }, { memberId: { in: [100, 101] } }] },
    usages: { userId: { in: [7] } },
  }

  it('simule sans rien supprimer : comptes liés au pseudo, fils, usage et mémoires comptés', async () => {
    mocks.memberFindMany.mockResolvedValue([
      { id: 100, identities: [{ userId: 7 }] },
      { id: 101, identities: [{ userId: 7 }] },
    ])
    mocks.conversationCount.mockResolvedValue(4)
    mocks.usageCount.mockResolvedValue(52)
    mocks.memoryCount.mockResolvedValue(3)

    expect(await purgeCoachHistoryForPubgName(' Arkium_FR ', { apply: false })).toEqual({ conversations: 4, usages: 52, memories: 3, userIds: [7], memberIds: [100, 101] })
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pubgPlayerName: 'Arkium_FR' } }))
    expect(mocks.conversationCount).toHaveBeenCalledWith({ where: where.byAccountOrMember })
    expect(mocks.usageCount).toHaveBeenCalledWith({ where: where.usages })
    expect(mocks.memoryCount).toHaveBeenCalledWith({ where: where.byAccountOrMember })
    expect(mocks.conversationDeleteMany).not.toHaveBeenCalled()
    expect(mocks.usageDeleteMany).not.toHaveBeenCalled()
    expect(mocks.memoryDeleteMany).not.toHaveBeenCalled()
  })

  it('applique : fils (messages en cascade), usage et mémoires des comptes liés, fils et mémoires des fiches aussi', async () => {
    mocks.memberFindMany.mockResolvedValue([
      { id: 100, identities: [{ userId: 7 }] },
      { id: 101, identities: [] },
    ])
    mocks.conversationDeleteMany.mockResolvedValue({ count: 4 })
    mocks.usageDeleteMany.mockResolvedValue({ count: 52 })
    mocks.memoryDeleteMany.mockResolvedValue({ count: 3 })

    expect(await purgeCoachHistoryForPubgName('Arkium_FR', { apply: true })).toEqual({ conversations: 4, usages: 52, memories: 3, userIds: [7], memberIds: [100, 101] })
    expect(mocks.conversationDeleteMany).toHaveBeenCalledWith({ where: where.byAccountOrMember })
    expect(mocks.usageDeleteMany).toHaveBeenCalledWith({ where: where.usages })
    expect(mocks.memoryDeleteMany).toHaveBeenCalledWith({ where: where.byAccountOrMember })
  })

  it('pseudo inconnu : rien à faire, aucune requête de suppression', async () => {
    mocks.memberFindMany.mockResolvedValue([])
    expect(await purgeCoachHistoryForPubgName('Inconnu', { apply: true })).toEqual({ conversations: 0, usages: 0, memories: 0, userIds: [], memberIds: [] })
    expect(mocks.conversationDeleteMany).not.toHaveBeenCalled()
    expect(mocks.conversationCount).not.toHaveBeenCalled()
    expect(mocks.memoryDeleteMany).not.toHaveBeenCalled()
  })
})
