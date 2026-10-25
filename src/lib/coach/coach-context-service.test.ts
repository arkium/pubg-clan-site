import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ squadMatchFindFirst: vi.fn(), memberFindFirst: vi.fn(), tournamentFindFirst: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    squadMatch: { findFirst: mocks.squadMatchFindFirst },
    clanMember: { findFirst: mocks.memberFindFirst },
    tournament: { findFirst: mocks.tournamentFindFirst },
  },
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
  mocks.tournamentFindFirst.mockReset()
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

  it('reconnaît la page des cartes du clan de la session seulement', async () => {
    expect(await resolveCoachContext('/clans/292/stats/maps', scope)).toEqual({ kind: 'maps' })
    expect(await resolveCoachContext('/clans/7/stats/maps', scope)).toEqual({ kind: 'none' })
  })

  it('reconnaît la carrière du clan, la fin de zone et la cartographie des positions, du clan de la session seulement', async () => {
    expect(await resolveCoachContext('/clans/292/stats/career', scope)).toEqual({ kind: 'clan-career' })
    expect(await resolveCoachContext('/clans/292/stats/zone-closures', scope)).toEqual({ kind: 'zone-closures' })
    expect(await resolveCoachContext('/clans/292/stats/positions', scope)).toEqual({ kind: 'cities' })
    expect(await resolveCoachContext('/clans/7/stats/career', scope)).toEqual({ kind: 'none' })
    expect(mocks.memberFindFirst).not.toHaveBeenCalled()
  })

  it('reconnaît la page des objets consommés d’un membre du clan', async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: 77, displayName: 'Menez69' })
    expect(await resolveCoachContext('/members/77/items', scope)).toEqual({ kind: 'items', memberId: 77, memberName: 'Menez69' })
    expect(mocks.memberFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 77, clanId: 292 } }))
  })

  it('reconnaît le calendrier d’activité d’un membre et le classement des joueurs', async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: 77, displayName: 'Menez69' })
    expect(await resolveCoachContext('/members/77/heatmap', scope)).toEqual({ kind: 'schedule', memberId: 77, memberName: 'Menez69' })
    expect(await resolveCoachContext('/players', scope)).toEqual({ kind: 'players' })
  })

  it('reconnaît la carrière et le style de jeu, du membre comme du clan', async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: 77, displayName: 'Menez69' })
    expect(await resolveCoachContext('/members/77/stats', scope)).toEqual({ kind: 'career', memberId: 77, memberName: 'Menez69' })
    expect(await resolveCoachContext('/members/77/playstyle', scope)).toEqual({ kind: 'playstyle', memberId: 77, memberName: 'Menez69' })
    expect(await resolveCoachContext('/clans/292/stats', scope)).toEqual({ kind: 'playstyle', memberId: null, memberName: null })
    expect(await resolveCoachContext('/clans/7/stats', scope)).toEqual({ kind: 'none' })
  })

  it('retient un tournoi publié, quel que soit son organisateur, jamais un brouillon', async () => {
    const tournament = { id: 'ctour1', title: 'L’Observateur des fun', status: 'active', startDate: new Date('2026-10-23T18:00:00Z'), endDate: new Date('2026-10-23T23:00:00Z') }
    mocks.tournamentFindFirst.mockResolvedValue(tournament)
    expect(await resolveCoachContext('/tournaments/ctour1', scope)).toEqual({ kind: 'tournament', tournamentId: 'ctour1', title: 'L’Observateur des fun', phase: 'finished' })
    expect(mocks.tournamentFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ctour1' } }))
    expect(await resolveCoachContext('/tournaments/ctour1/matches', scope)).toMatchObject({ kind: 'tournament' })

    mocks.tournamentFindFirst.mockResolvedValue({ ...tournament, status: 'draft' })
    expect(await resolveCoachContext('/tournaments/ctour1', scope)).toEqual({ kind: 'none' })
    mocks.tournamentFindFirst.mockResolvedValue(null)
    expect(await resolveCoachContext('/tournaments/inconnu', scope)).toEqual({ kind: 'none' })
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
    // Les largages d'un joueur gardent son nom : le Coach appelle getDropZones pour lui, pas pour le clan.
    expect(await resolveCoachContext('/members/101/drop-zones', scope)).toEqual({ kind: 'drop-zones', memberName: 'Menez69' })

    mocks.memberFindFirst.mockResolvedValue(null)
    expect(await resolveCoachContext('/members/999/weapons', scope)).toEqual({ kind: 'none' })
    expect(await resolveCoachContext('/members/101/dashboard', scope)).toEqual({ kind: 'none' })
    expect(await resolveCoachContext('/players/abc', scope)).toEqual({ kind: 'none' })
  })
})
