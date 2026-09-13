import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDashboardStats: vi.fn(),
  getMemberRanking: vi.fn(),
  getTimeline: vi.fn(),
  requireNavPermission: vi.fn(),
  permissionGuard: vi.fn(),
}))

vi.mock('@/lib/drop-pressure-stats', () => ({
  getDropPressureDashboardStats: mocks.getDashboardStats,
  getDropPressureMemberRanking: mocks.getMemberRanking,
  getDropPressureTimeline: mocks.getTimeline,
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireNavPermission: mocks.requireNavPermission,
}))

import { GET as getClanDropPressureStats } from '@/app/api/clans/[clanId]/drop-pressure-stats/route'

// Valeurs par défaut de la route quand aucun paramètre de requête n'est fourni.
const DEFAULT_FILTERS = { clanId: 7, period: 'week', matchType: 'official', mode: 'all' }

describe('drop pressure route contracts', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.requireNavPermission.mockReturnValue(mocks.permissionGuard)
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
    expect(mocks.requireNavPermission).not.toHaveBeenCalled()
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
    expect(mocks.requireNavPermission).toHaveBeenCalledWith('clan.overview')
    expect(mocks.permissionGuard).toHaveBeenCalledWith(expect.any(Request), { clanId: 7 })
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
      matchType: 'official',
      mode: 'all',
    })
    expect(mocks.getDashboardStats).toHaveBeenCalledWith(DEFAULT_FILTERS)
    expect(mocks.getMemberRanking).toHaveBeenCalledWith(DEFAULT_FILTERS)
    // La timeline ignore volontairement la période : elle couvre tout l'historique.
    expect(mocks.getTimeline).toHaveBeenCalledWith({ clanId: 7, matchType: 'official', mode: 'all' })
  })

  it('forwards an explicit KPI period without changing timeline arguments', async () => {
    await getClanDropPressureStats(
      new Request('http://localhost:3000/api/clans/7/drop-pressure-stats?period=all'),
      { params: Promise.resolve({ clanId: '7' }) }
    )

    expect(mocks.getDashboardStats).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, period: 'all' })
    expect(mocks.getMemberRanking).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, period: 'all' })
    expect(mocks.getTimeline).toHaveBeenCalledWith({ clanId: 7, matchType: 'official', mode: 'all' })
  })

  it('forwards the match type and team mode filters', async () => {
    await getClanDropPressureStats(
      new Request('http://localhost:3000/api/clans/7/drop-pressure-stats?matchType=custom&mode=duo'),
      { params: Promise.resolve({ clanId: '7' }) }
    )

    expect(mocks.getDashboardStats).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      matchType: 'custom',
      mode: 'duo',
    })
    expect(mocks.getTimeline).toHaveBeenCalledWith({ clanId: 7, matchType: 'custom', mode: 'duo' })
  })
})