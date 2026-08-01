import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDashboardStats: vi.fn(),
  getMemberRanking: vi.fn(),
  getTimeline: vi.fn(),
  requirePermission: vi.fn(),
  permissionGuard: vi.fn(),
}))

vi.mock('@/lib/drop-pressure-stats', () => ({
  getDropPressureDashboardStats: mocks.getDashboardStats,
  getDropPressureMemberRanking: mocks.getMemberRanking,
  getDropPressureTimeline: mocks.getTimeline,
}))

vi.mock('@/middleware/auth-permission', () => ({
  requirePermission: mocks.requirePermission,
}))

import { GET as getClanDropPressureStats } from '@/app/api/clans/[clanId]/drop-pressure-stats/route'

describe('drop pressure route contracts', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.requirePermission.mockReturnValue(mocks.permissionGuard)
    mocks.permissionGuard.mockResolvedValue(null)
    mocks.getDashboardStats.mockResolvedValue({ dropCount: 12 })
    mocks.getMemberRanking.mockResolvedValue([{ memberId: 42 }])
    mocks.getTimeline.mockResolvedValue([{ period: '2026-07-27' }])
  })

  it('rejects an invalid clan id before authorization and data access', async () => {
    const response = await getClanDropPressureStats(
      new Request('http://localhost:3000/api/clans/nope/drop-pressure-stats'),
      { params: Promise.resolve({ clanId: 'nope' }) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid clan id' })
    expect(mocks.requirePermission).not.toHaveBeenCalled()
    expect(mocks.getDashboardStats).not.toHaveBeenCalled()
  })

  it('propagates the permission response without querying pressure data', async () => {
    mocks.permissionGuard.mockResolvedValue(
      Response.json({ error: 'Forbidden' }, { status: 403 })
    )

    const response = await getClanDropPressureStats(
      new Request('http://localhost:3000/api/clans/7/drop-pressure-stats'),
      { params: Promise.resolve({ clanId: '7' }) }
    )

    expect(response.status).toBe(403)
    expect(mocks.requirePermission).toHaveBeenCalledWith('manage_members')
    expect(mocks.permissionGuard).toHaveBeenCalledWith(expect.any(Request), {
      clanId: 7,
      allowMissingActor: true,
    })
    expect(mocks.getTimeline).not.toHaveBeenCalled()
  })

  it('uses the weekly period by default and returns the complete payload', async () => {
    const response = await getClanDropPressureStats(
      new Request('http://localhost:3000/api/clans/7/drop-pressure-stats?period=invalid'),
      { params: Promise.resolve({ clanId: '7' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      stats: { dropCount: 12 },
      ranking: [{ memberId: 42 }],
      timeline: [{ period: '2026-07-27' }],
      period: 'week',
    })
    expect(mocks.getDashboardStats).toHaveBeenCalledWith({ clanId: 7, period: 'week' })
    expect(mocks.getMemberRanking).toHaveBeenCalledWith({ clanId: 7, period: 'week' })
    expect(mocks.getTimeline).toHaveBeenCalledWith({ clanId: 7 })
  })

  it('forwards an explicit KPI period without changing timeline arguments', async () => {
    await getClanDropPressureStats(
      new Request('http://localhost:3000/api/clans/7/drop-pressure-stats?period=all'),
      { params: Promise.resolve({ clanId: '7' }) }
    )

    expect(mocks.getDashboardStats).toHaveBeenCalledWith({ clanId: 7, period: 'all' })
    expect(mocks.getMemberRanking).toHaveBeenCalledWith({ clanId: 7, period: 'all' })
    expect(mocks.getTimeline).toHaveBeenCalledWith({ clanId: 7 })
  })
})