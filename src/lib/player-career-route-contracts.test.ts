import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes de la Carrière PUBG d'un joueur et du calendrier de son tableau de bord (docs/features/carriere-joueur.md) :
 * médailles du clan et plaque (`stats`), journées de jeu et créneau (`calendar`). Prisma simulé : aucun accès à la base.
 */

const mocks = vi.hoisted(() => ({
  lifetimeFindUnique: vi.fn(),
  lifetimeFindMany: vi.fn(),
  memberFindUnique: vi.fn(),
  matchFindMany: vi.fn(),
  requireSameClanAsMember: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    memberLifetimeStats: { findUnique: mocks.lifetimeFindUnique, findMany: mocks.lifetimeFindMany },
    clanMember: { findUnique: mocks.memberFindUnique },
    match: { findMany: mocks.matchFindMany },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({ requireSameClanAsMember: mocks.requireSameClanAsMember }))
vi.mock('@/lib/pubg', () => ({ fetchLifetimeStats: vi.fn(), searchPlayerByName: vi.fn() }))

import { GET as getCalendar } from '../app/api/members/[id]/calendar/route'
import { GET as getStats } from '../app/api/members/[id]/stats/route'

const memberParams = (id = '7') => ({ params: Promise.resolve({ id }) })

const blocks = (kills: number, teamkills: number, streak: number) => ({
  combat: { kills, deaths: 10, kdRatio: kills / 10, headshots: 0, assists: 0, knockouts: 0, highestKillstreak: streak, longestKill: 0, teamkills, suicides: 0 },
  victory: { wins: 0, losses: 10, winLossRatio: 0, longestTimeAlive: 0 },
  support: { teammatesRevived: 0, boostsUsed: 0, healed: 0 },
  vehicle: { vehiclesDestroyed: 0, roadkills: 0 },
  movement: { drivenDistance: 0, walkedDistance: 0, swamDistance: 0 },
  other: { weaponsPicked: 0, damageGiven: 0 },
})

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSameClanAsMember.mockResolvedValue(null)
})

describe('GET /api/members/[id]/stats', () => {
  beforeEach(() => {
    mocks.lifetimeFindUnique.mockResolvedValue({ ...blocks(300, 248, 22), statsSquad: null, statsDuo: null, statsSolo: null, lastRefreshedAt: new Date('2026-09-27T02:30:00Z') })
    mocks.memberFindUnique.mockResolvedValue({ displayName: 'Joueur Alpha', pubgPlayerName: 'Alpha_FR', clanId: 3, clan: { name: 'Clan Démo', tag: 'DEMO' } })
    mocks.lifetimeFindMany.mockResolvedValue([
      { memberId: 7, ...blocks(300, 248, 22) },
      { memberId: 8, ...blocks(500, 5, 23) },
      { memberId: 9, ...blocks(200, 1, 22) },
    ])
  })

  it('plaque (nom, clan) et médailles du clan : pas de teamkills, ex æquo partagés', async () => {
    const response = await getStats(new Request('http://localhost/api/members/7/stats'), memberParams())
    const body = await response.json()
    expect(body.member).toEqual({ displayName: 'Joueur Alpha', pubgPlayerName: 'Alpha_FR', clanId: 3, clan: { name: 'Clan Démo', tag: 'DEMO' } })
    expect(body.clanRanks['combat.kills']).toBe(2)
    expect(body.clanRanks['combat.highestKillstreak']).toBe(2)
    expect(body.clanRanks).not.toHaveProperty('combat.teamkills')
    expect(body.clanRanks).not.toHaveProperty('combat.deaths')
    // Membres actifs du clan du joueur seulement.
    expect(mocks.lifetimeFindMany.mock.calls[0][0].where).toEqual({ member: { clanId: 3, isActive: true } })
  })

  it('refuse un identifiant invalide sans lire la base', async () => {
    const response = await getStats(new Request('http://localhost/api/members/x/stats'), memberParams('x'))
    expect(response.status).toBe(400)
    expect(mocks.lifetimeFindUnique).not.toHaveBeenCalled()
  })
})

describe('GET /api/members/[id]/calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Jeudi 24 septembre 2026, 20:00 à Paris.
    vi.setSystemTime(new Date('2026-09-24T18:00:00Z'))
  })

  it('parties officielles par journée de jeu (06:00 à 06:00, Paris), top 1 et heures de Paris', async () => {
    mocks.matchFindMany.mockResolvedValue([
      // Mercredi 23, 21:30 et 23:10 à Paris ; la seconde est un top 1.
      { pubgCreatedAt: new Date('2026-09-23T19:30:00Z'), placement: 4 },
      { pubgCreatedAt: new Date('2026-09-23T21:10:00Z'), placement: 1 },
      // Jeudi 24, 01:30 à Paris : encore la soirée du mercredi.
      { pubgCreatedAt: new Date('2026-09-23T23:30:00Z'), placement: 12 },
      // Avant la fenêtre de 5 semaines : ignorée.
      { pubgCreatedAt: new Date('2026-08-20T19:00:00Z'), placement: 1 },
    ])
    const response = await getCalendar(new Request('http://localhost/api/members/7/calendar'), memberParams())
    const body = await response.json()
    vi.useRealTimers()

    expect(mocks.matchFindMany.mock.calls[0][0].where).toMatchObject({ memberId: 7, matchType: 'official' })
    expect(body.today).toBe('2026-09-24')
    expect(body.days).toEqual([{ date: '2026-09-23', games: 3, wins: 1 }])
    expect(body.hours[21]).toBe(1)
    expect(body.hours[23]).toBe(1)
    expect(body.hours[1]).toBe(1)
  })
})
