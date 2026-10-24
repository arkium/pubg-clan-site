import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/clans/[clanId]/tournaments/[tournamentId]/sync — docs/features/tournois.md, « Synchronisation PUBG ».
 * Le SuperUser d'un autre clan synchronise (la garde suffit) ; les manches découvertes chez les joueurs du clan
 * organisateur sont projetées ; seule la télémétrie manquante est remise en file.
 */

const mocks = vi.hoisted(() => ({
  requireClanFeature: vi.fn(),
  getActorMemberId: vi.fn(),
  getTournamentForClan: vi.fn(),
  getTournamentMatches: vi.fn(),
  materializeTournamentCustomMatches: vi.fn(),
  discoverTournamentRounds: vi.fn(),
  enqueueTelemetryForSelectedSquadMatches: vi.fn(),
  squadMatchTelemetryFindMany: vi.fn(),
}))

vi.mock('@/lib/admin-action-log', () => ({ withAdminActionLog: (_template: string, handler: unknown) => handler }))
vi.mock('@/lib/auth/admin-guards', () => ({ requireClanFeature: mocks.requireClanFeature }))
vi.mock('@/middleware/auth-permission', () => ({ getActorMemberId: mocks.getActorMemberId }))
vi.mock('@/lib/tournament-service', () => ({
  getTournamentForClan: mocks.getTournamentForClan,
  getTournamentMatches: mocks.getTournamentMatches,
  materializeTournamentCustomMatches: mocks.materializeTournamentCustomMatches,
}))
vi.mock('@/lib/tournament-round-discovery', () => ({ discoverTournamentRounds: mocks.discoverTournamentRounds }))
vi.mock('@/lib/pubg-telemetry/manual-sync', () => ({
  enqueueTelemetryForSelectedSquadMatches: mocks.enqueueTelemetryForSelectedSquadMatches,
}))
vi.mock('@/lib/prisma', () => ({ prisma: { squadMatchTelemetry: { findMany: mocks.squadMatchTelemetryFindMany } } }))

import { POST } from '../app/api/clans/[clanId]/tournaments/[tournamentId]/sync/route'

const round = (id: string, memberIds: number[]) => ({ id, members: memberIds.map((memberId) => ({ memberId })) })
const call = () =>
  POST(new Request('http://localhost/api/clans/16/tournaments/t1/sync', { method: 'POST' }), {
    params: Promise.resolve({ clanId: '16', tournamentId: 't1' }),
  })

describe('POST tournaments/[id]/sync', () => {
  beforeEach(() => {
    mocks.requireClanFeature.mockReset().mockResolvedValue(null)
    // SuperUser dont le joueur actif est dans un autre clan ([SRTY], membre 1).
    mocks.getActorMemberId.mockReset().mockResolvedValue(1)
    mocks.getTournamentForClan.mockReset().mockResolvedValue({
      id: 't1',
      organizerClanId: 16,
      startDate: new Date('2026-10-23T19:50:00.000Z'),
      endDate: new Date('2026-10-23T21:40:00.000Z'),
    })
    // Avant : la manche 2 ; après : les manches 1 et 2.
    mocks.getTournamentMatches
      .mockReset()
      .mockResolvedValueOnce([round('sm-r2', [493, 600])])
      .mockResolvedValueOnce([round('sm-r1', [600]), round('sm-r2', [493, 600])])
    mocks.discoverTournamentRounds.mockReset().mockResolvedValue({
      membersRead: 20,
      matchesRead: 1,
      truncated: false,
      rounds: [{ pubgMatchId: 'r1', shard: 'steam' }],
      errors: [],
    })
    mocks.materializeTournamentCustomMatches.mockReset().mockResolvedValue({
      sourceRowCount: 0,
      sourceMatchCount: 1,
      materializedCount: 1,
      alreadyMaterializedCount: 0,
      errors: [],
    })
    // La manche 2 a déjà sa télémétrie.
    mocks.squadMatchTelemetryFindMany.mockReset().mockResolvedValue([{ squadMatchId: 'sm-r2' }])
    mocks.enqueueTelemetryForSelectedSquadMatches.mockReset().mockResolvedValue({ queuedCount: 1 })
  })

  it('SuperUser d’un autre clan : synchronise, sans exiger d’être joueur du clan organisateur', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(mocks.requireClanFeature).toHaveBeenCalledWith(expect.any(Request), 16, 'clan-competition')
    const body = await response.json()
    expect(body).toMatchObject({ ok: true, newRounds: 1, eligibleMatches: 2, membersRead: 20, discoveredRounds: 1 })
  })

  it('découvre chez les joueurs du clan organisateur, ceux des manches déjà comptées en tête', async () => {
    await call()
    expect(mocks.discoverTournamentRounds).toHaveBeenCalledWith(
      expect.objectContaining({ organizerClanId: 16, actorMemberId: 1, roundMemberIds: new Set([493, 600]) })
    )
    expect(mocks.materializeTournamentCustomMatches).toHaveBeenCalledWith('t1', {
      discovered: [{ pubgMatchId: 'r1', shard: 'steam' }],
    })
  })

  it('télémétrie : seules les manches qui ne l’ont pas encore sont remises en file (la relance ne retélécharge rien)', async () => {
    const body = await (await call()).json()
    expect(mocks.enqueueTelemetryForSelectedSquadMatches).toHaveBeenCalledWith(16, ['sm-r1'], 1)
    expect(body).toMatchObject({ telemetryQueued: 1, telemetryReady: 1 })
  })

  it('garde refusée : rien n’est lu ni écrit', async () => {
    mocks.requireClanFeature.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))
    const response = await call()
    expect(response.status).toBe(403)
    expect(mocks.discoverTournamentRounds).not.toHaveBeenCalled()
    expect(mocks.enqueueTelemetryForSelectedSquadMatches).not.toHaveBeenCalled()
  })
})
