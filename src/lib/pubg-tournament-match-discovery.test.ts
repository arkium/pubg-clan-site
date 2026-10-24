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

  it('fetchRecentMatchIdsForPlayers : 10 joueurs par appel, ordre de PUBG conservé, lot inconnu (404) ignoré', async () => {
    const { fetchRecentMatchIdsForPlayers } = await import('@/lib/pubg')
    const accounts = Array.from({ length: 12 }, (_, index) => `account.${index}`)

    mockedEnqueue
      .mockResolvedValueOnce({
        data: {
          data: [
            { id: 'account.0', relationships: { matches: { data: [{ id: 'm3' }, { id: 'm2' }, { id: 'm2' }, { id: 'm1' }] } } },
            { id: 'account.1', relationships: {} },
          ],
        },
      })
      .mockRejectedValueOnce(Object.assign(new Error('API request failed (404)'), { status: 404 }))

    const lists = await fetchRecentMatchIdsForPlayers(accounts, 'steam', { clanId: 16, source: 'tournament-sync' })

    expect(mockedEnqueue).toHaveBeenCalledTimes(2)
    expect(lists.get('account.0')).toEqual(['m3', 'm2', 'm1'])
    expect(lists.get('account.1')).toEqual([])
    expect(lists.has('account.11')).toBe(false)
    expect(mockedEnqueue).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      expect.objectContaining({ endpoint: '/shards/steam/players', clanId: 16, source: 'tournament-sync' })
    )
  })

  it('fetchMatchOverview : une partie publiée n’est lue qu’une fois chez PUBG', async () => {
    const { fetchMatchOverview } = await import('@/lib/pubg')
    const response = {
      data: {
        data: {
          id: 'match-cache',
          attributes: { gameMode: 'normal-solo', matchType: 'custom', mapName: 'Heaven_Main', createdAt: '2026-10-23T19:53:20Z', duration: 903 },
          relationships: { rosters: { data: [{ id: 'roster-1' }] } },
        },
        included: [
          { id: 'roster-1', type: 'roster', relationships: { participants: { data: [{ id: 'p-1' }] } } },
          { id: 'p-1', type: 'participant', attributes: { stats: { playerId: 'account.tie', name: 'Tie-Poucrav', kills: 5, winPlace: 1 } } },
        ],
      },
    }
    mockedEnqueue.mockResolvedValueOnce(response)

    const first = await fetchMatchOverview('match-cache', 'steam')
    const second = await fetchMatchOverview('match-cache', 'steam')

    expect(mockedEnqueue).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(first).toMatchObject({ matchType: 'custom', mapName: 'Heaven_Main', durationSeconds: 903 })
    expect(first.rosters[0].participants[0]).toMatchObject({ playerName: 'Tie-Poucrav', kills: 5, position: 1 })
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
