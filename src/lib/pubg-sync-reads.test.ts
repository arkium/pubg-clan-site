import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lectures PUBG de la synchronisation (docs/TODO/synchro-parties-30-min.md) : détail de partie lu une fois par passage
 * (cache), parties référencées par `seasons/lifetime` rendues avec la carrière, priorité transmise à la file. La file
 * (`api-throttle`) est simulée : aucun appel réseau.
 */

const mocks = vi.hoisted(() => {
  process.env.PUBG_API_KEY = 'test-key'
  return { enqueue: vi.fn() }
})

vi.mock('@/lib/api-throttle', () => ({ enqueuePubgApiRequestWithMetadata: mocks.enqueue }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { fetchLifetimeStats, fetchMatchDetails, type MatchResponseCache } from './pubg'

beforeEach(() => {
  mocks.enqueue.mockReset()
})

describe('fetchMatchDetails — cache d’un passage', () => {
  it('deux membres dans la même partie : une seule lecture de matches/{id}', async () => {
    // Réponse sans équipes : le joueur n'y figure pas, la lecture échoue après coup — seul le nombre d'appels compte ici.
    mocks.enqueue.mockResolvedValue({ data: { data: { id: 'm1', attributes: {}, relationships: {} }, included: [] } })
    const cache: MatchResponseCache = new Map()

    await expect(fetchMatchDetails('m1', 'account.a', 'steam', { clanId: 7 }, cache)).rejects.toThrow()
    await expect(fetchMatchDetails('m1', 'account.b', 'steam', { clanId: 7 }, cache)).rejects.toThrow()

    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
    expect(mocks.enqueue.mock.calls[0][1]).toMatchObject({ endpoint: '/shards/steam/matches/m1', clanId: 7 })
  })

  it('une lecture en échec n’est pas gardée : le membre suivant la retente', async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error('[PUBG] API request failed (502)'))
    mocks.enqueue.mockResolvedValue({ data: { data: { id: 'm1', attributes: {}, relationships: {} }, included: [] } })
    const cache: MatchResponseCache = new Map()

    await expect(fetchMatchDetails('m1', 'account.a', 'steam', undefined, cache)).rejects.toThrow('502')
    // Relue : l'erreur n'est plus celle du 502 (la réponse de test, sans équipes, échoue plus loin).
    await expect(fetchMatchDetails('m1', 'account.b', 'steam', undefined, cache)).rejects.toThrow(/Invalid match data|Player not found/)
    expect(mocks.enqueue).toHaveBeenCalledTimes(2)
  })

  it('sans cache, chaque appel relit la partie', async () => {
    mocks.enqueue.mockResolvedValue({ data: { data: { id: 'm1', attributes: {}, relationships: {} }, included: [] } })
    await expect(fetchMatchDetails('m1', 'account.a')).rejects.toThrow()
    await expect(fetchMatchDetails('m1', 'account.a')).rejects.toThrow()
    expect(mocks.enqueue).toHaveBeenCalledTimes(2)
  })
})

describe('fetchLifetimeStats — parties référencées et priorité', () => {
  it('rend les parties de toutes les relations de la réponse, sans doublon, et transmet la priorité', async () => {
    mocks.enqueue.mockResolvedValue({
      data: {
        data: {
          attributes: { gameModeStats: { squad: { roundsPlayed: 3, kills: 4 } } },
          relationships: {
            matchesSquad: { data: [{ id: 'a' }, { id: 'b' }] },
            matchesDuoFPP: { data: [{ id: 'b' }, { id: 'c' }] },
            matchesSolo: { data: [] },
          },
        },
      },
    })

    const stats = await fetchLifetimeStats('account.a', 'steam', { clanId: 7, memberId: 1, priority: 'low' })

    expect(stats.recentMatchIds).toEqual(['a', 'b', 'c'])
    expect(mocks.enqueue.mock.calls[0][1]).toMatchObject({ endpoint: '/shards/steam/players/account.a/seasons/lifetime', priority: 'low' })
  })
})
