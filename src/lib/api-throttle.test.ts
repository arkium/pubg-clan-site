import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/pubg-rate-limit-config-service', () => ({
  getPubgApiRateLimitRpm: vi.fn().mockResolvedValue(600),
}))

vi.mock('@/lib/pubg-api-call-log-service', () => ({
  createPubgApiCallLog: vi.fn().mockResolvedValue(undefined),
}))

import { createPubgApiCallLog } from '@/lib/pubg-api-call-log-service'
import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'

const mockedCreateLog = vi.mocked(createPubgApiCallLog)

describe('enqueuePubgApiRequestWithMetadata — clanId/memberId forwarding', () => {
  beforeEach(() => {
    mockedCreateLog.mockClear()
  })

  it('forwards clanId and memberId to the logged row on success', async () => {
    const result = await enqueuePubgApiRequestWithMetadata(() => Promise.resolve({ data: { ok: true } }), {
      source: 'pubg-lib',
      method: 'GET',
      endpoint: '/shards/steam/clans/clan.abc',
      clanId: 42,
      memberId: 7,
    })

    expect(result).toEqual({ data: { ok: true } })
    expect(mockedCreateLog).toHaveBeenCalledTimes(1)
    expect(mockedCreateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        clanId: 42,
        memberId: 7,
        success: true,
      })
    )
  })

  it('forwards clanId and memberId to the logged row on error', async () => {
    const error = new Error('Not found') as Error & { status?: number }
    error.status = 404

    await expect(
      enqueuePubgApiRequestWithMetadata(() => Promise.reject(error), {
        source: 'pubg-lib',
        method: 'GET',
        endpoint: '/shards/steam/clans',
        clanId: 42,
        memberId: null,
      })
    ).rejects.toThrow('Not found')

    expect(mockedCreateLog).toHaveBeenCalledTimes(1)
    expect(mockedCreateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        clanId: 42,
        memberId: null,
        success: false,
      })
    )
  })

  it('defaults clanId/memberId to null when metadata omits them', async () => {
    await enqueuePubgApiRequestWithMetadata(() => Promise.resolve({ data: {} }), {
      source: 'pubg-lib',
      method: 'GET',
      endpoint: '/shards/steam/seasons',
    })

    expect(mockedCreateLog).toHaveBeenCalledWith(expect.objectContaining({ clanId: null, memberId: null }))
  })
})
