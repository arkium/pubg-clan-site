import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ squadMatchFindFirst: vi.fn(), memberFindFirst: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: { squadMatch: { findFirst: mocks.squadMatchFindFirst }, clanMember: { findFirst: mocks.memberFindFirst } },
}))
vi.mock('@/lib/map-label-service', () => ({
  getMapLabels: async () => ({ Baltic_Main: 'Erangel' }),
  mapDisplayName: (name: string, labels: Record<string, string>) => labels[name] ?? name,
}))

import { resolveCoachContext } from '@/lib/coach/coach-context-service'

const scope = { clanId: 292, memberId: 100, memberName: 'NovakTV' }
const match = { id: 'cmatch1', mapName: 'Baltic_Main', createdAt: new Date('2026-10-22T19:47:00Z'), placement: 3, totalKills: 18, telemetry: { status: 'success' } }

beforeEach(() => {
  mocks.squadMatchFindFirst.mockReset()
  mocks.memberFindFirst.mockReset()
})

describe('vérification du contexte de page', () => {
  it('retient un match seulement s’il compte un membre du clan de la session', async () => {
    mocks.squadMatchFindFirst.mockResolvedValue(match)
    const context = await resolveCoachContext('/clans/292/telemetry/matches/cmatch1/debrief', scope)
    expect(context).toEqual({ kind: 'match', matchId: 'cmatch1', mapName: 'Baltic_Main', mapLabel: 'Erangel', createdAt: match.createdAt, placement: 3, squadKills: 18, telemetryAnalyzed: true })
    expect(mocks.squadMatchFindFirst.mock.calls[0][0].where).toEqual({ id: 'cmatch1', members: { some: { member: { clanId: 292 } } } })

    mocks.squadMatchFindFirst.mockResolvedValue(null)
    expect(await resolveCoachContext('/clans/292/telemetry/matches/cmatch9/debrief', scope)).toEqual({ kind: 'none' })
  })

  it('ignore sans requête un chemin d’un autre clan', async () => {
    expect(await resolveCoachContext('/clans/293/telemetry/matches/cmatch1/debrief', scope)).toEqual({ kind: 'none' })
    expect(await resolveCoachContext('/clans/293/stats/weapons', scope)).toEqual({ kind: 'none' })
    expect(mocks.squadMatchFindFirst).not.toHaveBeenCalled()
  })

  it('accepte une manche de tournoi si le clan y a joué', async () => {
    mocks.squadMatchFindFirst.mockResolvedValue({ ...match, telemetry: null })
    expect(await resolveCoachContext('/tournaments/ctour1/matches/cmatch1', scope)).toMatchObject({ kind: 'match', telemetryAnalyzed: false })
  })

  it('reconnaît les pages du clan et de ses membres, jamais celles d’un autre clan', async () => {
    expect(await resolveCoachContext('/clans/292/stats/weapons', scope)).toEqual({ kind: 'weapons', memberId: 100, memberName: 'NovakTV' })
    expect(await resolveCoachContext('/clans/292/stats/opponents', scope)).toEqual({ kind: 'opponents' })
    expect(await resolveCoachContext('/clans/292/drop-zones', scope)).toEqual({ kind: 'drop-zones' })
    expect(await resolveCoachContext('/clans/292/matches/session/2026-10-22', scope)).toEqual({ kind: 'session', date: '2026-10-22' })
    expect(await resolveCoachContext('/clans/292/overview', scope)).toEqual({ kind: 'none' })

    mocks.memberFindFirst.mockResolvedValue({ id: 101, displayName: 'Menez69' })
    expect(await resolveCoachContext('/members/101/weapons', scope)).toEqual({ kind: 'weapons', memberId: 101, memberName: 'Menez69' })
    expect(mocks.memberFindFirst.mock.calls[0][0].where).toEqual({ id: 101, clanId: 292 })
    expect(await resolveCoachContext('/members/101/nemesis', scope)).toEqual({ kind: 'opponents' })

    mocks.memberFindFirst.mockResolvedValue(null)
    expect(await resolveCoachContext('/members/999/weapons', scope)).toEqual({ kind: 'none' })
    expect(await resolveCoachContext('/members/101/dashboard', scope)).toEqual({ kind: 'none' })
    expect(await resolveCoachContext('/players', scope)).toEqual({ kind: 'none' })
  })
})
