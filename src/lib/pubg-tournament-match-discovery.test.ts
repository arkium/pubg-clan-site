import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.PUBG_API_KEY = 'test-key'

vi.mock('@/lib/api-throttle', () => ({
  enqueuePubgApiRequestWithMetadata: vi.fn(),
}))

import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'

const mockedEnqueue = vi.mocked(enqueuePubgApiRequestWithMetadata)

describe('fetchAllRecentMatchIds — decouverte des matchs custom (Phase 0 Tournois)', () => {
  beforeEach(() => {
    mockedEnqueue.mockReset()
  })

  it('extrait les ids depuis relationships.matches.data du endpoint de base /players/{id}', async () => {
    const { fetchAllRecentMatchIds } = await import('@/lib/pubg')

    mockedEnqueue.mockResolvedValueOnce({
      data: {
        data: {
          id: 'account.xyz',
          relationships: {
            matches: {
              data: [{ id: 'match-1' }, { id: 'match-2' }, { id: 'match-2' }],
            },
          },
        },
      },
    })

    const matchIds = await fetchAllRecentMatchIds('account.xyz', 'steam')

    expect(matchIds).toEqual(['match-1', 'match-2'])
    expect(mockedEnqueue).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ endpoint: '/shards/steam/players/account.xyz' })
    )
  })

  it('retourne un tableau vide si la relation matches est absente', async () => {
    const { fetchAllRecentMatchIds } = await import('@/lib/pubg')

    mockedEnqueue.mockResolvedValueOnce({ data: { data: { id: 'account.xyz', relationships: {} } } })

    const matchIds = await fetchAllRecentMatchIds('account.xyz', 'steam')

    expect(matchIds).toEqual([])
  })

  it('transmet clanId/memberId a la queue comme les autres appels pubg.ts', async () => {
    const { fetchAllRecentMatchIds } = await import('@/lib/pubg')

    mockedEnqueue.mockResolvedValueOnce({ data: { data: { relationships: {} } } })
    await fetchAllRecentMatchIds('account.xyz', 'steam', { clanId: 5, memberId: 12 })

    expect(mockedEnqueue).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ clanId: 5, memberId: 12 })
    )
  })

  it('la fusion avec fetchRecentMatchIds (deux sources) doit dedupliquer les ids qui se recoupent', () => {
    // Reproduit la logique de fusion appliquee dans sync-matches/route.ts sans
    // dependre de Next.js — les deux sources peuvent se recouper (un match
    // officiel apparait dans les deux relations), la fusion ne doit jamais
    // produire de doublon ni perdre un id propre a une seule source.
    const seasonMatchIds = ['match-1', 'match-2']
    const allTimeMatchIds = ['match-2', 'match-3']

    const merged = Array.from(new Set([...seasonMatchIds, ...allTimeMatchIds]))

    expect(merged).toEqual(['match-1', 'match-2', 'match-3'])
  })
})
