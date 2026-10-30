import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest ne collecte que `src/lib/**` (voir vitest.config.ts) : ce fichier importe les handlers depuis src/app.
// Seuls `clanMember` et `memberBodyZoneStats` sont simulés : une lecture de la télémétrie brute ferait échouer le test.
const mocks = vi.hoisted(() => ({
  requireSameClanAsMember: vi.fn(),
  navGuard: vi.fn(),
  memberFindUnique: vi.fn(),
  memberFindMany: vi.fn(),
  zonesFindMany: vi.fn(),
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireSameClanAsMember: mocks.requireSameClanAsMember,
  requireNavPermission: () => mocks.navGuard,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: { findUnique: mocks.memberFindUnique, findMany: mocks.memberFindMany },
    memberBodyZoneStats: { findMany: mocks.zonesFindMany },
  },
}))

import { GET as getClanBodyZones } from '@/app/api/clans/[clanId]/telemetry/body-zones/route'
import { GET as getMemberBodyZones } from '@/app/api/members/[id]/telemetry/body-zones/route'

const NOW = new Date('2026-10-28T12:00:00')
type Row = { memberId: number; period: string; side: string; zone: string; hits: number; damage: number; matchesMeasured: number }
const rows = (memberId: number, period: string, dealt: Record<string, number>, taken: Record<string, number> = {}, matchesMeasured = 10): Row[] => [
  ...Object.entries(dealt).map(([zone, hits]) => ({ memberId, period, side: 'dealt', zone, hits, damage: hits * 30, matchesMeasured })),
  ...Object.entries(taken).map(([zone, hits]) => ({ memberId, period, side: 'taken', zone, hits, damage: hits * 30, matchesMeasured })),
]
const memberRequest = (id: string, period?: string) =>
  getMemberBodyZones(new Request(`http://localhost:3000/api/members/${id}/telemetry/body-zones${period ? `?period=${period}` : ''}`), {
    params: Promise.resolve({ id }),
  })
