import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/pubg-rate-limit-config-service', () => ({
  getPubgApiRateLimitRpm: vi.fn().mockResolvedValue(600),
}))

vi.mock('@/lib/pubg-api-call-log-service', () => ({
  createPubgApiCallLog: vi.fn().mockResolvedValue(undefined),
}))

import { createPubgApiCallLog } from '@/lib/pubg-api-call-log-service'
import { ApiQueue, enqueuePubgApiRequestWithMetadata, isUnthrottledPubgEndpoint, UNTHROTTLED_CONCURRENCY } from '@/lib/api-throttle'

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

/**
 * File PUBG à priorités et lectures non limitées (docs/TODO/synchro-parties-30-min.md) : la synchronisation des parties
 * passe devant les tâches de fond, et `matches/{id}`, que PUBG ne limite pas, n'attend plus les 6 s de la file.
 */
describe('ApiQueue — priorités et endpoints non limités', () => {
  const LIMITED = '/shards/steam/players/account.a'
  const MATCH = (id: string) => `/shards/steam/matches/${id}`

  beforeEach(() => {
    mockedCreateLog.mockClear()
  })

  it('reconnaît les seuls détails de partie comme non limités', () => {
    expect(isUnthrottledPubgEndpoint('/shards/steam/matches/2f1c-uuid')).toBe(true)
    expect(isUnthrottledPubgEndpoint('/shards/steam/players/account.a')).toBe(false)
    expect(isUnthrottledPubgEndpoint('/shards/steam/players?filter[playerIds]=a,b')).toBe(false)
    expect(isUnthrottledPubgEndpoint('/shards/steam/players/account.a/seasons/lifetime')).toBe(false)
    expect(isUnthrottledPubgEndpoint(undefined)).toBe(false)
  })

  it('sert la priorité haute d’abord, puis normale, puis basse, dans l’ordre d’arrivée à priorité égale', async () => {
    const queue = new ApiQueue(6000) // 10 ms entre deux appels
    const order: string[] = []
    let release!: () => void
    const blocker = new Promise<void>((resolve) => (release = resolve))
    const call = (name: string, wait?: Promise<void>) => async () => {
      order.push(name)
      await wait
      return { data: name }
    }

    const first = queue.add(call('premier', blocker), { endpoint: LIMITED })
    const queued = [
      queue.add(call('fond 1'), { endpoint: LIMITED, priority: 'low' }),
      queue.add(call('normal'), { endpoint: LIMITED }),
      queue.add(call('parties 1'), { endpoint: LIMITED, priority: 'high' }),
      queue.add(call('fond 2'), { endpoint: LIMITED, priority: 'low' }),
      queue.add(call('parties 2'), { endpoint: LIMITED, priority: 'high' }),
    ]
    expect(queue.pendingCount).toBe(5)
    release()
    await Promise.all([first, ...queued])

    expect(order).toEqual(['premier', 'parties 1', 'parties 2', 'normal', 'fond 1', 'fond 2'])
  })

  it('lit les détails de partie sans attendre la file limitée, quatre à la fois au plus, toujours journalisés', async () => {
    const queue = new ApiQueue(1) // une minute entre deux appels limités
    let running = 0
    let maxRunning = 0
    const match = (id: string) => async () => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return { data: id, status: 200 }
    }

    const limited = [queue.add(async () => ({ data: 'a' }), { endpoint: LIMITED }), queue.add(async () => ({ data: 'b' }), { endpoint: LIMITED })]
    const started = Date.now()
    const matches = await Promise.all(Array.from({ length: 10 }, (_, index) => queue.add(match(`m${index}`), { endpoint: MATCH(`m${index}`) })))

    // Le 2e appel limité attend encore sa minute ; les dix parties sont déjà lues.
    expect(matches.map((result) => result.data)).toEqual(Array.from({ length: 10 }, (_, index) => `m${index}`))
    expect(Date.now() - started).toBeLessThan(2000)
    expect(queue.pendingCount).toBe(1)
    expect(maxRunning).toBe(UNTHROTTLED_CONCURRENCY)
    expect(mockedCreateLog).toHaveBeenCalledWith(expect.objectContaining({ endpoint: MATCH('m0'), success: true }))
    void limited
  })
})
