import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest ne collecte que `src/lib/**` (voir vitest.config.ts) : ce fichier importe le handler depuis src/app.
const mocks = vi.hoisted(() => ({
  isSuperUserSession: vi.fn(),
  getMatchSyncHealthSummary: vi.fn(),
  clanFindMany: vi.fn(),
}))

vi.mock('@/middleware/auth-permission', () => ({ isSuperUserSession: mocks.isSuperUserSession }))
vi.mock('@/lib/match-sync-health-service', () => ({ getMatchSyncHealthSummary: mocks.getMatchSyncHealthSummary }))
// Seul `clan` est simulé : une lecture de `match` ou du journal PUBG ferait échouer le test.
vi.mock('@/lib/prisma', () => ({ prisma: { clan: { findMany: mocks.clanFindMany } } }))

import { GET } from '@/app/api/settings/match-sync-health/route'
import { emptyMatchSyncHealthState, summarizeMatchSyncHealth } from '@/lib/match-sync-health'

const request = () => new Request('http://localhost:3000/api/settings/match-sync-health')
const NOW = new Date('2026-10-30T20:00:00Z')

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.isSuperUserSession.mockResolvedValue(true)
  mocks.clanFindMany.mockResolvedValue([{ id: 25, tag: 'S321', name: 'SERENITY321' }])
})

describe('GET /api/settings/match-sync-health', () => {
  it('est réservée au SuperUser', async () => {
    mocks.isSuperUserSession.mockResolvedValue(false)
    expect((await GET(request())).status).toBe(403)
    expect(mocks.getMatchSyncHealthSummary).not.toHaveBeenCalled()
  })

  it('rend le résumé enregistré et le tag des clans de ses parties en attente', async () => {
    const state = {
      ...emptyMatchSyncHealthState(),
      pending: [
        { matchId: 'm1', clanId: 25, memberId: 7, firstFailedAt: NOW.toISOString(), lastFailedAt: NOW.toISOString(), attempts: 1, lastStatus: 404, lostAt: null },
      ],
    }
    const health = summarizeMatchSyncHealth(state, { now: NOW, intervalMinutes: 30 })
    mocks.getMatchSyncHealthSummary.mockResolvedValue(health)

    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, health, clans: [{ id: 25, tag: 'S321', name: 'SERENITY321' }] })
    expect(mocks.clanFindMany).toHaveBeenCalledWith({ where: { id: { in: [25] } }, select: { id: true, tag: true, name: true } })
  })

  it('sans partie en attente : aucune lecture des clans ; état illisible : health null', async () => {
    mocks.getMatchSyncHealthSummary.mockResolvedValue(null)
    expect(await (await GET(request())).json()).toEqual({ ok: true, health: null, clans: [] })
    expect(mocks.clanFindMany).not.toHaveBeenCalled()
  })

  it('répond 500 si la lecture échoue', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getMatchSyncHealthSummary.mockRejectedValue(new Error('base injoignable'))
    expect((await GET(request())).status).toBe(500)
    error.mockRestore()
  })
})