const clanRequest = (clanId: string, period?: string) =>
  getClanBodyZones(new Request(`http://localhost:3000/api/clans/${clanId}/telemetry/body-zones${period ? `?period=${period}` : ''}`), {
    params: Promise.resolve({ clanId }),
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.requireSameClanAsMember.mockResolvedValue(null)
  mocks.navGuard.mockResolvedValue(null)
  mocks.memberFindUnique.mockResolvedValue({ id: 1, displayName: 'Kestrel', clanId: 7 })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/members/[id]/telemetry/body-zones', () => {
  it('400 sur un identifiant invalide ; garde de clan en lecture', async () => {
    expect((await memberRequest('abc')).status).toBe(400)
    const forbidden = Response.json({ error: 'Forbidden' }, { status: 403 })
    mocks.requireSameClanAsMember.mockResolvedValueOnce(forbidden)
    expect((await memberRequest('1')).status).toBe(403)
    expect(mocks.requireSameClanAsMember).toHaveBeenLastCalledWith(1, expect.any(Request), { readOnly: true })
  })

  it('semaine : une requête sur la période, la précédente et les 8 semaines ; évolution, série, clan en regard', async () => {
    mocks.zonesFindMany.mockImplementation(async ({ where }: { where: { memberId?: number } }) =>
      where.memberId
        ? [
            ...rows(1, 'week-2026-44', { head: 25, torso: 93, pelvis: 23, arms: 21, legs: 28, other: 4 }, { head: 19, torso: 141 }, 23),
            ...rows(1, 'week-2026-43', { head: 11, torso: 89 }),
            ...rows(1, 'week-2026-41', { head: 3, torso: 9 }),
          ]
        : [...rows(1, 'week-2026-44', { head: 25, torso: 165 }), ...rows(2, 'week-2026-44', { head: 0, torso: 10 }, { head: 28, torso: 172 })]
    )

    const response = await memberRequest('1')
    expect(response.status).toBe(200)
    const { data } = await response.json()

    const memberQuery = mocks.zonesFindMany.mock.calls.find(([args]) => args.where.memberId)![0]
    expect(memberQuery.where.period.in).toEqual(expect.arrayContaining(['week-2026-44', 'week-2026-43', 'week-2026-37']))
    expect(memberQuery.where.period.in).toHaveLength(8)
    expect(Object.keys(memberQuery.select)).not.toContain('memberStats')

    expect(data).toMatchObject({ periodKey: 'week-2026-44', previousKey: 'week-2026-43', matchesMeasured: 23 })
    expect(data.dealt).toMatchObject({ hits: 190, headRate: 13.2 })
    expect(data.trend).toEqual({ dealtHead: 2.2, takenHead: null })
    expect(data.weeks.map((week: { periodKey: string; headRate: number | null; belowSample: boolean }) => [week.periodKey, week.headRate, week.belowSample])).toEqual([
      ['week-2026-37', null, true],
      ['week-2026-38', null, true],
      ['week-2026-39', null, true],
      ['week-2026-40', null, true],
      ['week-2026-41', null, true],
      ['week-2026-42', null, true],
      ['week-2026-43', 11, false],
      ['week-2026-44', 13.2, false],
    ])
    expect(data.clan).toEqual({ dealtHeadRate: 12.5, takenHeadRate: 14 })
    // Le clan : ses membres actifs seulement.
    const clanQuery = mocks.zonesFindMany.mock.calls.find(([args]) => !args.where.memberId)![0]
    expect(clanQuery.where).toEqual({ period: 'week-2026-44', member: { clanId: 7, isActive: true, joinStatus: 'active' } })
  })

  it('« tous » : pas de période précédente, ni d’évolution', async () => {
    mocks.zonesFindMany.mockResolvedValue(rows(1, 'all-time', { head: 40, torso: 160 }))
    const { data } = await (await memberRequest('1', 'all')).json()
    expect(data).toMatchObject({ periodKey: 'all-time', previousKey: null, previous: null, trend: { dealtHead: null, takenHead: null } })
  })
})

describe('GET /api/clans/[clanId]/telemetry/body-zones', () => {
  it('somme des membres actifs, membres classés par taux de tête avec leur rang précédent', async () => {
    mocks.memberFindMany.mockResolvedValue([
      { id: 1, displayName: 'Kestrel' },
      { id: 2, displayName: 'Lynx' },
      { id: 3, displayName: 'Torpille' },
      { id: 4, displayName: 'Sans partie' },
    ])
    mocks.zonesFindMany.mockResolvedValue([
      ...rows(1, 'week-2026-44', { head: 25, torso: 165 }),
      ...rows(2, 'week-2026-44', { head: 60, torso: 140 }),
      ...rows(3, 'week-2026-44', { head: 2, torso: 10 }, {}, 2),
      ...rows(1, 'week-2026-43', { head: 20, torso: 80 }),
      ...rows(2, 'week-2026-43', { head: 5, torso: 95 }),
    ])

    const response = await clanRequest('7')
    expect(response.status).toBe(200)
    const { data } = await response.json()

    expect(mocks.memberFindMany).toHaveBeenCalledWith({ where: { clanId: 7, isActive: true, joinStatus: 'active' }, select: { id: true, displayName: true } })
    expect(data.dealt).toMatchObject({ hits: 402, headRate: 21.6 })
    expect(data.trend.dealtHead).toBe(9.1)
    expect(data.members.map((member: { displayName: string; rank: number | null; previousRank: number | null }) => [member.displayName, member.rank, member.previousRank])).toEqual([
      ['Lynx', 1, 2],
      ['Kestrel', 2, 1],
      ['Torpille', null, null],
    ])
  })

  it('400 sur un clan invalide ; garde de navigation', async () => {
    expect((await clanRequest('0')).status).toBe(400)
    mocks.navGuard.mockResolvedValueOnce(Response.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await clanRequest('7')).status).toBe(403)
  })
})
