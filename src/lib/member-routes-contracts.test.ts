import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes de la refonte « Membres et joueur » (2026-09-27, docs/features/membres.md) : fiches de l'annuaire, tableau de
 * bord d'un joueur, pression au drop déplacée, période facultative de la Némésis. Prisma simulé : aucun accès à la base.
 */

const mocks = vi.hoisted(() => ({
  clanFindUnique: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindUnique: vi.fn(),
  memberCount: vi.fn(),
  matchGroupBy: vi.fn(),
  matchFindMany: vi.fn(),
  matchFindFirst: vi.fn(),
  telemetryFindMany: vi.fn(),
  weaponFindMany: vi.fn(),
  lifetimeFindMany: vi.fn(),
  playerStatsFindUnique: vi.fn(),
  playerStatsFindMany: vi.fn(),
  squadMemberFindMany: vi.fn(),
  squadMemberFindFirst: vi.fn(),
  killEventFindMany: vi.fn(),
  encounteredFindMany: vi.fn(),
  requireNavPermission: vi.fn(),
  requirePermission: vi.fn(),
  requireSameClanAsMember: vi.fn(),
  dropStats: vi.fn(),
  dropRanking: vi.fn(),
  dropTimeline: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: { findUnique: mocks.clanFindUnique },
    clanMember: { findMany: mocks.memberFindMany, findUnique: mocks.memberFindUnique, count: mocks.memberCount },
    match: { groupBy: mocks.matchGroupBy, findMany: mocks.matchFindMany, findFirst: mocks.matchFindFirst },
    memberTelemetryStats: { findMany: mocks.telemetryFindMany },
    memberWeaponStats: { findMany: mocks.weaponFindMany },
    memberLifetimeStats: { findMany: mocks.lifetimeFindMany },
    playerStats: { findUnique: mocks.playerStatsFindUnique, findMany: mocks.playerStatsFindMany },
    squadMember: { findMany: mocks.squadMemberFindMany, findFirst: mocks.squadMemberFindFirst },
    killEvent: { findMany: mocks.killEventFindMany },
    encounteredPlayer: { findMany: mocks.encounteredFindMany },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireNavPermission: mocks.requireNavPermission,
  requirePermission: mocks.requirePermission,
  requireSameClanAsMember: mocks.requireSameClanAsMember,
}))

vi.mock('@/lib/weapon-label-service', () => ({
  getWeaponLabels: async () => ({ Item_Weapon_BerylM762_C: 'Beryl M762' }),
  weaponDisplayName: (name: string, labels: Record<string, string>) => labels[name] ?? name,
}))

vi.mock('@/lib/map-label-service', () => ({ getMapLabels: async () => ({ Baltic_Main: 'Erangel' }) }))

vi.mock('@/lib/drop-pressure-stats', () => ({
  getDropPressureDashboardStats: mocks.dropStats,
  getDropPressureMemberRanking: mocks.dropRanking,
  getDropPressureTimeline: mocks.dropTimeline,
}))

import { statsPeriodKeys } from './player-dashboard'
import { GET as getCards } from '../app/api/clans/[clanId]/members/cards/route'
import { GET as getDashboard } from '../app/api/members/[id]/dashboard/route'
import { GET as getDropPressure } from '../app/api/members/[id]/drop-pressure/route'
import { GET as getNemesis } from '../app/api/members/[id]/nemesis/route'

const memberParams = (id = '7') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireNavPermission.mockReturnValue(async () => null)
  mocks.requirePermission.mockReturnValue(async () => null)
  mocks.requireSameClanAsMember.mockResolvedValue(null)
})

