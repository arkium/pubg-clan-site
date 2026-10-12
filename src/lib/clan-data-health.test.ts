import { beforeEach, describe, expect, it, vi } from 'vitest'

// Santé des données d'un clan (docs/TODO/administration.md §8). Prisma est simulé : rien n'est lu ni écrit en base.
const mocks = vi.hoisted(() => ({
  squadMatchCount: vi.fn(),
  telemetryFindFirst: vi.fn(),
  cronCount: vi.fn(),
  appConfigFindUnique: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    squadMatch: { count: mocks.squadMatchCount },
    squadMatchTelemetry: { findFirst: mocks.telemetryFindFirst },
    cronExecution: { count: mocks.cronCount },
    appConfig: { findUnique: mocks.appConfigFindUnique },
  },
}))

import { getClanDataHealth } from '@/lib/clan-data-health'
import { TELEMETRY_LIVE_SYNC_QUEUE_ACTION } from '@/lib/pubg-telemetry/live-sync-queue'

describe('getClanDataHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Parties sur 30 jours, avec télémétrie, expirées chez PUBG.
    mocks.squadMatchCount.mockResolvedValueOnce(48).mockResolvedValueOnce(41).mockResolvedValueOnce(2)
    mocks.telemetryFindFirst.mockResolvedValue({ parsedAt: new Date('2026-10-11T20:00:00.000Z') })
    // File de récupération PUBG : en file ou en cours, puis échecs sur 7 jours.
    mocks.cronCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1)
  })

  it('couverture des 30 derniers jours : parties sans télémétrie hors expirées', async () => {
    expect(await getClanDataHealth(7)).toEqual({
      windowDays: 30,
      totalMatches: 48,
      withTelemetry: 41,
      expired: 2,
      missing: 5,
      lastTelemetryAt: '2026-10-11T20:00:00.000Z',
      queuedJobs: 3,
      failedJobsLast7Days: 1,
    })
  })

  it('file de récupération PUBG du seul clan, sans le registre de la resynchronisation rapide retirée', async () => {
    await getClanDataHealth(7)
    for (const [query] of mocks.cronCount.mock.calls) {
      expect(query.where).toMatchObject({ clanId: 7, action: TELEMETRY_LIVE_SYNC_QUEUE_ACTION })
    }
    expect(mocks.appConfigFindUnique).not.toHaveBeenCalled()
  })

  it('aucune télémétrie réussie : pas de date, jamais de manque négatif', async () => {
    mocks.squadMatchCount.mockReset().mockResolvedValueOnce(2).mockResolvedValueOnce(0).mockResolvedValueOnce(3)
    mocks.telemetryFindFirst.mockResolvedValue(null)
    const health = await getClanDataHealth(7)
    expect(health.lastTelemetryAt).toBeNull()
    expect(health.missing).toBe(0)
  })
})
