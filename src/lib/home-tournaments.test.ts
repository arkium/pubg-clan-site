import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildHomeTournaments, roundCountLabel, HOME_UPCOMING_LIMIT } from '@/lib/home-tournaments'
import type { TournamentOverview, TournamentStandingSummary } from '@/lib/tournament-overview'

// Le service et la route lisent `listTournamentOverviews` : simulé, aucune lecture en base.
const mocks = vi.hoisted(() => ({
  listTournamentOverviews: vi.fn(),
  getSessionFromRequest: vi.fn(),
  isAuthDisabled: vi.fn(),
}))

vi.mock('@/lib/tournament-overview', () => ({ listTournamentOverviews: mocks.listTournamentOverviews }))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/auth-mode', () => ({ isAuthDisabled: mocks.isAuthDisabled }))

import { GET } from '@/app/api/home/tournaments/route'
import { HOME_TOURNAMENTS_CACHE_TTL_MS, getHomeTournaments, resetHomeTournamentsCache } from '@/lib/home-tournaments-service'

function standing(key: string, label: string, totalPoints: number): TournamentStandingSummary {
  return {
    key,
    participant: { kind: 'clan', clanId: Number(key.replace(/\D/g, '')) || 1 },
    label,
    clanTags: [],
    memberLabels: [],
    clanIds: [],
    totalPoints,
    totalKills: 0,
    wins: 0,
  } as TournamentStandingSummary
}

function overview(id: string, phase: TournamentOverview['phase'], extra: Partial<TournamentOverview> = {}): TournamentOverview {
  return {
    id,
    title: `Tournoi ${id}`,
    description: null,
    status: phase === 'draft' ? 'draft' : 'active',
    phase,
    mode: 'inter_clan',
    startDate: '2026-10-01T00:00:00.000Z',
    endDate: '2026-10-31T00:00:00.000Z',
    gameMode: 'normal-squad',
    mapName: 'Baltic_Main',
    mapLabel: 'Erangel',
    organizerClan: { id: 1, name: 'La Meute', tag: 'LMT' },
    roundCount: 0,
    participantCount: 0,
    clanCount: 0,
    lastRoundAt: null,
    leaders: [],
    standings: [],
    winner: null,
    ...extra,
  }
}

describe('buildHomeTournaments', () => {
  it('ne montre ni brouillon ni tournoi terminé dans le direct et l’à-venir', () => {
    const payload = buildHomeTournaments([overview('d', 'draft'), overview('f', 'finished'), overview('u', 'upcoming'), overview('l', 'live')])
    expect(payload.live.map((t) => t.id)).toEqual(['l'])
    expect(payload.upcoming.map((t) => t.id)).toEqual(['u'])
    expect(payload.upcomingCount).toBe(1)
  })

  it('met en avant le direct le plus animé, puis le plus ancien à égalité', () => {
    const payload = buildHomeTournaments([
      overview('calme', 'live', { lastRoundAt: '2026-10-05T20:00:00.000Z' }),
      overview('anime', 'live', { lastRoundAt: '2026-10-08T21:00:00.000Z' }),
      overview('vide', 'live', { lastRoundAt: null }),
    ])
    expect(payload.live.map((t) => t.id)).toEqual(['anime', 'calme', 'vide'])
  })

  it('classe les tournois à venir du plus proche au plus lointain, plafonnés, en gardant le total', () => {
    const upcoming = Array.from({ length: HOME_UPCOMING_LIMIT + 2 }, (_, index) =>
      overview(`u${index}`, 'upcoming', { startDate: `2026-11-${String(20 - index).padStart(2, '0')}T00:00:00.000Z` })
    )
    const payload = buildHomeTournaments(upcoming)
    expect(payload.upcoming).toHaveLength(HOME_UPCOMING_LIMIT)
    expect(payload.upcoming[0].id).toBe(`u${HOME_UPCOMING_LIMIT + 1}`)
    expect(payload.upcomingCount).toBe(HOME_UPCOMING_LIMIT + 2)
  })

  it('ne garde que les trois premiers qui ont marqué, sans le classement complet', () => {
    const leaders = [standing('c1', '[LMT] La Meute', 412), standing('c2', '[DEMO] Clan Démo', 389), standing('c3', '[RATZ] Les-Ratz', 0)]
    const payload = buildHomeTournaments([overview('l', 'live', { leaders, standings: leaders })])
    expect(payload.live[0].leaders).toEqual([
      { key: 'c1', label: '[LMT] La Meute', points: 412 },
      { key: 'c2', label: '[DEMO] Clan Démo', points: 389 },
    ])
    expect(payload.live[0]).not.toHaveProperty('standings')
  })

  it('retient le vainqueur du dernier tournoi terminé', () => {
    const payload = buildHomeTournaments([
      overview('ete', 'finished', { title: 'Coupe d’été', endDate: '2026-08-31T00:00:00.000Z', winner: standing('c1', '[LMT] La Meute', 300) }),
      overview('printemps', 'finished', { endDate: '2026-05-31T00:00:00.000Z', winner: standing('c2', '[DEMO] Clan Démo', 280) }),
      overview('sans', 'finished', { endDate: '2026-09-30T00:00:00.000Z', winner: null }),
    ])
    expect(payload.lastWinner).toEqual({ tournamentId: 'ete', title: 'Coupe d’été', label: '[LMT] La Meute' })
  })

  it('compte les manches sans total prévu', () => {
    expect(roundCountLabel(0)).toBe('Aucune manche')
    expect(roundCountLabel(1)).toBe('1 manche')
    expect(roundCountLabel(5)).toBe('5 manches')
  })
})

