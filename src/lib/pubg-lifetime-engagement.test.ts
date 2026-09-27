import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Engagement de carrière lu dans `/seasons/lifetime` (2026-09-27) : temps de survie, parties jouées et jours de jeu,
 * que la synchro recevait déjà mais jetait. Les jours ne s'additionnent pas entre modes (un même jour compte dans
 * chaque mode joué ce jour-là) : on garde leur plancher. Aucun appel réel à l'API.
 */

process.env.PUBG_API_KEY = 'test-key'

vi.mock('@/lib/api-throttle', () => ({
  enqueuePubgApiRequestWithMetadata: vi.fn(),
}))

import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'

const mockedEnqueue = vi.mocked(enqueuePubgApiRequestWithMetadata)

const GAME_MODE_STATS = {
  'squad-fpp': { kills: 100, losses: 80, wins: 20, timeSurvived: 360_000, roundsPlayed: 100, days: 120 },
  squad: { kills: 10, losses: 8, wins: 2, timeSurvived: 36_000, roundsPlayed: 10, days: 15 },
  'duo-fpp': { kills: 30, losses: 25, wins: 5, timeSurvived: 54_000, roundsPlayed: 30, days: 40 },
}

describe('fetchLifetimeStats — engagement de carrière', () => {
  beforeEach(() => {
    mockedEnqueue.mockReset()
  })

  it('additionne temps de survie et parties, garde le plancher des jours', async () => {
    const { fetchLifetimeStats } = await import('@/lib/pubg')
    mockedEnqueue.mockResolvedValueOnce({ data: { data: { attributes: { gameModeStats: GAME_MODE_STATS } } } })

    const stats = await fetchLifetimeStats('account.xyz')

    expect(stats.other.timeSurvived).toBe(450_000)
    expect(stats.other.roundsPlayed).toBe(140)
    // 120 + 15 + 40 = 175 surestimerait : les jours squad et duo se recouvrent.
    expect(stats.other.daysPlayed).toBe(120)
    // Les autres statistiques restent des sommes.
    expect(stats.combat.kills).toBe(140)
  })

  it('agrège aussi par mode avec le même plancher (squad + squad-fpp)', async () => {
    const { fetchLifetimeStats } = await import('@/lib/pubg')
    mockedEnqueue.mockResolvedValueOnce({ data: { data: { attributes: { gameModeStats: GAME_MODE_STATS } } } })

    const stats = await fetchLifetimeStats('account.xyz')

    expect(stats.byMode.squad?.other).toMatchObject({ timeSurvived: 396_000, roundsPlayed: 110, daysPlayed: 120 })
    expect(stats.byMode.duo?.other.daysPlayed).toBe(40)
    expect(stats.byMode.solo).toBeNull()
  })

  it('un champ absent de la réponse vaut 0, sans casser la synchro', async () => {
    const { fetchLifetimeStats } = await import('@/lib/pubg')
    mockedEnqueue.mockResolvedValueOnce({ data: { data: { attributes: { gameModeStats: { solo: { kills: 3 } } } } } })

    const stats = await fetchLifetimeStats('account.xyz')
    expect(stats.other).toMatchObject({ timeSurvived: 0, roundsPlayed: 0, daysPlayed: 0 })
  })
})
