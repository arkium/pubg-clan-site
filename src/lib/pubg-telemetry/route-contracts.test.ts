import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clanMemberFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  cronExecutionFindMany: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: {
      findUnique: mocks.clanMemberFindUnique,
    },
    $queryRaw: mocks.queryRaw,
    cronExecution: {
      findMany: mocks.cronExecutionFindMany,
    },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireRole: mocks.requireRole,
}))

import { GET as getMemberWeapons } from '@/app/api/members/[id]/telemetry/weapons/route'
import { GET as getClanObservability } from '@/app/api/clans/[clanId]/telemetry/observability/route'

describe('telemetry route contracts', () => {
  beforeEach(() => {
    mocks.clanMemberFindUnique.mockReset()
    mocks.queryRaw.mockReset()
    mocks.cronExecutionFindMany.mockReset()
    mocks.requireRole.mockReset()
    mocks.requireRole.mockReturnValue(async () => null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns harmonized and legacy payloads for member weapons', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue({
      id: 42,
      displayName: 'Pagiotte',
      clanId: 7,
    })
    mocks.queryRaw.mockResolvedValue([
      {
        weaponName: 'WeapM416_C',
        kills: 8,
        headshots: 3,
        avgDistance: 41.2,
        matchCount: 5,
      },
    ])

    const response = await getMemberWeapons(
      new Request('http://localhost:3000/api/members/42/telemetry/weapons?period=month'),
      { params: Promise.resolve({ id: '42' }) }
    )

    expect(response.status).toBe(200)

    const payload = (await response.json()) as {
      ok: boolean
      meta: {
        scope: string
        memberId: number
        period: string
        periodKey: string
        count: number
      }
      data: {
        member: {
          id: number
          displayName: string
          clanId: number | null
        }
        rows: Array<{
          weaponName: string
          kills: number
          headshots: number
          avgDistance: number
          matchCount: number
        }>
        note: string | null
      }
      member: {
        id: number
        displayName: string
        clanId: number | null
      }
      period: string
      periodKey: string
      count: number
      rows: Array<unknown>
      note: string | null
    }

    expect(payload.ok).toBe(true)
    expect(payload.meta).toEqual({
      scope: 'member',
      memberId: 42,
      period: 'month',
      periodKey: expect.stringMatching(/^month-\d{4}-\d{2}$/),
      count: 1,
    })
    expect(payload.data.member).toEqual(payload.member)
    expect(payload.data.rows).toEqual(payload.rows)
    expect(payload.data.rows[0]).toEqual({
      weaponName: 'WeapM416_C',
      kills: 8,
      headshots: 3,
      avgDistance: 41.2,
      matchCount: 5,
    })
    expect(payload.data.note).toBeNull()
  })

  it('computes observability health, p95 metrics and alerts from cron executions', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T20:00:00.000Z'))

    mocks.cronExecutionFindMany.mockResolvedValue([
      {
        id: 'run-1',
        status: 'success',
        startedAt: new Date('2026-06-03T18:00:00.000Z'),
        finishedAt: new Date('2026-06-03T18:02:00.000Z'),
        durationMs: 120000,
        details: {
          telemetrySync: {
            status: 'success',
            scanned: 10,
            parsed: 9,
            failed: 0,
            skipped: 1,
            metrics: {
              bytesDownloaded: 1000,
              fetchMatchMs: 120,
              downloadAssetMs: 300,
              parseMs: 1200,
              persistMs: 200,
            },
          },
        },
      },
      {
        id: 'run-2',
        status: 'partial',
        startedAt: new Date('2026-06-03T16:00:00.000Z'),
        finishedAt: new Date('2026-06-03T16:04:00.000Z'),
        durationMs: 240000,
        details: {
          telemetrySync: {
            status: 'partial',
            scanned: 8,
            parsed: 4,
            failed: 2,
            skipped: 2,
            metrics: {
              bytesDownloaded: 2000,
              fetchMatchMs: 240,
              downloadAssetMs: 600,
              parseMs: 4200,
              persistMs: 350,
            },
          },
        },
      },
      {
        id: 'run-3',
        status: 'success',
        startedAt: new Date('2026-06-03T14:00:00.000Z'),
        finishedAt: new Date('2026-06-03T14:05:00.000Z'),
        durationMs: 300000,
        details: {
          telemetrySync: {
            status: 'success',
            scanned: 12,
            parsed: 12,
            failed: 0,
            skipped: 0,
            metrics: {
              bytesDownloaded: 4000,
              fetchMatchMs: 500,
              downloadAssetMs: 1200,
              parseMs: 5100,
              persistMs: 700,
            },
          },
        },
      },
    ])

    const response = await getClanObservability(
      new Request('http://localhost:3000/api/clans/7/telemetry/observability?window=7d&limit=50'),
      { params: Promise.resolve({ clanId: '7' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.requireRole).toHaveBeenCalledWith(['Owner'])
    expect(mocks.cronExecutionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clanId: 7,
          action: 'daily_sync',
          startedAt: {
            gte: new Date('2026-05-27T20:00:00.000Z'),
          },
        }),
        take: 50,
      })
    )

    const payload = (await response.json()) as {
      ok: boolean
      meta: {
        scope: string
        clanId: number
        window: string
        limit: number
        count: number
      }
      data: {
        summary: {
          runs: number
          scanned: number
          parsed: number
          failed: number
          skipped: number
          bytesDownloaded: number
        }
        health: {
          runsWithTelemetry: number
          successRate: number
          failedRate: number
          thresholds: {
            failedRateMax: number
            parseP95MaxMs: number
          }
          alerts: Array<{
            key: string
            status: string
            value: number
            threshold: number
          }>
        }
        latency: {
          p95: {
            parseMs: number
            downloadAssetMs: number
          }
        }
        series: Array<unknown>
      }
      summary: {
        runs: number
      }
      health: {
        alerts: Array<{
          key: string
          status: string
        }>
      }
      latency: {
        p95: {
          parseMs: number
        }
      }
    }

    expect(payload.ok).toBe(true)
    expect(payload.meta).toEqual({
      scope: 'clan',
      clanId: 7,
      window: '7d',
      limit: 50,
      count: 3,
    })
    expect(payload.data.summary).toMatchObject({
      runs: 3,
      scanned: 30,
      parsed: 25,
      failed: 2,
      skipped: 3,
      bytesDownloaded: 7000,
    })
    expect(payload.data.health.runsWithTelemetry).toBe(3)
    expect(payload.data.health.successRate).toBeCloseTo(66.666, 2)
    expect(payload.data.health.failedRate).toBeCloseTo(33.333, 2)
    expect(payload.data.latency.p95.downloadAssetMs).toBe(1200)
    expect(payload.data.latency.p95.parseMs).toBe(5100)
    expect(payload.data.health.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'failed_rate', status: 'warning' }),
        expect.objectContaining({ key: 'parse_p95_ms', status: 'warning' }),
      ])
    )
    expect(payload.summary.runs).toBe(payload.data.summary.runs)
    expect(payload.health.alerts).toEqual(payload.data.health.alerts)
    expect(payload.latency.p95.parseMs).toBe(payload.data.latency.p95.parseMs)
  })
})