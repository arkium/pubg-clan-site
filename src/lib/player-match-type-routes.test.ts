import { beforeEach, describe, expect, it, vi } from 'vitest'

import { matchTypeValues, matchTypeWhere, parsePlayerMatchType } from '@/lib/match-type-filter'

/**
 * Filtre « Type de partie » des pages joueur (docs/TODO/aide-des-pages.md, lot 7) : Parties, Activité, Cartes et Zones de
 * drop. Sans paramètre, chaque route garde sa règle d'avant (tous les types, ou parties normales) ; avec, la clause
 * `matchType` de chaque lecture suit le filtre, Casual comprenant les lobbies de bots. Prisma est un enregistreur
 * générique (modèle de `period-route-contracts.test.ts`).
 */

const state = vi.hoisted(() => ({
  calls: [] as Array<{ model: string; method: string; args: unknown }>,
  overrides: new Map<string, (args: unknown) => unknown>(),
}))

vi.mock('@/lib/prisma', () => {
  const emptyResult = (method: string) => {
    if (method === 'findMany' || method === 'groupBy') return []
    if (method === 'count') return 0
    if (method.startsWith('find')) return null
    return {}
  }
  const record = (model: string, method: string) => async (args: unknown, ...values: unknown[]) => {
    state.calls.push({ model, method, args: method === 'raw' ? { strings: args, values } : args })
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

vi.mock('@/middleware/auth-permission', () => ({ requireSameClanAsMember: async () => null }))
vi.mock('@/lib/map-label-service', () => ({ getMapLabels: async () => ({}), mapDisplayName: (name: string) => name }))
vi.mock('@/lib/map-location-service', () => ({ getMapLocations: async () => ({}) }))
vi.mock('@/lib/pubg', () => ({ fetchRecentMatchIds: vi.fn(), searchPlayerByName: vi.fn() }))

import { GET as heatmapRoute } from '@/app/api/members/[id]/activity-heatmap/route'
import { GET as mapStatsRoute } from '@/app/api/members/[id]/map-stats/route'
import { GET as matchesRoute } from '@/app/api/members/[id]/matches/route'
import { GET as dropZonesRoute } from '@/app/api/members/[id]/telemetry/drop-zones/route'

const params = { params: Promise.resolve({ id: '5' }) }
const get = (path: string) => new Request(`http://localhost/api/members/5/${path}`) as never

/** Clauses `matchType` des lectures Prisma enregistrées (`undefined` = aucune clause). */
function recordedTypes(model: string) {
  return state.calls
    .filter((call) => call.model === model && call.method === 'findMany')
    .map((call) => (call.args as { where?: { matchType?: unknown } }).where?.matchType)
}

beforeEach(() => {
  state.calls.length = 0
  state.overrides.clear()
  state.overrides.set('clanMember.findUnique', async () => ({ id: 5, displayName: 'Vvila', clanId: 7, pubgAccountId: 'account.x', pubgPlayerName: 'Vvila' }))
  state.overrides.set('clanMember.findMany', async () => [{ id: 5, displayName: 'Vvila', pubgAccountId: 'account.x', pubgPlayerName: 'Vvila' }])
})

describe('valeurs du filtre', () => {
  it('défaut de la page quand le paramètre manque ou est inconnu ; Casual = casual + lobbies de bots', () => {
    expect(parsePlayerMatchType(null, 'all')).toBe('all')
    expect(parsePlayerMatchType('ranked', 'official')).toBe('official')
    expect(parsePlayerMatchType('competitive', 'official')).toBe('competitive')
    expect(matchTypeWhere('all')).toEqual({})
    expect(matchTypeWhere('official')).toEqual({ matchType: 'official' })
    expect(matchTypeWhere('casual')).toEqual({ matchType: { in: ['casual', 'airoyale'] } })
    expect(matchTypeValues('custom')).toEqual(['custom'])
  })
})

describe('GET /api/members/[id]/matches', () => {
  it('tous les types sans paramètre, comme avant ; le type choisi sinon', async () => {
    await matchesRoute(get('matches?period=week&limit=all'), params)
    expect(recordedTypes('match')[0]).toBeUndefined()
    state.calls.length = 0
    await matchesRoute(get('matches?period=week&limit=all&matchType=custom'), params)
    expect(recordedTypes('match')[0]).toBe('custom')
  })
})

describe('GET /api/members/[id]/activity-heatmap', () => {
  it('parties normales sans paramètre, comme avant ; « Tous » retire la clause, dans chaque périmètre', async () => {
    await heatmapRoute(get('activity-heatmap?period=all'), params)
    expect(recordedTypes('match')).toEqual(['official'])
    for (const scope of ['clan', 'best']) {
      state.calls.length = 0
      await heatmapRoute(get(`activity-heatmap?period=all&scope=${scope}&matchType=casual`), params)
      expect(recordedTypes('squadMatch')[0]).toEqual({ in: ['casual', 'airoyale'] })
    }
    state.calls.length = 0
    await heatmapRoute(get('activity-heatmap?period=all&matchType=all'), params)
    expect(recordedTypes('match')).toEqual([undefined])
  })
})

describe('GET /api/members/[id]/map-stats', () => {
  it('parties normales sans paramètre (résumé du tableau de bord) ; Ranked quand on le choisit', async () => {
    await mapStatsRoute(get('map-stats?period=all'), params)
    expect(recordedTypes('match')).toEqual(['official'])
    state.calls.length = 0
    await mapStatsRoute(get('map-stats?period=all&matchType=competitive'), params)
    expect(recordedTypes('match')).toEqual(['competitive'])
  })
})

describe('GET /api/members/[id]/telemetry/drop-zones', () => {
  it('tous les types sans paramètre ; le type choisi dans le SQL des atterrissages', async () => {
    const rawSql = () =>
      state.calls
        .filter((call) => call.model === '$queryRaw')
        .map((call) => {
          const { strings } = call.args as { strings: { strings?: string[]; sql?: string } }
          return strings.sql ?? strings.strings?.join('?') ?? ''
        })
    await dropZonesRoute(get('telemetry/drop-zones?period=week'), params)
    expect(rawSql().some((sql) => sql.includes('sm.matchType'))).toBe(false)
    state.calls.length = 0
    await dropZonesRoute(get('telemetry/drop-zones?period=week&matchType=official'), params)
    const typed = state.calls.filter((call) => call.model === '$queryRaw')
    expect(rawSql().every((sql) => sql.includes('sm.matchType IN'))).toBe(true)
    expect(JSON.stringify(typed.map((call) => call.args))).toContain('official')
  })
})
