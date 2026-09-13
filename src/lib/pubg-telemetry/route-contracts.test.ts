import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clanMemberFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  cronExecutionFindMany: vi.fn(),
  squadMatchTelemetryFindMany: vi.fn(),
  requireRole: vi.fn(),
  requireSameClanAsMember: vi.fn(),
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
    squadMatchTelemetry: {
      findMany: mocks.squadMatchTelemetryFindMany,
    },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireRole: mocks.requireRole,
  requireSameClanAsMember: mocks.requireSameClanAsMember,
}))

vi.mock('@/lib/weapon-label-service', () => ({
  getWeaponLabels: vi.fn(async () => ({ WeapM416_C: 'M416' })),
  weaponDisplayName: (weaponName: string, labels: Record<string, string>) =>
    labels[weaponName] ?? weaponName,
}))

import { GET as getMemberWeapons } from '@/app/api/members/[id]/telemetry/weapons/route'
import { GET as getClanObservability } from '@/app/api/clans/[clanId]/telemetry/observability/route'

describe('telemetry route contracts', () => {
  beforeEach(() => {
    mocks.clanMemberFindUnique.mockReset()
    mocks.queryRaw.mockReset()
    mocks.cronExecutionFindMany.mockReset()
    mocks.squadMatchTelemetryFindMany.mockReset().mockResolvedValue([])
    mocks.requireRole.mockReset()
    mocks.requireRole.mockReturnValue(async () => null)
    mocks.requireSameClanAsMember.mockReset().mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns harmonized and legacy payloads for member weapons', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue({
      id: 42,
      displayName: 'Pagiotte',
      clanId: 7,
      pubgAccountId: 'account.42',
      pubgPlayerName: 'Pagiotte',
    })
    // MemberWeaponStats stocke les distances en centimètres ; la route les
    // convertit en mètres avant de répondre.
    mocks.queryRaw.mockResolvedValue([
      {
        weaponName: 'WeapM416_C',
        kills: 8,
        headshots: 3,
        shotsFired: 20,
        hitsLanded: 10,
        avgDistance: 4120,
        maxDistance: 0,
        totalDamage: 900,
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
        rows: Array<Record<string, unknown>>
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
      weaponLabel: 'M416',
      kills: 8,
      headshots: 3,
      shotsFired: 20,
      hitsLanded: 10,
      accuracy: 50,
      avgDistance: 41.2,
      // maxDistance stocké à 0 et aucun snapshot de télémétrie : rien à déduire.
      maxDistance: null,
      totalDamage: 900,
      matchCount: 5,
    })
    expect(payload.data.note).toBeNull()
  })

  // Depuis la migration vers la file telemetry_live_sync, une ligne
  // CronExecution = un match traité par le worker, et non plus un batch
  // daily_sync agrégé dans details.telemetrySync.
  it('computes observability health, p95 latency and alerts from telemetry job rows', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T20:00:00.000Z'))

    mocks.cronExecutionFindMany.mockResolvedValue([
      {
        id: 'job-1',
        status: 'success',
        startedAt: new Date('2026-06-03T18:00:00.000Z'),
        finishedAt: new Date('2026-06-03T18:00:04.000Z'),
        details: { squadMatchId: 'sm-1', pubgMatchId: 'pm-1', bytesDownloaded: 1000 },
      },
      {
        id: 'job-2',
        status: 'failed',
        startedAt: new Date('2026-06-03T16:00:00.000Z'),
        finishedAt: new Date('2026-06-03T16:00:20.000Z'),
        details: {
          squadMatchId: 'sm-2',
          pubgMatchId: 'pm-2',
          bytesDownloaded: 0,
          errorCode: 'PARSE_ERROR',
          errorMessage: 'Unexpected token',
        },
      },
      {
        id: 'job-3',
        status: 'success',
        startedAt: new Date('2026-06-03T14:00:00.000Z'),
        finishedAt: new Date('2026-06-03T14:00:06.000Z'),
        details: { squadMatchId: 'sm-3', pubgMatchId: 'pm-3', bytesDownloaded: 4000 },
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
          action: 'telemetry_live_sync',
          status: { in: ['success', 'failed'] },
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
          success: number
          failed: number
          expired: number
          bytesDownloaded: number
        }
        health: {
          ratedRuns: number
          successRate: number
          failedRate: number
          thresholds: {
            failedRateMax: number
            durationP95MaxMs: number
          }
          alerts: Array<{
            key: string
            status: string
            value: number
            threshold: number
          }>
        }
        latency: {
          p95DurationMs: number
        }
        series: Array<Record<string, unknown>>
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
        p95DurationMs: number
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
      success: 2,
      failed: 1,
      expired: 0,
      bytesDownloaded: 5000,
    })
    expect(payload.data.health.ratedRuns).toBe(3)
    expect(payload.data.health.successRate).toBeCloseTo(66.666, 2)
    expect(payload.data.health.failedRate).toBeCloseTo(33.333, 2)
    // Durées : 4 s, 20 s, 6 s → p95 dépasse le seuil de 15 s.
    expect(payload.data.latency.p95DurationMs).toBe(20000)
    expect(payload.data.health.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'failed_rate', status: 'warning' }),
        expect.objectContaining({ key: 'duration_p95_ms', status: 'warning' }),
      ])
    )
    expect(payload.data.series[0]).toMatchObject({
      id: 'job-1',
      squadMatchId: 'sm-1',
      pubgMatchId: 'pm-1',
      status: 'success',
      expired: false,
      durationMs: 4000,
    })
    expect(payload.summary.runs).toBe(payload.data.summary.runs)
    expect(payload.health.alerts).toEqual(payload.data.health.alerts)
    expect(payload.latency.p95DurationMs).toBe(payload.data.latency.p95DurationMs)
  })
})