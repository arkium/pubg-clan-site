import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.PUBG_API_KEY = 'test-key'

vi.mock('@/lib/api-throttle', () => ({
  enqueuePubgApiRequestWithMetadata: vi.fn(),
}))

import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'

const mockedEnqueue = vi.mocked(enqueuePubgApiRequestWithMetadata)

describe('pubg.ts — transmission du contexte clanId/memberId a la queue', () => {
  beforeEach(() => {
    mockedEnqueue.mockReset()
  })

  it('fetchPubgClanById transmet clanId sans modifier le comportement quand le contexte est absent', async () => {
    const { fetchPubgClanById } = await import('@/lib/pubg')

    mockedEnqueue.mockResolvedValueOnce({ data: { data: null } })
    const resultWithoutContext = await fetchPubgClanById('clan.abc', 'steam')
    expect(resultWithoutContext).toBeNull()
    expect(mockedEnqueue).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ clanId: null, memberId: null })
    )

    mockedEnqueue.mockResolvedValueOnce({ data: { data: null } })
    await fetchPubgClanById('clan.abc', 'steam', { clanId: 5 })
    expect(mockedEnqueue).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ clanId: 5, memberId: null })
    )
  })

  it('fetchWeaponMastery transmet memberId a la queue', async () => {
    const { fetchWeaponMastery } = await import('@/lib/pubg')

    mockedEnqueue.mockResolvedValueOnce({ data: { data: { attributes: { weaponSummaries: {} } } } })
    const entries = await fetchWeaponMastery('account.xyz', 'steam', { memberId: 12 })

    expect(entries).toEqual([])
    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ clanId: null, memberId: 12 })
    )
  })

  it('fetchLifetimeStats transmet clanId et memberId a la queue', async () => {
    const { fetchLifetimeStats } = await import('@/lib/pubg')

    mockedEnqueue.mockResolvedValueOnce({ data: { data: { attributes: { gameModeStats: {} } } } })
    await fetchLifetimeStats('account.xyz', 'steam', { clanId: 3, memberId: 12 })

    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ clanId: 3, memberId: 12 })
    )
  })
})
