import { beforeEach, describe, expect, it, vi } from 'vitest'

// Santé des données et demande de resynchronisation plafonnée (docs/TODO/administration.md Q17). Prisma et la mise
// en file sont simulés : rien n'est écrit.
const mocks = vi.hoisted(() => ({
  appConfigFindUnique: vi.fn(),
  appConfigUpsert: vi.fn(),
  cronFindMany: vi.fn(),
  squadMatchFindMany: vi.fn(),
  enqueue: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConfig: { findUnique: mocks.appConfigFindUnique, upsert: mocks.appConfigUpsert },
    cronExecution: { findMany: mocks.cronFindMany },
    squadMatch: { findMany: mocks.squadMatchFindMany },
  },
}))
vi.mock('@/lib/pubg-telemetry/manual-sync', () => ({ enqueueTelemetryForSelectedSquadMatches: mocks.enqueue }))

import {
  computeResyncQuota,
  RESYNC_REQUEST_LIMIT,
  parseResyncLedger,
  requestCappedResync,
} from '@/lib/clan-data-health'

const NOW = new Date('2026-10-07T12:00:00Z')
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3600_000).toISOString()

describe('quota de la resynchronisation rapide', () => {
  it('compte les demandes des dernières 24 h seulement', () => {
    const quota = computeResyncQuota(
      [
        { at: hoursAgo(30), count: 50, userId: 1 },
        { at: hoursAgo(5), count: 20, userId: 1 },
        { at: hoursAgo(1), count: 10, userId: 2 },
      ],
      NOW
    )
    expect(quota).toMatchObject({ used: 30, remaining: 20, limit: RESYNC_REQUEST_LIMIT })
    expect(quota.resetsAt).toBe(new Date(NOW.getTime() + 19 * 3600_000).toISOString())
  })

  it('ignore un registre illisible', () => {
    expect(parseResyncLedger('pas du json')).toEqual([])
    expect(parseResyncLedger('[{"at":"2026-10-07T00:00:00Z","count":"x","userId":1}]')).toEqual([])
  })
})

describe('requestCappedResync', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.cronFindMany.mockResolvedValue([{ details: { squadMatchId: 'deja-en-file' } }])
    mocks.squadMatchFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    mocks.enqueue.mockResolvedValue({ queuedCount: 2 })
    mocks.appConfigUpsert.mockResolvedValue({})
  })

  it('met en file à basse priorité au plus le quota restant, puis l’inscrit au registre', async () => {
    mocks.appConfigFindUnique.mockResolvedValue({
      value: JSON.stringify([{ at: new Date(Date.now() - 3600_000).toISOString(), count: 45, userId: 9 }]),
    })

    const result = await requestCappedResync(7, 42)

    expect(mocks.squadMatchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, where: expect.objectContaining({ id: { notIn: ['deja-en-file'] } }) })
    )
    expect(mocks.enqueue).toHaveBeenCalledWith(7, ['a', 'b'], 42, { priority: 'low' })
    const ledger = JSON.parse(mocks.appConfigUpsert.mock.calls[0][0].update.value)
    expect(ledger.map((entry: { count: number; userId: number }) => [entry.count, entry.userId])).toEqual([
      [45, 9],
      [2, 42],
    ])
    expect(result).toMatchObject({ queuedCount: 2, remaining: 3, reason: null })
  })

  it('refuse sans rien mettre en file quand le quota est épuisé', async () => {
    mocks.appConfigFindUnique.mockResolvedValue({
      value: JSON.stringify([{ at: new Date(Date.now() - 3600_000).toISOString(), count: 50, userId: 9 }]),
    })

    expect(await requestCappedResync(7, 42)).toMatchObject({ queuedCount: 0, reason: 'quota' })
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.appConfigUpsert).not.toHaveBeenCalled()
  })

  it('ne touche pas au registre quand aucune partie n’est à resynchroniser', async () => {
    mocks.appConfigFindUnique.mockResolvedValue(null)
    mocks.squadMatchFindMany.mockResolvedValue([])

    expect(await requestCappedResync(7, 42)).toMatchObject({ queuedCount: 0, reason: 'nothing-to-sync', remaining: 50 })
    expect(mocks.appConfigUpsert).not.toHaveBeenCalled()
  })
})