describe('GET /api/clans/[clanId]/members/cards', () => {
  const call = () => getCards(new Request('http://localhost/api/clans/3/members/cards'), { params: Promise.resolve({ clanId: '3' }) })

  beforeEach(() => {
    mocks.clanFindUnique.mockResolvedValue({ id: 3, name: 'Clan Démo', tag: 'DEMO' })
    mocks.memberFindMany.mockResolvedValue([
      { id: 7, displayName: 'Joueur Alpha', pubgPlayerName: 'Alpha_FR', lastMatchAt: new Date('2026-09-27T19:00:00Z'), identities: [] },
      { id: 8, displayName: 'Joueur Bravo', pubgPlayerName: 'Bravo', lastMatchAt: null, identities: [{ user: { avatarUrl: '/a.png' } }] },
    ])
    mocks.matchGroupBy
      .mockResolvedValueOnce([{ memberId: 7, _count: { _all: 20 }, _sum: { kills: 60 } }])
      .mockResolvedValueOnce([{ memberId: 7, _count: { _all: 4 } }])
    mocks.telemetryFindMany.mockResolvedValue([{ memberId: 7, aggressionScore: 82, supportScore: 40, zoneDisciplineScore: 66 }])
    mocks.weaponFindMany.mockResolvedValue([
      { memberId: 7, weaponName: 'Item_Weapon_BerylM762_C', kills: 24 },
      { memberId: 7, weaponName: 'Item_Weapon_Mini14_C', kills: 14 },
    ])
    mocks.lifetimeFindMany.mockResolvedValue([])
    mocks.memberCount.mockResolvedValue(2)
  })

  it('une fiche par membre actif : rôle, 30 jours officiels, arme fétiche, médailles', async () => {
    const response = await call()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.clan).toEqual({ id: 3, name: 'Clan Démo', tag: 'DEMO' })
    expect(body.members[0]).toEqual({
      memberId: 7,
      displayName: 'Joueur Alpha',
      pubgPlayerName: 'Alpha_FR',
      avatarUrl: null,
      lastMatchAt: '2026-09-27T19:00:00.000Z',
      role: { id: 'fragger', score: 82 },
      recent: { matches: 20, kills: 60, wins: 4 },
      favoriteWeapon: { id: 'Item_Weapon_BerylM762_C', label: 'Beryl M762' },
      medals: { gold: 0, silver: 0, bronze: 0 },
    })
    expect(body.members[1]).toMatchObject({ memberId: 8, avatarUrl: '/a.png', role: null, recent: { matches: 0, kills: 0, wins: 0 }, favoriteWeapon: null })
    // Trente jours de parties officielles seulement.
    expect(mocks.matchGroupBy.mock.calls[0][0].where).toMatchObject({ matchType: 'official' })
    expect(mocks.telemetryFindMany.mock.calls[0][0].where.period).toBe('all-time')
  })

  it('demandes en attente : seulement pour qui peut les traiter', async () => {
    expect((await (await call()).json()).pendingCount).toBe(2)
    mocks.requirePermission.mockReturnValue(async () => Response.json({ error: 'Forbidden' }, { status: 403 }))
    mocks.matchGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    expect((await (await call()).json()).pendingCount).toBeNull()
  })

  it('refuse un identifiant invalide et un clan inconnu', async () => {
    expect((await getCards(new Request('http://localhost/x'), { params: Promise.resolve({ clanId: 'abc' }) })).status).toBe(400)
    mocks.clanFindUnique.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })
})

