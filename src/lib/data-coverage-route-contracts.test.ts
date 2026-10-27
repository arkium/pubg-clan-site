import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `GET /api/members/[id]/data-coverage` et `GET /api/clans/[clanId]/data-coverage` (barre « D'où viennent ces
 * chiffres ? », docs/TODO/aide-des-pages.md, lot 2) : gardes des pages qu'elles servent, 404, lecture seule, et cache de
 * 5 minutes du service. Prisma et les gardes sont simulés (CLAUDE.md, piège n° 9).
 */

const mocks = vi.hoisted(() => ({
  requireSameClan: vi.fn(),
  navGuard: vi.fn(),
  requireNav: vi.fn(),
  memberFindUnique: vi.fn(),
  clanFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  aggregate: vi.fn(),
  groupBy: vi.fn(),
  lifetimeFindUnique: vi.fn(),
  memberCount: vi.fn(),
  cronCount: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/middleware/auth-permission', () => ({
  requireSameClanAsMember: mocks.requireSameClan,
  requireNavPermission: mocks.requireNav,
}))
vi.mock('@/lib/prisma', () => {
  const ranged = { aggregate: mocks.aggregate }
  return {
    prisma: {
      clanMember: { findUnique: mocks.memberFindUnique, count: mocks.memberCount },
      clan: { findUnique: mocks.clanFindUnique },
      $queryRaw: mocks.queryRaw,
      dropPressureStat: ranged,
      zoneClosurePosition: ranged,
      memberItemUseStat: ranged,
      killEvent: ranged,
      positionMetricCell: ranged,
      match: { aggregate: mocks.aggregate, groupBy: mocks.groupBy },
      memberLifetimeStats: { findUnique: mocks.lifetimeFindUnique },
      cronExecution: { count: mocks.cronCount },
    },
  }
})

import { GET as clanCoverage } from '@/app/api/clans/[clanId]/data-coverage/route'
import { GET as memberCoverage } from '@/app/api/members/[id]/data-coverage/route'
import { resetDataCoverageCache } from '@/lib/data-coverage-service'

const request = (path: string) => new Request(`http://localhost${path}`)
const forMember = (id: string) => memberCoverage(request(`/api/members/${id}/data-coverage`), { params: Promise.resolve({ id }) })
const forClan = (clanId: string) => clanCoverage(request(`/api/clans/${clanId}/data-coverage`), { params: Promise.resolve({ clanId }) })

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  resetDataCoverageCache()
  mocks.requireSameClan.mockResolvedValue(null)
  mocks.navGuard.mockResolvedValue(null)
  mocks.requireNav.mockReturnValue(mocks.navGuard)
  mocks.queryRaw.mockResolvedValue([
    { firstAt: new Date('2026-05-11T23:30:00Z'), lastAt: new Date('2026-10-26T20:00:00Z'), matches: BigInt(812), analyzed: '736', analyzedFirst: new Date('2026-05-29T19:56:24Z'), analyzedLast: new Date('2026-10-26T20:00:00Z') },
  ])
  mocks.aggregate.mockResolvedValue({ _min: { matchDate: null, pubgCreatedAt: null }, _max: { matchDate: null, pubgCreatedAt: null }, _count: { _all: 0 } })
  mocks.groupBy.mockResolvedValue([])
  mocks.lifetimeFindUnique.mockResolvedValue(null)
  mocks.memberCount.mockResolvedValue(41)
  mocks.cronCount.mockResolvedValue(3)
})

describe('GET /api/members/[id]/data-coverage', () => {
  it('mêmes droits que ses statistiques, en lecture seule ; identifiant invalide ou membre inconnu', async () => {
    expect((await forMember('abc')).status).toBe(400)
    mocks.requireSameClan.mockResolvedValueOnce(Response.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await forMember('100')).status).toBe(403)
    expect(mocks.requireSameClan).toHaveBeenLastCalledWith(100, expect.any(Request), { readOnly: true })
    mocks.memberFindUnique.mockResolvedValueOnce(null)
    expect((await forMember('100')).status).toBe(404)
  })

  it('dates et volumes du joueur, analyses en file de son clan ; aucun compte dans la réponse', async () => {
    mocks.memberFindUnique.mockResolvedValue({ clanId: 25, createdAt: new Date('2026-05-23T22:26:46Z') })
    const response = await forMember('100')
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      pendingAnalyses: 3,
      coverage: { scope: 'member', onSiteSince: '2026-05-23', clanMatches: { firstSession: '2026-05-11', count: 812 }, telemetry: { analyzed: 736, of: 812, percent: 91 } },
    })
    expect(mocks.cronCount).toHaveBeenCalledWith({ where: expect.objectContaining({ clanId: 25, status: { in: ['queued', 'running'] } }) })
    expect(JSON.stringify(payload)).not.toMatch(/accountId|email|memberId/)
  })

  it('cache de 5 minutes : une seule lecture pour deux ouvertures', async () => {
    mocks.memberFindUnique.mockResolvedValue({ clanId: 25, createdAt: new Date('2026-05-23T22:26:46Z') })
    await forMember('100')
    await forMember('100')
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/clans/[clanId]/data-coverage', () => {
  it('garde de la vue d’ensemble du clan (mode visiteur compris) ; clan invalide ou inconnu', async () => {
    expect((await forClan('0')).status).toBe(400)
    mocks.navGuard.mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await forClan('25')).status).toBe(401)
    expect(mocks.requireNav).toHaveBeenCalledWith('clan.overview')
    expect(mocks.navGuard).toHaveBeenLastCalledWith(expect.any(Request), { clanId: 25 })
    mocks.clanFindUnique.mockResolvedValueOnce(null)
    expect((await forClan('25')).status).toBe(404)
  })

  it('les membres actifs du clan, sans ligne de joueur', async () => {
    mocks.clanFindUnique.mockResolvedValue({ id: 25 })
    const payload = await (await forClan('25')).json()
    expect(payload).toMatchObject({ pendingAnalyses: 3, coverage: { scope: 'clan', activeMembers: 41, clanMatches: { count: 812 } } })
    expect(payload.coverage).not.toHaveProperty('onSiteSince')
    expect(mocks.queryRaw.mock.calls[0][0].sql).toContain("cm.isActive = 1 AND cm.joinStatus = 'active'")
    expect(mocks.memberCount).toHaveBeenCalledWith({ where: { clanId: 25, isActive: true, joinStatus: 'active' } })
  })
})
