import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `GET /api/clans/[clanId]/lifetime-stats` — carrière PUBG du clan (2026-09-27) : aucune période, engagement lu dans la
 * carrière (colonne `other`), fréquence annoncée = celle de la synchro carrière, pas celle du recalcul des agrégats.
 * Prisma simulé : aucun accès à la base.
 */

const mocks = vi.hoisted(() => ({
  clanFindUnique: vi.fn(),
  lifetimeFindMany: vi.fn(),
  memberCount: vi.fn(),
  cronFindUnique: vi.fn(),
  requireNavPermission: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: { findUnique: mocks.clanFindUnique },
    memberLifetimeStats: { findMany: mocks.lifetimeFindMany },
    clanMember: { count: mocks.memberCount },
    cronSchedule: { findUnique: mocks.cronFindUnique },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({ requireNavPermission: mocks.requireNavPermission }))

import { GET } from '../app/api/clans/[clanId]/lifetime-stats/route'

const call = (query = '') =>
  GET(new Request(`http://localhost/api/clans/3/lifetime-stats${query}`), { params: Promise.resolve({ clanId: '3' }) })

describe('GET /api/clans/[clanId]/lifetime-stats', () => {
  beforeEach(() => {
    mocks.requireNavPermission.mockReset().mockReturnValue(async () => null)
    mocks.clanFindUnique.mockReset().mockResolvedValue({ id: 3, name: 'Clan Démo', tag: 'DEMO' })
    mocks.memberCount.mockReset().mockResolvedValue(3)
    mocks.cronFindUnique.mockReset().mockResolvedValue(null)
    mocks.lifetimeFindMany.mockReset().mockResolvedValue([
      {
        lastRefreshedAt: new Date('2026-09-27T04:00:00Z'),
        combat: { kills: 10 },
        victory: { wins: 1 },
        support: {},
        vehicle: {},
        movement: {},
        other: { weaponsPicked: 5, damageGiven: 100, timeSurvived: 3600, roundsPlayed: 4, daysPlayed: 2 },
        member: { id: 7, displayName: 'Joueur Alpha' },
      },
    ])
  })

  it('renvoie la carrière avec son engagement, sans période', async () => {
    const response = await call('?period=week')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).not.toHaveProperty('period')
    expect(body.members).toEqual([
      expect.objectContaining({ memberId: 7, displayName: 'Joueur Alpha', lastRefreshedAt: '2026-09-27T04:00:00.000Z' }),
    ])
    expect(body.members[0].stats.other).toMatchObject({ timeSurvived: 3600, roundsPlayed: 4, daysPlayed: 2 })
    expect(body.activeMemberCount).toBe(3)
    expect(mocks.requireNavPermission).toHaveBeenCalledWith('clan.stats')
  })

  it('annonce la fréquence de la synchro carrière (défaut : une fois par jour)', async () => {
    const body = await (await call()).json()
    expect(mocks.cronFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'daily_lifetime_stats_sync' } }))
    expect(body.lifetimeSync).toMatchObject({ expression: '0 4 * * *', runsPerDay: 1 })
  })

  it('suit le réglage de la synchro quand il existe', async () => {
    mocks.cronFindUnique.mockResolvedValue({ expression: '0 */6 * * *', timezone: 'Europe/Paris' })
    const body = await (await call()).json()
    expect(body.lifetimeSync).toEqual({ expression: '0 */6 * * *', timezone: 'Europe/Paris', runsPerDay: 4 })
  })

  it('refuse un identifiant invalide et un clan inconnu', async () => {
    const invalid = await GET(new Request('http://localhost/api/clans/x/lifetime-stats'), { params: Promise.resolve({ clanId: 'x' }) })
    expect(invalid.status).toBe(400)
    mocks.clanFindUnique.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })
})
