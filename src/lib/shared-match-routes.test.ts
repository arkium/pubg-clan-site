import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Parties partagées par plusieurs clans suivis (docs/TODO/place-partie-partagee.md) : la route des matchs d'un clan,
 * les victoires d'un joueur (`PlayerStats.matchesWon`) et le défi « série de victoires » lisent la place des membres,
 * jamais `SquadMatch.placement` (place du seul clan qui a créé la ligne). Prisma est simulé : aucun accès à la base.
 */

const mocks = vi.hoisted(() => ({
  clanFindUnique: vi.fn(),
  squadMatchFindMany: vi.fn(),
  squadMemberFindMany: vi.fn(),
  squadMemberCount: vi.fn(),
  squadMemberAggregate: vi.fn(),
  matchGroupBy: vi.fn(),
  queryRaw: vi.fn(),
  playerStatsUpsert: vi.fn(),
  challengeFindMany: vi.fn(),
  participantUpdate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    clan: { findUnique: mocks.clanFindUnique },
    squadMatch: { findMany: mocks.squadMatchFindMany },
    squadMember: { findMany: mocks.squadMemberFindMany, count: mocks.squadMemberCount, aggregate: mocks.squadMemberAggregate },
    match: { groupBy: mocks.matchGroupBy },
    playerStats: { upsert: mocks.playerStatsUpsert },
    challenge: { findMany: mocks.challengeFindMany },
    challengeParticipant: { update: mocks.participantUpdate },
  },
}))
vi.mock('@/middleware/auth-permission', () => ({ requireNavPermission: () => async () => null }))
vi.mock('@/lib/map-label-service', () => ({ getMapLabels: async () => ({ Baltic_Main: 'Erangel' }) }))
vi.mock('@/lib/notification-service', () => ({ notifyTopPerformance: vi.fn() }))

import { GET as clanMatchesRoute } from '@/app/api/clans/[clanId]/matches/route'
import { refreshChallengeProgressForClan } from './challenge-service'
import { calculatePlayerStats } from './stats-calculator'

const B = 2
const ACTIVE_B = { clanId: B, isActive: true, joinStatus: 'active' }

const member = (id: number, name: string, kills: number, placement: number) => ({
  memberId: id,
  kills,
  damage: kills * 100,
  assists: 0,
  revives: 0,
  placement,
  member: { id, displayName: name, ...ACTIVE_B },
})

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
})

describe('GET /api/clans/[clanId]/matches — partie partagée', () => {
  beforeEach(() => {
    mocks.clanFindUnique.mockResolvedValue({ id: B, name: 'Clan B' })
    mocks.queryRaw.mockResolvedValue([])
    mocks.matchGroupBy.mockResolvedValue([])
    const now = new Date()
    mocks.squadMatchFindMany.mockResolvedValue([
      // Ligne créée par le clan A (12e) : le clan B a gagné. Prisma ne rend que les membres du clan B (filtre `where`).
      { id: 'shared', pubgMatchId: 'p-shared', gameMode: 'squad', mapName: 'Baltic_Main', matchType: 'official', createdAt: now, placement: 12, telemetry: null, members: [member(21, 'Alpha', 6, 1), member(22, 'Bravo', 2, 1)] },
      { id: 'own', pubgMatchId: 'p-own', gameMode: 'squad', mapName: 'Baltic_Main', matchType: 'official', createdAt: now, placement: 1, telemetry: null, members: [member(21, 'Alpha', 1, 7), member(22, 'Bravo', 0, 7)] },
    ])
  })

  it('place et Top 1 du clan, escouade limitée au clan', async () => {
    const response = await clanMatchesRoute(new NextRequest('http://localhost/api/clans/2/matches?period=week'), { params: Promise.resolve({ clanId: '2' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    const byId = new Map(body.squads.map((squad: { id: string }) => [squad.id, squad]))
    expect(byId.get('shared')).toMatchObject({ placement: 1, isWin: true, totalKills: 8 })
    expect(byId.get('own')).toMatchObject({ placement: 7, isWin: false })
    expect(body.stats).toMatchObject({ matchCount: 2, winRate: 0.5 })
    expect(body.sessions[0].winRate).toBe(0.5)

    const query = mocks.squadMatchFindMany.mock.calls[0][0]
    expect(query.where.members).toEqual({ some: { member: ACTIVE_B } })
    expect(query.select).not.toHaveProperty('placement')
    expect(query.select.members.where).toEqual({ member: ACTIVE_B })
  })
})

describe('PlayerStats.matchesWon — la place du joueur', () => {
  it('compte les parties où son équipe a gagné, même sur une ligne créée par un autre clan', async () => {
    mocks.squadMemberFindMany.mockResolvedValue([
      { kills: 5, knockouts: 4, damage: 600, assists: 1, revives: 0, timeSurvived: 1800, placement: 1, squadMatch: { createdAt: new Date('2026-10-20T20:00:00Z') } },
      { kills: 1, knockouts: 1, damage: 120, assists: 0, revives: 1, timeSurvived: 600, placement: 12, squadMatch: { createdAt: new Date('2026-10-21T20:00:00Z') } },
    ])
    await calculatePlayerStats(21, 'all')
    const { update } = mocks.playerStatsUpsert.mock.calls[0][0]
    expect(update).toMatchObject({ matchesPlayed: 2, matchesWon: 1, winRate: 0.5 })
    expect(mocks.squadMemberFindMany.mock.calls[0][0].include.squadMatch.select).toEqual({ createdAt: true })
  })
})

describe('défi « série de victoires »', () => {
  it('compte les victoires du joueur par sa propre place', async () => {
    const startDate = new Date('2026-10-01T00:00:00Z')
    const endDate = new Date('2026-10-31T23:59:59Z')
    mocks.challengeFindMany.mockResolvedValue([{ id: 'c1', type: 'win_streak', startDate, endDate, participants: [{ id: 'p1', memberId: 21 }] }])
    mocks.squadMemberCount.mockResolvedValue(3)
    await refreshChallengeProgressForClan(B)
    expect(mocks.squadMemberCount).toHaveBeenCalledWith({
      where: { memberId: 21, placement: 1, squadMatch: { createdAt: { gte: startDate, lte: endDate } } },
    })
    expect(mocks.participantUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { progress: 3 } })
  })
})
