import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cronExecution: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    squadMatch: {
      findMany: vi.fn(),
    },
    clan: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

vi.mock('@/lib/pubg-telemetry/manual-sync', () => ({
  enqueueTelemetryForSelectedSquadMatches: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { enqueueTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
import { getTelemetryRecoveriesStatus } from '@/lib/telemetry-recoveries-status'
import { getTelemetryBacklogSummary, enqueueTelemetryBacklog } from '@/lib/telemetry-recoveries-backlog'

const mockedPrisma = vi.mocked(prisma)
const mockedEnqueue = vi.mocked(enqueueTelemetryForSelectedSquadMatches)

describe('Telemetry Recoveries Services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getTelemetryRecoveriesStatus', () => {
    it('returns worker, queue and scheduler configuration', async () => {
      // Mock queue count calls from getTelemetryLiveSyncQueueStats
      mockedPrisma.cronExecution.count
        .mockResolvedValueOnce(15) // queued
        .mockResolvedValueOnce(2) // running
        .mockResolvedValueOnce(120) // success
        .mockResolvedValueOnce(3) // failed

      const status = await getTelemetryRecoveriesStatus()

      expect(status.queue).toEqual({
        queued: 15,
        running: 2,
        remaining: 17,
        success: 120,
        failed: 3,
        total: 140,
      })
      expect(typeof status.scheduler.syncEnabled).toBe('boolean')
      expect(typeof status.scheduler.maxMatchesPerRun).toBe('number')
      expect(typeof status.scheduler.nextDailySyncEstimate).toBe('string')
    })
  })

  describe('getTelemetryBacklogSummary', () => {
    it('calculates global and per-clan backlog, completion rate and urgencies', async () => {
      // 1. Mock active jobs in queue
      mockedPrisma.cronExecution.findMany.mockResolvedValueOnce([
        { clanId: 1, details: { squadMatchId: 'squad_queued_1' } },
      ] as any)

      // 2. Mock raw aggregation query
      mockedPrisma.$queryRaw.mockResolvedValueOnce([
        {
          clanId: 1,
          totalMatches: 100,
          completedMatches: 80,
          expiredMatches: 10,
          recoverableBacklog: 10,
          urgentBacklog: 3,
        },
      ] as any)

      // 3. Mock clan findMany
      mockedPrisma.clan.findMany.mockResolvedValueOnce([
        { id: 1, name: 'Clan Alpha', tag: 'ALP' },
      ] as any)

      const summary = await getTelemetryBacklogSummary()

      expect(summary.totalMatches).toBe(100)
      expect(summary.completedMatches).toBe(80)
      expect(summary.expiredMatches).toBe(10)
      expect(summary.recoverableBacklog).toBe(10)
      expect(summary.urgentBacklog).toBe(3)
      // Completion rate: 80 / (100 - 10) = 80/90 = 88.9%
      expect(summary.completionRate).toBe(88.9)

      expect(summary.clans).toHaveLength(1)
      expect(summary.clans[0]).toMatchObject({
        clanId: 1,
        clanName: 'Clan Alpha',
        clanTag: 'ALP',
        totalMatches: 100,
        completedMatches: 80,
        expiredMatches: 10,
        recoverableBacklog: 10,
        urgentBacklog: 3,
        inQueueCount: 1,
        toQueueCount: 9,
        completionRate: 88.9,
      })
    })
  })

  describe('enqueueTelemetryBacklog', () => {
    it('enqueues eligible backlog matches and batches by clan', async () => {
      mockedPrisma.cronExecution.findMany.mockResolvedValueOnce([])

      mockedPrisma.squadMatch.findMany.mockResolvedValueOnce([
        {
          id: 'sm_1',
          createdAt: new Date(),
          members: [{ member: { clanId: 1 } }],
        },
        {
          id: 'sm_2',
          createdAt: new Date(),
          members: [{ member: { clanId: 1 } }],
        },
      ] as any)

      mockedEnqueue.mockResolvedValueOnce({
        requestedCount: 2,
        selectedCount: 2,
        queuedCount: 2,
        alreadyQueuedCount: 0,
        skippedCount: 0,
        results: [],
      })

      const result = await enqueueTelemetryBacklog({ clanId: 1, urgentOnly: false })

      expect(result).toEqual({
        requestedCount: 2,
        queuedCount: 2,
        alreadyQueuedCount: 0,
        skippedCount: 0,
        clansCount: 1,
      })
      expect(mockedEnqueue).toHaveBeenCalledWith(1, ['sm_1', 'sm_2'], undefined)
    })
  })
})
