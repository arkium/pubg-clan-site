import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `GET /api/members/[id]/matches` pour le carnet de vol d'un joueur (docs/features/matchs-joueur.md) : toute la période
 * avec `limit=all`, coéquipiers du clan, état de la télémétrie (expirée comprise), nombre d'équipes. Prisma simulé.
 */

const mocks = vi.hoisted(() => ({
  matchFindMany: vi.fn(),
  matchCount: vi.fn(),
  memberFindUnique: vi.fn(),
  squadMemberFindMany: vi.fn(),
  requireSameClanAsMember: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    match: { findMany: mocks.matchFindMany, count: mocks.matchCount },
    clanMember: { findUnique: mocks.memberFindUnique },
    squadMember: { findMany: mocks.squadMemberFindMany },
  },
}))
vi.mock('@/middleware/auth-permission', () => ({ requireSameClanAsMember: mocks.requireSameClanAsMember }))
vi.mock('@/lib/map-label-service', () => ({ getMapLabels: async () => ({ Baltic_Main: 'Erangel' }) }))
vi.mock('@/lib/pubg', () => ({ fetchRecentMatchIds: vi.fn(), searchPlayerByName: vi.fn() }))

import { GET } from '../app/api/members/[id]/matches/route'

const call = (query: string) => GET(new Request(`http://localhost/api/members/7/matches?${query}`), { params: Promise.resolve({ id: '7' }) })

const row = (id: string) => ({
  id,
  pubgMatchId: `p-${id}`,
  mapName: 'Baltic_Main',
  gameMode: 'squad-fpp',
  matchType: 'official',
  duration: 1500,
  placement: 3,
  kills: 4,
  damageDealt: 512,
  assists: 1,
  revives: 2,
  pubgCreatedAt: new Date('2026-09-26T19:00:00Z'),
})

const squad = (id: string, telemetry: Record<string, unknown> | null, memberIds: number[]) => ({
  squadMatch: {
    id: `sm-${id}`,
    pubgMatchId: `p-${id}`,
    _count: { members: memberIds.length },
    members: memberIds.map((memberId) => ({ memberId, member: { displayName: `Joueur ${memberId}` } })),
    telemetry,
  },
})

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSameClanAsMember.mockResolvedValue(null)
  mocks.memberFindUnique.mockResolvedValue({ clanId: 3 })
  mocks.matchCount.mockResolvedValue(3)
  mocks.matchFindMany.mockResolvedValue([row('a'), row('b'), row('c')])
  mocks.squadMemberFindMany.mockResolvedValue([
    squad('a', { status: 'success', errorCode: null, errorMessage: null, phaseSnapshots: [{ isGame: 0, numAliveTeams: 30 }, { isGame: 1, numAliveTeams: 27 }], phaseSnapshotsGz: null }, [7, 8, 9]),
    squad('b', { status: 'failed', errorCode: 'TELEMETRY_DATA_EXPIRED', errorMessage: null, phaseSnapshots: null, phaseSnapshotsGz: null }, [7, 8]),
  ])
})

describe('GET /api/members/[id]/matches — carnet de vol', () => {
  it('limit=all : toute la période, sans pagination', async () => {
    await call('period=all&limit=all&sortBy=pubgCreatedAt&sortDirection=desc')
    const args = mocks.matchFindMany.mock.calls[0][0]
    expect(args).not.toHaveProperty('take')
    expect(args).not.toHaveProperty('skip')
  })

  it('le tableau de bord garde sa limite', async () => {
    await call('period=week&limit=5&offset=0')
    expect(mocks.matchFindMany.mock.calls[0][0]).toMatchObject({ take: 5, skip: 0 })
  })

  it('coéquipiers du clan, état de la télémétrie, nombre d’équipes ; sans squad : ni l’un ni l’autre', async () => {
    const response = await call('period=all&limit=all')
    const { matches } = await response.json()
    expect(matches[0]).toMatchObject({ clanMode: 'trio', squad: ['Joueur 8', 'Joueur 9'], telemetryStatus: 'success', teamCount: 27, squadMatchId: 'sm-a', clanId: 3 })
    expect(matches[1]).toMatchObject({ clanMode: 'duo', squad: ['Joueur 8'], telemetryStatus: 'expired', teamCount: null })
    expect(matches[2]).toMatchObject({ clanMode: 'solo', squad: [], telemetryStatus: null, teamCount: null, squadMatchId: null })
  })
})