describe('GET /api/members/[id]/dashboard', () => {
  const call = (query = '?period=week') => getDashboard(new Request(`http://localhost/api/members/7/dashboard${query}`), memberParams())

  beforeEach(() => {
    mocks.memberFindUnique.mockResolvedValue({
      id: 7,
      displayName: 'Joueur Alpha',
      pubgPlayerName: 'Alpha_FR',
      createdAt: new Date('2025-03-02T10:00:00Z'),
      lastMatchAt: new Date('2026-09-27T19:00:00Z'),
      clanId: 3,
      clan: { id: 3, name: 'Clan Démo', tag: 'DEMO' },
      identities: [],
    })
    mocks.playerStatsFindUnique.mockResolvedValue({
      totalKills: 64, totalDamage: 9420, totalAssists: 6, totalRevives: 11, matchesPlayed: 22, matchesWon: 4, winRate: 0.18,
    })
    mocks.playerStatsFindMany.mockResolvedValue([
      { totalKills: 64, totalDamage: 9420, winRate: 0.18, matchesPlayed: 22, totalAssists: 6, totalRevives: 11 },
      { totalKills: 44, totalDamage: 6580, winRate: 0.1, matchesPlayed: 18, totalAssists: 4, totalRevives: 3 },
    ])
    mocks.matchFindMany.mockResolvedValue([])
    mocks.matchFindFirst.mockResolvedValue({
      pubgMatchId: 'pm-1', mapName: 'Baltic_Main', gameMode: 'squad-fpp', kills: 12, damageDealt: 1840, placement: 1,
      pubgCreatedAt: new Date('2026-09-21T20:00:00Z'),
    })
    mocks.squadMemberFindFirst.mockResolvedValue({
      timeSurvived: 1860,
      squadMatch: { id: 'sm-1', telemetry: { id: 't-1' }, members: [{ member: { displayName: 'Joueur Bravo' } }] },
    })
    mocks.telemetryFindMany
      .mockResolvedValueOnce([
        { memberId: 7, period: statsPeriodKeys('week', new Date()).current, aggressionScore: 82, supportScore: 40, zoneDisciplineScore: 66, avgSafeZonePresencePercent: 86, avgHealAmount: 71, avgDamageTaken: 100, avgFirstContactPhase: 2.1, matchesPlayed: 22 },
      ])
      .mockResolvedValueOnce([
        { memberId: 7, aggressionScore: 82, supportScore: 40, zoneDisciplineScore: 66 },
        { memberId: 8, aggressionScore: 34, supportScore: 28, zoneDisciplineScore: 76 },
      ])
    mocks.squadMemberFindMany
      .mockResolvedValueOnce([{ squadMatchId: 'sm-1', timeSurvived: 1860 }])
      .mockResolvedValueOnce([
        { memberId: 8, squadMatchId: 'sm-1', timeSurvived: 1200, squadMatch: { placement: 1 }, member: { displayName: 'Joueur Bravo', identities: [] } },
      ])
  })

  it('une seule période : chiffres, moyenne du clan, meilleure partie, frères d’armes', async () => {
    const response = await call()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.period).toBe('week')
    expect(body.member).toMatchObject({ id: 7, clan: { tag: 'DEMO' }, createdAt: '2025-03-02T10:00:00.000Z', lastMatchAt: '2026-09-27T19:00:00.000Z' })
    expect(body.stats).toMatchObject({ totalKills: 64, matchesWon: 4, winRate: 0.18 })
    expect(body.clanAverage.avgKills).toBe(54)
    expect(body.activity.unit).toBe('day')
    expect(body.activity.buckets).toHaveLength(7)
    expect(body.bestMatch).toEqual({
      mapName: 'Baltic_Main', mapLabel: 'Erangel', gameMode: 'squad-fpp', kills: 12, damage: 1840, placement: 1,
      createdAt: '2026-09-21T20:00:00.000Z', timeSurvived: 1860, teammates: ['Joueur Bravo'],
      debriefHref: '/clans/3/telemetry/matches/sm-1/debrief?period=week',
    })
    expect(body.mates).toEqual([
      { memberId: 8, displayName: 'Joueur Bravo', avatarUrl: null, matchCount: 1, winRate: 1, sharedPlayTimeSeconds: 1200, role: 'ghost' },
    ])
    expect(body.playstyle).toEqual({
      current: { aggression: 82, support: 40, zoneDiscipline: 66, safeZonePercent: 86, healCoveragePercent: 71, firstContactPhase: 2.1, matchesPlayed: 22 },
      previous: null,
      clan: { aggression: 58, support: 34, zoneDiscipline: 71 },
    })
    // Ancien contenu parti sur d'autres pages : plus renvoyé.
    expect(body).not.toHaveProperty('dropPressure')
    expect(body).not.toHaveProperty('progression')
  })

  it('refuse un identifiant invalide ; 404 pour un membre inconnu', async () => {
    expect((await getDashboard(new Request('http://localhost/x'), memberParams('0'))).status).toBe(400)
    mocks.memberFindUnique.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })
})

describe('GET /api/members/[id]/drop-pressure', () => {
  it('indicateurs, classement du clan et évolution de la période', async () => {
    mocks.memberFindUnique.mockResolvedValue({ clanId: 3 })
    mocks.dropStats.mockResolvedValue({ dropCount: 12, hotDropShare: 25 })
    mocks.dropRanking.mockResolvedValue([{ memberId: 7 }])
    mocks.dropTimeline.mockResolvedValue([])
    const response = await getDropPressure(new Request('http://localhost/api/members/7/drop-pressure?period=month'), memberParams())
    expect(await response.json()).toEqual({ period: 'month', stats: { dropCount: 12, hotDropShare: 25 }, ranking: [{ memberId: 7 }], timeline: [] })
    expect(mocks.dropStats).toHaveBeenCalledWith({ memberId: 7, period: 'month' })
    expect(mocks.dropRanking).toHaveBeenCalledWith({ clanId: 3, period: 'month' })
  })
})

describe('GET /api/members/[id]/nemesis', () => {
  beforeEach(() => {
    mocks.memberFindUnique.mockResolvedValue({ clanId: 3 })
    mocks.killEventFindMany.mockResolvedValue([])
    mocks.encounteredFindMany.mockResolvedValue([])
  })

  it('sans période : tout l’historique suivi (page Némésis inchangée)', async () => {
    await getNemesis(new Request('http://localhost/api/members/7/nemesis'), memberParams())
    expect(mocks.killEventFindMany.mock.calls[0][0].where).toEqual({ victimMemberId: 7 })
  })

  it('avec une période : seulement les duels depuis son début', async () => {
    await getNemesis(new Request('http://localhost/api/members/7/nemesis?period=week'), memberParams())
    const where = mocks.killEventFindMany.mock.calls[0][0].where
    expect(where.victimMemberId).toBe(7)
    expect(where.matchDate.gte).toBeInstanceOf(Date)
    expect(mocks.killEventFindMany.mock.calls[1][0].where.killerMemberId).toBe(7)
  })
})
