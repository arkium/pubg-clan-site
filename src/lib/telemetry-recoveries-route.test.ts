import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrat de `GET /api/clans/[clanId]/telemetry/recoveries` (onglet « Récupérations », docs/TODO/administration.md
 * §8) : couverture du seul clan demandé, plus d'état du moteur global. Prisma et la garde sont simulés.
 */

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  clanFindUnique: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  getClanTelemetryBacklog: vi.fn(),
  getTelemetryBacklogSummary: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    clan: { findUnique: mocks.clanFindUnique },
  },
}))

vi.mock('@/lib/auth/admin-guards', () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}))

vi.mock('@/lib/telemetry-recoveries-backlog', () => ({
  getClanTelemetryBacklog: mocks.getClanTelemetryBacklog,
  getTelemetryBacklogSummary: mocks.getTelemetryBacklogSummary,
  enqueueTelemetryBacklog: vi.fn(),
}))

import { GET } from '@/app/api/clans/[clanId]/telemetry/recoveries/route'

const BACKLOG = {
  clanId: 7,
  clanName: 'Clan Sept',
  clanTag: 'SEPT',
  totalMatches: 40,
  completedMatches: 30,
  expiredMatches: 4,
  recoverableBacklog: 6,
  urgentBacklog: 2,
  inQueueCount: 2,
  toQueueCount: 4,
  completionRate: 83.3,
}

function request() {
  return GET(new Request('http://localhost/api/clans/7/telemetry/recoveries?limit=150'), {
    params: Promise.resolve({ clanId: '7' }),
  })
}

describe('GET …/telemetry/recoveries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePlatformAdmin.mockResolvedValue(null)
    mocks.clanFindUnique.mockResolvedValue({ id: 7, name: 'Clan Sept', tag: 'SEPT' })
    mocks.getClanTelemetryBacklog.mockResolvedValue(BACKLOG)
    mocks.queryRaw.mockResolvedValue([
      {
        id: 't1',
        squadMatchId: 'sm1',
        pubgMatchId: 'pubg-1',
        gameMode: 'squad-fpp',
        mapName: 'Erangel',
        placement: 3,
        squadCreatedAt: new Date('2026-10-10T19:00:00.000Z'),
        status: 'success',
        parserVersion: 'v1',
        parsedAt: new Date('2026-10-10T20:00:00.000Z'),
        sourceGeneratedAt: null,
        contentLength: 100,
        bytesDownloaded: 100,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date('2026-10-10T20:00:00.000Z'),
        updatedAt: new Date('2026-10-10T20:00:00.000Z'),
        hasParsedPayload: 1,
      },
    ])
  })

  it('renvoie la couverture du clan demandé, calculée pour lui seul', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { backlog?: unknown; engineStatus?: unknown; rows?: unknown[]; summary?: { success: number } }

    expect(mocks.getClanTelemetryBacklog).toHaveBeenCalledWith(7)
    expect(mocks.getTelemetryBacklogSummary).not.toHaveBeenCalled()
    expect(payload.backlog).toEqual(BACKLOG)
    expect(payload).not.toHaveProperty('engineStatus')
    expect(payload.rows).toHaveLength(1)
    expect(payload.summary?.success).toBe(1)
  })

  it('une erreur du calcul de couverture ne casse pas la page : backlog absent', async () => {
    mocks.getClanTelemetryBacklog.mockRejectedValue(new Error('base indisponible'))
    const response = await request()
    expect(response.status).toBe(200)
    expect(((await response.json()) as { backlog: unknown }).backlog).toBeNull()
  })

  it('garde Plateforme : un refus est renvoyé tel quel, sans lecture', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))
    const response = await request()
    expect(response.status).toBe(403)
    expect(mocks.queryRaw).not.toHaveBeenCalled()
    expect(mocks.getClanTelemetryBacklog).not.toHaveBeenCalled()
  })
})
