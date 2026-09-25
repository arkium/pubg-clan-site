import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Les quatre API qui comptaient la « Semaine » en 7 jours glissants — docs/TODO/sticky.md §3.C.
 * Depuis le 2026-09-25, elles utilisent les bornes calendaires de `src/lib/period.ts`, comme
 * tous les agrégats du site.
 *
 * Prisma est remplacé par un enregistreur générique : chaque appel est capturé et renvoie une
 * valeur vide adaptée. Le test ne dépend ainsi que de la clause qui porte la période, pas de
 * tout ce que la route calcule ensuite. Convention du dépôt : tests dans `src/lib/`, handlers
 * importés depuis `src/app/`.
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
    return override ? override(args) : emptyResult(method)
  }
  const prisma = new Proxy(
    {},
    {
      get: (_target, model: string) =>
        model.startsWith('$')
          ? record(model, 'raw')
          : new Proxy({}, { get: (_model, method: string) => record(model, method) }),
    }
  )
  return { prisma }
})

vi.mock('@/middleware/auth-permission', () => ({
  requireSameClanAsMember: async () => null,
  requireRole: () => async () => null,
  requireNavPermission: () => async () => null,
}))
vi.mock('@/lib/map-label-service', () => ({ getMapLabels: async () => ({}) }))
vi.mock('@/lib/pubg', () => ({ fetchRecentMatchIds: vi.fn(), searchPlayerByName: vi.fn() }))

import { GET as memberMatchesRoute } from '@/app/api/members/[id]/matches/route'
import { GET as encounteredPlayersRoute } from '@/app/api/clans/[clanId]/encountered-players/route'
import { GET as activityHeatmapRoute } from '@/app/api/members/[id]/activity-heatmap/route'
import { GET as botStatsRoute } from '@/app/api/clans/[clanId]/bot-stats/route'

// Jeudi 24 septembre 2026, 15:00 (heure locale).
const NOW = new Date(2026, 8, 24, 15, 0, 0)
const MONDAY = new Date(2026, 8, 21, 0, 0, 0)
const FIRST_OF_MONTH = new Date(2026, 8, 1, 0, 0, 0)

/** Toutes les dates placées sous une clé `gte`, où qu'elles soient dans les arguments. */
function gteDates(value: unknown): Date[] {
  if (!value || typeof value !== 'object') return []
  const found: Date[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'gte' && child instanceof Date) found.push(child)
    else found.push(...gteDates(child))
  }
  return found
}

const recordedGte = (model: string, method: string) =>
  state.calls.filter((call) => call.model === model && call.method === method).flatMap((call) => gteDates(call.args))

const allRecordedGte = () => state.calls.flatMap((call) => gteDates(call.args))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  state.calls.length = 0
  state.overrides.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('/api/members/[id]/matches — matchs du joueur et bloc matchs du tableau de bord', () => {
  const call = (period: string) =>
    memberMatchesRoute(new Request(`http://localhost/api/members/5/matches?period=${period}`), {
      params: Promise.resolve({ id: '5' }),
    })

  it('« Semaine » part du lundi 00:00, plus de 7 jours glissants', async () => {
    await call('week')
    expect(recordedGte('match', 'findMany')).toEqual([MONDAY])
  })

  it('« Mois » part du 1er du mois', async () => {
    await call('month')
    expect(recordedGte('match', 'findMany')).toEqual([FIRST_OF_MONTH])
  })

  it('« Tous » ne borne pas', async () => {
    await call('all')
    expect(recordedGte('match', 'findMany')).toEqual([])
  })
})

describe('/api/clans/[clanId]/encountered-players — adversaires rencontrés', () => {
  it('« Semaine » part du lundi 00:00', async () => {
    await encounteredPlayersRoute(new Request('http://localhost/api/clans/7/encountered-players?period=week'), {
      params: Promise.resolve({ clanId: '7' }),
    })
    expect(recordedGte('encounteredPlayer', 'findMany')).toEqual([MONDAY])
  })
})

describe('/api/members/[id]/activity-heatmap — calendrier d’activité', () => {
  it('« Semaine » et « Mois » sont calendaires', async () => {
    state.overrides.set('clanMember.findUnique', async () => ({ id: 5, displayName: 'Vvila', clanId: 7 }))

    await activityHeatmapRoute(new Request('http://localhost/api/members/5/activity-heatmap?period=week') as never, {
      params: Promise.resolve({ id: '5' }),
    })
    const weekDates = allRecordedGte()
    expect(weekDates.length).toBeGreaterThan(0)
    expect(weekDates.every((date) => date.getTime() === MONDAY.getTime())).toBe(true)

    state.calls.length = 0
    await activityHeatmapRoute(new Request('http://localhost/api/members/5/activity-heatmap?period=month') as never, {
      params: Promise.resolve({ id: '5' }),
    })
    const monthDates = allRecordedGte()
    expect(monthDates.length).toBeGreaterThan(0)
    expect(monthDates.every((date) => date.getTime() === FIRST_OF_MONTH.getTime())).toBe(true)
  })
})

describe('/api/clans/[clanId]/bot-stats — section bots des statistiques du clan', () => {
  it('« Semaine » part du lundi 00:00, comme le reste de la page', async () => {
    state.overrides.set('clanMember.findMany', async () => [{ id: 1 }])

    await botStatsRoute(new Request('http://localhost/api/clans/7/bot-stats?period=week'), {
      params: Promise.resolve({ clanId: '7' }),
    })
    expect(recordedGte('match', 'aggregate')).toEqual([MONDAY])
  })
})
