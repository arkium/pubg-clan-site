import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadItemUseStats: vi.fn(),
  getItemUsePeriodBounds: vi.fn(),
  requireNavPermission: vi.fn(),
  permissionGuard: vi.fn(),
  requireSameClanAsMember: vi.fn(),
}))

vi.mock('@/lib/item-use-stats', () => ({
  loadItemUseStats: mocks.loadItemUseStats,
  getItemUsePeriodBounds: mocks.getItemUsePeriodBounds,
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireNavPermission: mocks.requireNavPermission,
  requireSameClanAsMember: mocks.requireSameClanAsMember,
}))

import { GET as getClanItemUse } from '@/app/api/clans/[clanId]/telemetry/item-use/route'
import { GET as getMemberItemUse } from '@/app/api/members/[id]/item-use/route'

const STATS = {
  period: 'all',
  totalCount: 9,
  matchCount: 3,
  families: [{ subCategory: 'Heal', count: 6, share: 66.7 }],
  items: [
    { itemId: 'Item_Heal_Bandage_C', subCategory: 'Heal', count: 6, share: 66.7 },
    { itemId: 'Item_Boost_EnergyDrink_C', subCategory: 'Boost', count: 3, share: 33.3 },
  ],
  members: [],
  dataStart: '2026-09-17T20:00:00.000Z',
}

describe('item use route contracts', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.requireNavPermission.mockReturnValue(mocks.permissionGuard)
    mocks.permissionGuard.mockResolvedValue(null)
    mocks.requireSameClanAsMember.mockResolvedValue(null)
    mocks.getItemUsePeriodBounds.mockReturnValue(null)
    mocks.loadItemUseStats.mockResolvedValue(STATS)
  })

  it('refuse un identifiant de clan invalide avant toute autorisation', async () => {
    const response = await getClanItemUse(
      new Request('http://localhost:3000/api/clans/nope/telemetry/item-use'),
      { params: Promise.resolve({ clanId: 'nope' }) }
    )

    expect(response.status).toBe(400)
    expect(mocks.requireNavPermission).not.toHaveBeenCalled()
    expect(mocks.loadItemUseStats).not.toHaveBeenCalled()
  })

  it('retourne le cumul du clan, trié par nombre d’utilisations décroissant', async () => {
    const response = await getClanItemUse(
      new Request('http://localhost:3000/api/clans/7/telemetry/item-use?period=month'),
      { params: Promise.resolve({ clanId: '7' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: STATS })
    expect(mocks.requireNavPermission).toHaveBeenCalledWith('clan.items')
    expect(mocks.loadItemUseStats).toHaveBeenCalledWith(expect.objectContaining({ clanId: 7, period: 'month' }))
  })

  it('retombe sur « tous » quand la période est inconnue', async () => {
    await getMemberItemUse(
      new Request('http://localhost:3000/api/members/42/item-use?period=trimestre'),
      { params: Promise.resolve({ id: '42' }) }
    )

    expect(mocks.loadItemUseStats).toHaveBeenCalledWith(expect.objectContaining({ memberId: 42, period: 'all' }))
  })

  it('protège la vue membre par l’appartenance au même clan', async () => {
    mocks.requireSameClanAsMember.mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))

    const response = await getMemberItemUse(
      new Request('http://localhost:3000/api/members/42/item-use'),
      { params: Promise.resolve({ id: '42' }) }
    )

    expect(response.status).toBe(401)
    expect(mocks.loadItemUseStats).not.toHaveBeenCalled()
  })

  it('rend un cumul vide sans erreur pour un membre sans donnée', async () => {
    mocks.loadItemUseStats.mockResolvedValue({ ...STATS, totalCount: 0, matchCount: 0, families: [], items: [], dataStart: null })

    const response = await getMemberItemUse(
      new Request('http://localhost:3000/api/members/42/item-use'),
      { params: Promise.resolve({ id: '42' }) }
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { data: { totalCount: number; items: unknown[] } }
    expect(payload.data.totalCount).toBe(0)
    expect(payload.data.items).toEqual([])
  })
})
