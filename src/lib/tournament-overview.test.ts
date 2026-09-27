import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Liste publique des tournois (`listTournamentOverviews`) : le classement suit le mode du tournoi. Avant la refonte du
 * 2026-09-27, le vainqueur était toujours calculé par clan — un tournoi solo affichait un clan gagnant au lieu d'un
 * joueur. Prisma est simulé : aucun accès à la base.
 */

const mocks = vi.hoisted(() => ({
  tournamentFindMany: vi.fn(),
  clanFindMany: vi.fn(),
  memberFindMany: vi.fn(),
  getTournamentMatches: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tournament: { findMany: mocks.tournamentFindMany },
    clan: { findMany: mocks.clanFindMany },
    clanMember: { findMany: mocks.memberFindMany },
  },
}))

vi.mock('@/lib/map-label-service', () => ({
  getMapLabels: vi.fn(async () => ({})),
  mapDisplayName: (value: string) => value,
}))

vi.mock('@/lib/tournament-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tournament-service')>()),
  getTournamentMatches: mocks.getTournamentMatches,
}))

import { listTournamentOverviews } from './tournament-overview'

const row = (memberId: number, clanId: number, placement: number, kills: number) => ({
  memberId,
  member: { id: memberId, clanId, displayName: `Joueur ${memberId}` },
  kills,
  damage: kills * 100,
  placement,
})

// Deux manches : le clan 1 aligne 3 joueurs moyens, le joueur 20 du clan 2 gagne seul avec beaucoup de kills.
const MATCHES = [
  {
    id: 'm1',
    createdAt: new Date('2026-09-20T20:00:00Z'),
    members: [row(10, 1, 2, 2), row(11, 1, 3, 2), row(12, 1, 4, 2), row(20, 2, 1, 8)],
  },
  {
    id: 'm2',
    createdAt: new Date('2026-09-21T20:00:00Z'),
    members: [row(10, 1, 2, 1), row(11, 1, 3, 1), row(12, 1, 5, 1), row(20, 2, 1, 7)],
  },
]

function tournament(id: string, mode: string, status = 'finished') {
  return {
    id,
    title: `Tournoi ${mode}`,
    description: null,
    status,
    startDate: new Date('2026-09-20T00:00:00Z'),
    endDate: new Date('2026-09-21T00:00:00Z'),
    gameMode: null,
    mapName: null,
    organizerClanId: 1,
    organizerClan: { id: 1, name: 'Clan Démo', tag: 'DEMO' },
    rules: { mode, killPoints: 1, winBonus: 2 },
  }
}

describe('listTournamentOverviews', () => {
  beforeEach(() => {
    mocks.getTournamentMatches.mockReset().mockResolvedValue(MATCHES)
    mocks.clanFindMany.mockReset().mockResolvedValue([
      { id: 1, name: 'Clan Démo', tag: 'DEMO' },
      { id: 2, name: 'Les Ratz', tag: 'RATZ' },
    ])
    mocks.memberFindMany.mockReset().mockResolvedValue(
      [10, 11, 12, 20].map((id) => ({ id, displayName: `Joueur ${id}`, clanId: id === 20 ? 2 : 1 }))
    )
  })

  it('en solo, le vainqueur est un joueur et l’on compte des joueurs', async () => {
    mocks.tournamentFindMany.mockResolvedValue([tournament('solo', 'solo_ffa')])
    const [overview] = await listTournamentOverviews(new Date('2026-09-27T12:00:00Z'))

    expect(overview.mode).toBe('solo_ffa')
    expect(overview.participantCount).toBe(4)
    expect(overview.clanCount).toBe(2)
    expect(overview.winner).toMatchObject({ label: '[RATZ] Joueur 20', participant: { kind: 'player', memberId: 20 }, clanIds: [2] })
    expect(overview.leaders).toHaveLength(3)
  })

  it('en inter-clans, le vainqueur reste un clan', async () => {
    mocks.tournamentFindMany.mockResolvedValue([tournament('clans', 'inter_clan')])
    const [overview] = await listTournamentOverviews(new Date('2026-09-27T12:00:00Z'))

    expect(overview.participantCount).toBe(2)
    expect(overview.winner?.participant.kind).toBe('clan')
    expect(overview.winner?.clanIds).toHaveLength(1)
  })

  it('en scrims internes, ne classe que les escouades du clan organisateur', async () => {
    mocks.tournamentFindMany.mockResolvedValue([tournament('intra', 'intra_clan')])
    const [overview] = await listTournamentOverviews(new Date('2026-09-27T12:00:00Z'))

    expect(overview.winner?.participant.kind).toBe('team')
    expect(overview.winner?.clanIds).toEqual([1])
  })

  it('date la dernière manche et ne détaille le classement que pour un tournoi en direct', async () => {
    mocks.tournamentFindMany.mockResolvedValue([
      { ...tournament('live', 'inter_clan', 'active'), endDate: new Date('2026-09-30T00:00:00Z') },
      tournament('done', 'inter_clan'),
    ])
    const [live, done] = await listTournamentOverviews(new Date('2026-09-27T12:00:00Z'))

    expect(live.phase).toBe('live')
    expect(live.lastRoundAt).toBe('2026-09-21T20:00:00.000Z')
    expect(live.standings).toHaveLength(2)
    expect(done.standings).toEqual([])
    expect(done.leaders).toHaveLength(2)
  })

  it('résout les noms en deux requêtes pour toute la liste', async () => {
    mocks.tournamentFindMany.mockResolvedValue([tournament('a', 'solo_ffa'), tournament('b', 'inter_clan')])
    await listTournamentOverviews(new Date('2026-09-27T12:00:00Z'))

    expect(mocks.clanFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.memberFindMany).toHaveBeenCalledTimes(1)
  })

  it('garde un tournoi dont les matchs sont introuvables, sans classement', async () => {
    mocks.tournamentFindMany.mockResolvedValue([tournament('lost', 'custom_teams')])
    mocks.getTournamentMatches.mockRejectedValue(new Error('Tournament not found'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const [overview] = await listTournamentOverviews(new Date('2026-09-27T12:00:00Z'))
    warn.mockRestore()

    expect(overview).toMatchObject({ roundCount: 0, participantCount: 0, winner: null, lastRoundAt: null })
  })
})