describe('GET /api/home/tournaments', () => {
  beforeEach(() => {
    resetHomeTournamentsCache()
    mocks.listTournamentOverviews.mockReset().mockResolvedValue([overview('l', 'live'), overview('u', 'upcoming')])
    mocks.getSessionFromRequest.mockReset().mockResolvedValue(null)
    mocks.isAuthDisabled.mockReset().mockReturnValue(false)
  })

  it('refuse un visiteur sans session hors mode visiteur, comme /api/tournaments', async () => {
    const response = await GET(new Request('http://localhost/api/home/tournaments'))
    expect(response.status).toBe(401)
    expect(mocks.listTournamentOverviews).not.toHaveBeenCalled()
  })

  it('répond en mode visiteur sans session', async () => {
    mocks.isAuthDisabled.mockReturnValue(true)
    const response = await GET(new Request('http://localhost/api/home/tournaments'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.live.map((t: { id: string }) => t.id)).toEqual(['l'])
    expect(body.upcomingCount).toBe(1)
  })

  it('répond à un utilisateur connecté', async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: 1 })
    const response = await GET(new Request('http://localhost/api/home/tournaments'))
    expect(response.status).toBe(200)
  })

  it('renvoie 500 si la lecture échoue', async () => {
    mocks.isAuthDisabled.mockReturnValue(true)
    mocks.listTournamentOverviews.mockRejectedValue(new Error('base indisponible'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await GET(new Request('http://localhost/api/home/tournaments'))
    expect(response.status).toBe(500)
  })
})

describe('cache des tournois de la vitrine', () => {
  beforeEach(() => {
    resetHomeTournamentsCache()
    mocks.listTournamentOverviews.mockReset().mockResolvedValue([])
  })

  it('lit une fois par période, appels simultanés compris', async () => {
    await Promise.all([getHomeTournaments(1_000), getHomeTournaments(1_000)])
    await getHomeTournaments(1_000 + HOME_TOURNAMENTS_CACHE_TTL_MS - 1)
    expect(mocks.listTournamentOverviews).toHaveBeenCalledTimes(1)
    await getHomeTournaments(1_000 + HOME_TOURNAMENTS_CACHE_TTL_MS)
    expect(mocks.listTournamentOverviews).toHaveBeenCalledTimes(2)
  })

  it('ne garde pas une lecture en échec', async () => {
    mocks.listTournamentOverviews.mockRejectedValueOnce(new Error('échec'))
    await expect(getHomeTournaments(1_000)).rejects.toThrow('échec')
    await getHomeTournaments(1_001)
    expect(mocks.listTournamentOverviews).toHaveBeenCalledTimes(2)
  })
})
