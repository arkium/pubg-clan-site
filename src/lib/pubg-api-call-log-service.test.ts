import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Page API PUBG (`/settings/pubg-api`) — agrégation des appels du jour : échecs classés (docs/TODO/fraicheur-des-parties.md,
 * lot 6) et quota de la dernière heure par priorité (lot 2). Prisma est simulé.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  groupBy: vi.fn(),
  memberFindMany: vi.fn(),
  clanFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pubgApiCallLog: { findMany: mocks.findMany, count: mocks.count, findFirst: mocks.findFirst, groupBy: mocks.groupBy },
    clanMember: { findMany: mocks.memberFindMany },
    clan: { findMany: mocks.clanFindMany },
  },
}))

import { getPubgApiCallsOverview } from '@/lib/pubg-api-call-log-service'

const NOW = new Date('2026-10-29T20:40:00Z')

function call(minutesAgo: number, statusCode: number | null, endpoint = '/shards/steam/matches/abc', limited = false) {
  return {
    startedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    success: statusCode !== null && statusCode < 400,
    statusCode,
    durationMs: 120,
    source: 'clan-match-sync',
    endpoint,
    retryCount: 0,
    errorMessage: statusCode !== null && statusCode < 400 ? null : `[PUBG] API request failed (${statusCode ?? 'no-status'}) GET ${endpoint}`,
    clanId: 25,
    memberId: null,
    rateLimitLimit: limited ? 10 : null,
  }
}

const DAY_ROWS = [
  ...Array.from({ length: 6 }, (_, index) => call(5 + index, 200)),
  call(12, 404, '/shards/steam/matches/m1'),
  call(13, 404, '/shards/steam/matches/m2'),
  call(14, 502),
  call(14, 504),
  call(15, 403, '/shards/steam/players?filter[playerIds]=a', true),
  call(16, 429, '/shards/steam/players?filter[playerIds]=a', true),
  call(65, 200, '/shards/steam/players?filter[playerIds]=a', true),
  call(66, 200, '/shards/steam/players?filter[playerIds]=a', true),
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.findMany.mockImplementation(async (args: { select: Record<string, boolean>; skip?: number }) => {
    if (args.skip !== undefined) return []
    if (args.select.rateLimitLimit) return DAY_ROWS
    return DAY_ROWS.map(({ startedAt, success, statusCode }) => ({ startedAt, success, statusCode }))
  })
  mocks.count.mockResolvedValue(0)
  mocks.findFirst.mockResolvedValue(null)
  mocks.groupBy.mockResolvedValue([
    { source: 'clan-match-sync', _count: { _all: 150 } },
    { source: 'clan-lifetime-sync', _count: { _all: 300 } },
    { source: 'pubg-lib', _count: { _all: 40 } },
  ])
  mocks.memberFindMany.mockResolvedValue([])
  mocks.clanFindMany.mockResolvedValue([{ id: 25, name: 'SERENITY321', tag: 'S321' }])
})
afterEach(() => {
  vi.useRealTimers()
})

describe('getPubgApiCallsOverview', () => {
  it('classe les échecs du jour : 404 attendus, 5xx passagers, 429, à traiter', async () => {
    const overview = await getPubgApiCallsOverview()
    expect(overview.totals.failures).toEqual({ expected: 2, transient: 2, rateLimited: 1, action: 1 })
    expect(overview.totals.errors).toBe(6)

    const slots = overview.series.filter((point) => point.total > 0)
    const failures = slots.reduce(
      (sum, point) => ({ expected: sum.expected + point.expected, transient: sum.transient + point.transient, action: sum.action + point.action }),
      { expected: 0, transient: 0, action: 0 }
    )
    expect(failures).toEqual({ expected: 2, transient: 2, action: 1 })
    const today = overview.dailySeries.at(-1)
    expect(today).toMatchObject({ expected: 2, transient: 2, rateLimited: 1, action: 1 })
  })

  it('regroupe les échecs par classe, code et type d’appel, les plus graves d’abord — plus un message par partie', async () => {
    const { topFailures } = await getPubgApiCallsOverview()
    expect(topFailures.map((entry) => [entry.failureClass, entry.label, entry.count])).toEqual([
      ['action', '403 · Recherche joueur', 1],
      ['transient', '502 · Détail du match', 1],
      ['transient', '504 · Détail du match', 1],
      ['rateLimited', '429 · Recherche joueur', 1],
      ['expected', '404 · Détail du match', 2],
    ])
  })

  it('quota : appels limités de la dernière heure par priorité, heure la plus chargée du jour', async () => {
    const { quota } = await getPubgApiCallsOverview()
    expect(mocks.groupBy).toHaveBeenCalledWith({
      by: ['source'],
      where: { startedAt: { gte: new Date(NOW.getTime() - 3_600_000) }, rateLimitLimit: { not: null } },
      _count: { _all: true },
    })
    expect(quota.lastHour).toEqual({ limited: 490, high: 150, normal: 40, low: 300 })
    expect(quota.peakHour).toMatchObject({ limited: 2 })
  })
})
