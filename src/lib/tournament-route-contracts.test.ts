import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createTournament: vi.fn(),
  updateTournament: vi.fn(),
  listClanTournaments: vi.fn(),
  requirePermission: vi.fn(),
  requireNavPermission: vi.fn(),
  guard: vi.fn(),
  findUnique: vi.fn(),
  deleteTournament: vi.fn(),
  findClan: vi.fn(),
}))

vi.mock('@/lib/tournament-service', () => ({
  createTournament: mocks.createTournament,
  updateTournament: mocks.updateTournament,
  listClanTournaments: mocks.listClanTournaments,
  getTournamentForClan: vi.fn(),
}))

vi.mock('@/middleware/auth-permission', () => ({
  requirePermission: mocks.requirePermission,
  requireNavPermission: mocks.requireNavPermission,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tournament: { findUnique: mocks.findUnique, delete: mocks.deleteTournament },
    // La création vérifie d'abord que le clan existe.
    clan: { findUnique: mocks.findClan },
  },
}))

import { POST as createTournamentRoute } from '@/app/api/clans/[clanId]/tournaments/route'
import { DELETE as deleteTournamentRoute, PATCH as updateTournamentRoute } from '@/app/api/clans/[clanId]/tournaments/[tournamentId]/route'

function jsonRequest(body: unknown, method = 'POST') {
  return new Request('http://localhost:3000/api/clans/7/tournaments', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  title: 'Coupe du dimanche',
  startDate: '2026-09-20',
  endDate: '2026-09-21',
  rules: { mode: 'custom_teams', mixedSquadRule: 'prorata', killPoints: 1, winBonus: 5 },
}

describe('routes de tournoi — mode et règle d’escouade', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.requirePermission.mockReturnValue(mocks.guard)
    mocks.requireNavPermission.mockReturnValue(mocks.guard)
    mocks.guard.mockResolvedValue(null)
    mocks.createTournament.mockResolvedValue({ id: 't1' })
    mocks.updateTournament.mockResolvedValue({ id: 't1' })
    mocks.findUnique.mockResolvedValue({ id: 't1', organizerClanId: 7 })
    mocks.deleteTournament.mockResolvedValue({ id: 't1' })
    mocks.findClan.mockResolvedValue({ id: 7 })
  })

  it('transmet le mode choisi à la création', async () => {
    const response = await createTournamentRoute(jsonRequest(VALID_BODY) as never, {
      params: Promise.resolve({ clanId: '7' }),
    })

    expect(response.status).toBe(201)
    expect(mocks.createTournament).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        rules: expect.objectContaining({ mode: 'custom_teams', mixedSquadRule: 'prorata' }),
      })
    )
  })

  it('transmet le mode choisi à la modification', async () => {
    await updateTournamentRoute(jsonRequest({ rules: { mode: 'solo_ffa' } }, 'PATCH') as never, {
      params: Promise.resolve({ clanId: '7', tournamentId: 't1' }),
    })

    expect(mocks.updateTournament).toHaveBeenCalledWith(
      7,
      't1',
      expect.objectContaining({ rules: expect.objectContaining({ mode: 'solo_ffa' }) })
    )
  })

  it('refuse un identifiant de clan invalide avant toute autorisation', async () => {
    const response = await createTournamentRoute(jsonRequest(VALID_BODY) as never, {
      params: Promise.resolve({ clanId: 'nope' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.createTournament).not.toHaveBeenCalled()
  })

  it('supprime un tournoi du clan organisateur', async () => {
    const response = await deleteTournamentRoute(
      new Request('http://localhost:3000/api/clans/7/tournaments/t1', { method: 'DELETE' }) as never,
      { params: Promise.resolve({ clanId: '7', tournamentId: 't1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.deleteTournament).toHaveBeenCalledWith({ where: { id: 't1' } })
  })

  it('refuse de supprimer le tournoi d’un autre clan', async () => {
    mocks.findUnique.mockResolvedValue({ id: 't1', organizerClanId: 99 })

    const response = await deleteTournamentRoute(
      new Request('http://localhost:3000/api/clans/7/tournaments/t1', { method: 'DELETE' }) as never,
      { params: Promise.resolve({ clanId: '7', tournamentId: 't1' }) }
    )

    expect(response.status).toBe(403)
    expect(mocks.deleteTournament).not.toHaveBeenCalled()
  })
})
