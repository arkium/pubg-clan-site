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
      findUnique: vi.fn(),
    },
    cronSchedule: {
      findUnique: vi.fn(),
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
import {
  enqueueTelemetryBacklog,
  getClanTelemetryBacklog,
  getTelemetryBacklogSummary,
} from '@/lib/telemetry-recoveries-backlog'

const mockedPrisma = vi.mocked(prisma)
const mockedEnqueue = vi.mocked(enqueueTelemetryForSelectedSquadMatches)

describe('Telemetry Recoveries Services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Le service chaîne `.catch()` sur cet appel : sans valeur de retour, le
    // mock renvoie undefined et la chaîne casse. Null = aucune surcharge de
    // planification en base, donc l'expression cron par défaut s'applique.
    mockedPrisma.cronSchedule.findUnique.mockResolvedValue(null)
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

  describe('getClanTelemetryBacklog', () => {
    const ROW = {
      clanId: 7,
      totalMatches: 40,
      completedMatches: 30,
      expiredMatches: 4,
      recoverableBacklog: 6,
      urgentBacklog: 2,
    }

    it('ne lit que le clan demandé : file et agrégat filtrés sur lui', async () => {
      mockedPrisma.cronExecution.findMany.mockResolvedValueOnce([
        { clanId: 7, details: { squadMatchId: 'sm_queued' } },
        { clanId: 7, details: { squadMatchId: 'sm_running' } },
      ] as never)
      mockedPrisma.$queryRaw.mockResolvedValueOnce([ROW] as never)
      mockedPrisma.clan.findUnique.mockResolvedValueOnce({ name: 'Clan Sept', tag: 'SEPT' } as never)

      const stat = await getClanTelemetryBacklog(7)

      expect(mockedPrisma.cronExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ clanId: 7 }) })
      )
      // Le filtre du clan est un paramètre de la requête, pas tous les clans (`IS NOT NULL`).
      const query = mockedPrisma.$queryRaw.mock.calls[0][0] as unknown as { sql: string; values: unknown[] }
      expect(query.values).toContain(7)
      expect(query.sql).not.toContain('IS NOT NULL')
      expect(mockedPrisma.clan.findMany).not.toHaveBeenCalled()

      expect(stat).toEqual({
        clanId: 7,
        clanName: 'Clan Sept',
        clanTag: 'SEPT',
        totalMatches: 40,
        completedMatches: 30,
        expiredMatches: 4,
        recoverableBacklog: 6,
        urgentBacklog: 2,
        inQueueCount: 2,
        toQueueCount: 4,
        // 30 / (40 - 4) = 83,3 %
        completionRate: 83.3,
      })
    })

    it('mêmes chiffres que la ligne du clan dans le bilan global', async () => {
      const queued = [{ clanId: 7, details: { squadMatchId: 'sm_queued' } }]
      mockedPrisma.cronExecution.findMany.mockResolvedValueOnce(queued as never).mockResolvedValueOnce(queued as never)
      mockedPrisma.$queryRaw.mockResolvedValueOnce([ROW] as never).mockResolvedValueOnce([ROW] as never)
      mockedPrisma.clan.findUnique.mockResolvedValueOnce({ name: 'Clan Sept', tag: 'SEPT' } as never)
      mockedPrisma.clan.findMany.mockResolvedValueOnce([{ id: 7, name: 'Clan Sept', tag: 'SEPT' }] as never)

      const single = await getClanTelemetryBacklog(7)
      const summary = await getTelemetryBacklogSummary()

      expect(single).toEqual(summary.clans[0])
    })

    it('null quand le clan n’a aucune partie', async () => {
      mockedPrisma.cronExecution.findMany.mockResolvedValueOnce([])
      mockedPrisma.$queryRaw.mockResolvedValueOnce([])
      mockedPrisma.clan.findUnique.mockResolvedValueOnce({ name: 'Clan Vide', tag: null } as never)

      expect(await getClanTelemetryBacklog(9)).toBeNull()
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
