import { beforeEach, describe, expect, it, vi } from 'vitest'

import { itemTrackingSentence } from '@/lib/clan-playstyle'
import { MATCH_TYPE_FILTER_OPTIONS } from '@/lib/clan-league'

/**
 * Écarts relevés par l'inventaire des pages (docs/TODO/aide-des-pages.md §0), corrigés le 2026-10-27 :
 * c) date de départ des objets consommés, d) une partie comptée une fois sur les Cartes d'un joueur, e) mode d'une partie
 * du classement compté sur les membres du clan, f) un seul vocabulaire de types. Prisma est un enregistreur générique
 * (modèle de `period-route-contracts.test.ts`), avec des réponses posées par test.
 */

const state = vi.hoisted(() => ({
  calls: [] as Array<{ model: string; method: string; args: unknown }>,
  overrides: new Map<string, (args: unknown) => unknown>(),
}))

vi.mock('@/lib/prisma', () => {
  const emptyResult = (method: string) => {
    if (method === 'findMany' || method === 'groupBy') return []
    if (method === 'count') return 0
    if (method === 'aggregate') return { _avg: {}, _count: {}, _sum: {}, _max: {}, _min: {} }
    if (method.startsWith('find')) return null
    return {}
  }
  const record = (model: string, method: string) => async (args: unknown) => {
    state.calls.push({ model, method, args })
    const override = state.overrides.get(`${model}.${method}`)
    return override ? override(args) : method === 'raw' ? [] : emptyResult(method)
  }
  const prisma = new Proxy(
    {},
    {
      get: (_target, model: string) =>
        model.startsWith('$') ? record(model, 'raw') : new Proxy({}, { get: (_model, method: string) => record(model, method) }),
    }
  )
  return { prisma }
})

vi.mock('@/middleware/auth-permission', () => ({
  requireSameClanAsMember: async () => null,
  requireNavPermission: () => async () => null,
}))
vi.mock('@/lib/map-label-service', () => ({ getMapLabels: async () => ({}), mapDisplayName: (name: string) => name }))

import { GET as leaderboardRoute } from '@/app/api/clans/[clanId]/leaderboard/route'
import { GET as mapStatsRoute } from '@/app/api/members/[id]/map-stats/route'

beforeEach(() => {
  state.calls.length = 0
  state.overrides.clear()
})

describe('c) objets consommés : la vraie date de départ, jamais une date écrite', () => {
  it('date du premier objet enregistré (1er du mois écrit « 1er »), ou rien d’inventé', () => {
    expect(itemTrackingSentence('2026-09-07T18:00:00.000Z')).toBe(
      'Le détail par objet commence le 7 septembre 2026 : la télémétrie des matchs plus anciens ne conserve pas ces événements.'
    )
    expect(itemTrackingSentence('2026-10-01T10:00:00.000Z')).toContain('le 1er octobre 2026')
    expect(itemTrackingSentence(null)).not.toMatch(/\d/)
  })
})

describe('d) Cartes d’un joueur : une partie comptée une fois', () => {
  const row = (pubgMatchId: string, placement: number, kills: number) => ({
    pubgMatchId,
    mapName: 'Baltic_Main',
    gameMode: 'squad-fpp',
    kills,
    knockouts: 1,
    assists: 0,
    damageDealt: 100,
    headshotKills: 0,
    revives: 0,
    placement,
    duration: 1800,
  })

  it('clan : une partie à quatre membres = une partie, la meilleure place, les kills additionnés', async () => {
    state.overrides.set('clanMember.findUnique', async () => ({ id: 5, displayName: 'Vvila', clanId: 7 }))
    state.overrides.set('clanMember.findMany', async () => [{ id: 5, displayName: 'Vvila' }])
    // Partie A : quatre membres (deux équipes du clan, places 1 et 6) ; partie B : un seul membre, place 12.
    state.overrides.set('match.findMany', async () => [row('A', 1, 3), row('A', 1, 2), row('A', 6, 1), row('A', 6, 0), row('B', 12, 4)])
    const response = await mapStatsRoute(new Request('http://localhost/api/members/5/map-stats?scope=clan&period=all') as never, {
      params: Promise.resolve({ id: '5' }),
    })
    const payload = (await response.json()) as { mapStats: Array<{ matches: number; wins: number; totalKills: number; avgPlacement: number; avgDurationSeconds: number }> }
    expect(payload.mapStats).toHaveLength(1)
    expect(payload.mapStats[0]).toMatchObject({ matches: 2, wins: 1, totalKills: 10, avgPlacement: (1 + 12) / 2, avgDurationSeconds: 1800 })
  })
})

describe('e) classement du clan : le mode d’une partie compte les membres du clan', () => {
  it('le nombre de membres de la partie est filtré sur les membres actifs du clan', async () => {
    state.overrides.set('clan.findUnique', async () => ({ id: 7 }))
    const url = 'http://localhost/api/clans/7/leaderboard?period=week'
    // La route lit `request.nextUrl` (NextRequest).
    await leaderboardRoute(Object.assign(new Request(url), { nextUrl: new URL(url) }) as never, { params: Promise.resolve({ clanId: '7' }) })
    const squadReads = state.calls.filter((call) => call.model === 'squadMember' && call.method === 'findMany')
    expect(squadReads.length).toBeGreaterThan(0)
    for (const read of squadReads) {
      const count = (read.args as { select: { squadMatch: { select: { _count: unknown } } } }).select.squadMatch.select._count
      expect(count).toEqual({ select: { members: { where: { member: { clanId: 7, isActive: true, joinStatus: 'active' } } } } })
    }
  })
})

describe('f) un seul vocabulaire de types de partie', () => {
  it('Normal, Ranked, Casual, Tournois, Tous — jamais « Officiel »', () => {
    expect(MATCH_TYPE_FILTER_OPTIONS.map((option) => option.label)).toEqual(['Normal', 'Ranked', 'Casual', 'Tournois', 'Tous'])
  })
})
