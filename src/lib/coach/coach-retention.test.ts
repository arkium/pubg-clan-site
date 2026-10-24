import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  conversationDeleteMany: vi.fn(),
  conversationCount: vi.fn(),
  usageDeleteMany: vi.fn(),
  usageCount: vi.fn(),
  memberFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    coachConversation: { deleteMany: mocks.conversationDeleteMany, count: mocks.conversationCount },
    coachUsage: { deleteMany: mocks.usageDeleteMany, count: mocks.usageCount },
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
})

describe('conservation de l’historique du Coach IA', () => {
  it('supprime les fils inactifs depuis 12 mois et l’usage de plus de 13 mois', async () => {
    mocks.conversationDeleteMany.mockResolvedValue({ count: 3 })
    mocks.usageDeleteMany.mockResolvedValue({ count: 40 })
    const now = new Date('2026-10-24T01:15:00Z')

    expect(await purgeExpiredCoachHistory(now)).toEqual({ conversations: 3, usages: 40 })

    expect(COACH_CONVERSATION_RETENTION_DAYS).toBe(365)
    expect(COACH_USAGE_RETENTION_DAYS).toBe(395)
    expect(mocks.conversationDeleteMany).toHaveBeenCalledWith({
      where: { updatedAt: { lt: new Date('2025-10-24T01:15:00Z') } },
    })
    expect(mocks.usageDeleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2025-09-24T01:15:00Z') } },
    })
  })
})

describe('demande « Purger mon historique »', () => {
  const where = {
    conversations: { OR: [{ userId: { in: [7] } }, { memberId: { in: [100, 101] } }] },
    usages: { userId: { in: [7] } },
  }

  it('simule sans rien supprimer : comptes liés au pseudo, fils et usage comptés', async () => {
    mocks.memberFindMany.mockResolvedValue([
      { id: 100, identities: [{ userId: 7 }] },
      { id: 101, identities: [{ userId: 7 }] },
    ])
    mocks.conversationCount.mockResolvedValue(4)
    mocks.usageCount.mockResolvedValue(52)

    expect(await purgeCoachHistoryForPubgName(' Arkium_FR ', { apply: false })).toEqual({ conversations: 4, usages: 52, userIds: [7], memberIds: [100, 101] })
    expect(mocks.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pubgPlayerName: 'Arkium_FR' } }))
    expect(mocks.conversationCount).toHaveBeenCalledWith({ where: where.conversations })
    expect(mocks.usageCount).toHaveBeenCalledWith({ where: where.usages })
    expect(mocks.conversationDeleteMany).not.toHaveBeenCalled()
    expect(mocks.usageDeleteMany).not.toHaveBeenCalled()
  })

  it('applique : fils (messages en cascade) et usage des comptes liés, fils des fiches aussi', async () => {
    mocks.memberFindMany.mockResolvedValue([
      { id: 100, identities: [{ userId: 7 }] },
      { id: 101, identities: [] },
    ])
    mocks.conversationDeleteMany.mockResolvedValue({ count: 4 })
    mocks.usageDeleteMany.mockResolvedValue({ count: 52 })

    expect(await purgeCoachHistoryForPubgName('Arkium_FR', { apply: true })).toEqual({ conversations: 4, usages: 52, userIds: [7], memberIds: [100, 101] })
    expect(mocks.conversationDeleteMany).toHaveBeenCalledWith({ where: where.conversations })
    expect(mocks.usageDeleteMany).toHaveBeenCalledWith({ where: where.usages })
  })

  it('pseudo inconnu : rien à faire, aucune requête de suppression', async () => {
    mocks.memberFindMany.mockResolvedValue([])
    expect(await purgeCoachHistoryForPubgName('Inconnu', { apply: true })).toEqual({ conversations: 0, usages: 0, userIds: [], memberIds: [] })
    expect(mocks.conversationDeleteMany).not.toHaveBeenCalled()
    expect(mocks.conversationCount).not.toHaveBeenCalled()
  })
})
