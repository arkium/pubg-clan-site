import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cronExecution: { updateMany: vi.fn() },
    encounteredPlayerResolutionRun: { updateMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { ORPHANED_RUN_THRESHOLD_HOURS, finalizeOrphanedRuns } from '@/lib/db-maintenance'

describe('finalizeOrphanedRuns', () => {
  const now = new Date('2026-09-15T01:15:00Z')

  beforeEach(() => {
    vi.mocked(prisma.cronExecution.updateMany).mockReset().mockResolvedValue({ count: 32 } as never)
    vi.mocked(prisma.encounteredPlayerResolutionRun.updateMany).mockReset().mockResolvedValue({ count: 21 } as never)
  })

  it('clôt en échec les runs « running » plus anciens que le seuil, sans rien supprimer', async () => {
    const result = await finalizeOrphanedRuns({ now })

    expect(result).toEqual({ cronExecutions: 32, resolutionRuns: 21 })
    const expectedCutoff = new Date(now.getTime() - ORPHANED_RUN_THRESHOLD_HOURS * 60 * 60 * 1000)
    expect(prisma.cronExecution.updateMany).toHaveBeenCalledWith({
      where: { status: 'running', startedAt: { lt: expectedCutoff } },
      data: expect.objectContaining({ status: 'failed', finishedAt: now }),
    })
    expect(prisma.encounteredPlayerResolutionRun.updateMany).toHaveBeenCalledWith({
      where: { status: 'running', startedAt: { lt: expectedCutoff } },
      data: expect.objectContaining({ status: 'failed', finishedAt: now, errorMessage: expect.stringContaining('Interrompu') }),
    })
  })

  it('ne touche jamais aux runs récents : le seuil par défaut dépasse la plus longue exécution observée', () => {
    // daily_sync : 77 min au pire ; résolution des adversaires : 46 min.
    expect(ORPHANED_RUN_THRESHOLD_HOURS * 60).toBeGreaterThan(77 * 2)
  })
})
