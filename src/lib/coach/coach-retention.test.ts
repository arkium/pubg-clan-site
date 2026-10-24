import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  conversationDeleteMany: vi.fn(),
  usageDeleteMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    coachConversation: { deleteMany: mocks.conversationDeleteMany },
    coachUsage: { deleteMany: mocks.usageDeleteMany },
  },
}))

import { COACH_CONVERSATION_RETENTION_DAYS, COACH_USAGE_RETENTION_DAYS, purgeExpiredCoachHistory } from '@/lib/coach/coach-retention'

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
