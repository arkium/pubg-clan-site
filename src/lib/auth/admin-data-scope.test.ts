import { beforeEach, describe, expect, it, vi } from 'vitest'

// Contrôles d'appartenance des données (docs/TODO/administration.md M5, M17) : une action d'un clan ne touche
// jamais les données d'un autre clan, même quand les identifiants viennent du client. Prisma entièrement simulé.
const mocks = vi.hoisted(() => ({
  telemetryDeleteMany: vi.fn(),
  challengeFindUnique: vi.fn(),
  participantUpsert: vi.fn(),
  resyncFromFile: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    squadMatchTelemetry: { deleteMany: mocks.telemetryDeleteMany },
    challenge: { findUnique: mocks.challengeFindUnique },
    challengeParticipant: { upsert: mocks.participantUpsert },
  },
}))
vi.mock('@/lib/auth/admin-guards', () => ({ requirePlatformAdmin: async () => null }))
vi.mock('@/lib/pubg-telemetry/resync-files', () => ({
  resolveCaptureDirectory: () => '/tmp/capture-tests',
  resyncTelemetryFromCapturedFile: mocks.resyncFromFile,
}))
vi.mock('@/lib/pubg-telemetry/period-aggregates', () => ({
  recalculateTelemetryPeriodAggregatesForClan: vi.fn(),
}))

import { POST as postResyncFilesSelected } from '@/app/api/clans/[clanId]/telemetry/resync-files-selected/route'
import { joinChallenge } from '@/lib/challenge-service'

describe('portée des données par clan', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.telemetryDeleteMany.mockResolvedValue({ count: 0 })
    mocks.resyncFromFile.mockResolvedValue({ status: 'missing' })
  })

  it('resetBeforeSync ne supprime que la télémétrie des parties du clan de l’adresse (M5)', async () => {
    const response = await postResyncFilesSelected(
      new Request('http://localhost:3000/api/clans/7/telemetry/resync-files-selected', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squadMatchIds: ['sm-clan-7', 'sm-autre-clan'], resetBeforeSync: true, recalculateAggregates: false }),
      }) as never,
      { params: Promise.resolve({ clanId: '7' }) }
    )

    expect(response.status).toBeLessThan(500)
    expect(mocks.telemetryDeleteMany).toHaveBeenCalledWith({
      where: {
        squadMatchId: { in: ['sm-clan-7', 'sm-autre-clan'] },
        squadMatch: { members: { some: { member: { clanId: 7 } } } },
      },
    })
  })

  it('refuse l’inscription au défi d’un autre clan (M17)', async () => {
    mocks.challengeFindUnique.mockResolvedValue({ id: 'c1', status: 'active', clanId: 8 })

    await expect(joinChallenge('c1', 100, 7)).rejects.toThrow('Challenge not found')
    expect(mocks.participantUpsert).not.toHaveBeenCalled()

    mocks.challengeFindUnique.mockResolvedValue({ id: 'c1', status: 'active', clanId: 7 })
    mocks.participantUpsert.mockResolvedValue({ challengeId: 'c1', memberId: 100 })
    await expect(joinChallenge('c1', 100, 7)).resolves.toMatchObject({ challengeId: 'c1' })
  })
})
