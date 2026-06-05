import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  transaction: vi.fn(),
  memberTelemetryDeleteMany: vi.fn(),
  memberTelemetryCreateMany: vi.fn(),
  memberWeaponDeleteMany: vi.fn(),
  memberWeaponCreateMany: vi.fn(),
  clanSynergyDeleteMany: vi.fn(),
  clanSynergyCreateMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    squadMatchTelemetry: {
      findMany: mocks.findMany,
    },
    $transaction: mocks.transaction,
    memberTelemetryStats: {
      deleteMany: mocks.memberTelemetryDeleteMany,
      createMany: mocks.memberTelemetryCreateMany,
    },
    memberWeaponStats: {
      deleteMany: mocks.memberWeaponDeleteMany,
      createMany: mocks.memberWeaponCreateMany,
    },
    clanSynergyTelemetryStats: {
      deleteMany: mocks.clanSynergyDeleteMany,
      createMany: mocks.clanSynergyCreateMany,
    },
  },
}))

import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'

describe('recalculateTelemetryPeriodAggregatesForClan', () => {
  beforeEach(() => {
    mocks.findMany.mockReset()
    mocks.transaction.mockReset()
    mocks.memberTelemetryDeleteMany.mockReset()
    mocks.memberTelemetryCreateMany.mockReset()
    mocks.memberWeaponDeleteMany.mockReset()
    mocks.memberWeaponCreateMany.mockReset()
    mocks.clanSynergyDeleteMany.mockReset()
    mocks.clanSynergyCreateMany.mockReset()

    mocks.transaction.mockImplementation(async (callback: () => Promise<void>) => callback())
    mocks.memberTelemetryDeleteMany.mockResolvedValue({ count: 0 })
    mocks.memberTelemetryCreateMany.mockResolvedValue({ count: 0 })
    mocks.memberWeaponDeleteMany.mockResolvedValue({ count: 0 })
    mocks.memberWeaponCreateMany.mockResolvedValue({ count: 0 })
    mocks.clanSynergyDeleteMany.mockResolvedValue({ count: 0 })
    mocks.clanSynergyCreateMany.mockResolvedValue({ count: 0 })
  })

  it('is idempotent for identical successful snapshots across all periods', async () => {
    mocks.findMany.mockResolvedValue([
      {
        squadMatchId: 'squad-1',
        memberStats: [
          {
            memberKey: 'account.a',
            firstKillPhase: 2,
            kills: 2,
            revives: 1,
            knockouts: 1,
            damageTaken: 80,
            onFootDistanceMeters: 1200,
            vehicleDistanceMeters: 3400,
            blueZoneHits: 1,
            circleDelaySeconds: 18,
            circleDelayPercent: 40,
            damageDealt: 250,
            vehicleRideEvents: 2,
            vehicleLeaveEvents: 1,
            positionEvents: 3,
            weapons: [
              {
                weaponName: 'WeapM416_C',
                kills: 2,
                headshots: 1,
                damageDealt: 250,
                killDistanceTotal: 120,
                killDistanceCount: 2,
                killDistanceMax: 120,
              },
            ],
          },
          {
            memberKey: 'account.b',
            firstKillPhase: 4,
            kills: 1,
            revives: 1,
            knockouts: 0,
            damageTaken: 120,
            onFootDistanceMeters: 1800,
            vehicleDistanceMeters: 900,
            blueZoneHits: 0,
            circleDelaySeconds: 6,
            circleDelayPercent: 15,
            damageDealt: 140,
            vehicleRideEvents: 1,
            vehicleLeaveEvents: 2,
            positionEvents: 1,
            weapons: [
              {
                weaponName: 'WeapAK47_C',
                kills: 1,
                headshots: 0,
                damageDealt: 140,
                killDistanceTotal: 30,
                killDistanceCount: 1,
                killDistanceMax: 30,
              },
            ],
          },
        ],
        weaponStats: [],
        squadMatch: {
          members: [
            {
              member: {
                id: 101,
                clanId: 7,
                pubgPlayerName: 'PlayerA',
                pubgAccountId: 'account.a',
              },
            },
            {
              member: {
                id: 102,
                clanId: 7,
                pubgPlayerName: 'PlayerB',
                pubgAccountId: 'account.b',
              },
            },
          ],
        },
      },
    ])

    const referenceDate = new Date('2026-06-03T12:00:00.000Z')

    const firstResult = await recalculateTelemetryPeriodAggregatesForClan(7, referenceDate)

    const firstMemberTelemetryWrites = mocks.memberTelemetryCreateMany.mock.calls.map((call) => call[0])
    const firstMemberWeaponWrites = mocks.memberWeaponCreateMany.mock.calls.map((call) => call[0])
    const firstSynergyWrites = mocks.clanSynergyCreateMany.mock.calls.map((call) => call[0])

    mocks.memberTelemetryCreateMany.mockClear()
    mocks.memberWeaponCreateMany.mockClear()
    mocks.clanSynergyCreateMany.mockClear()

    const secondResult = await recalculateTelemetryPeriodAggregatesForClan(7, referenceDate)

    const secondMemberTelemetryWrites = mocks.memberTelemetryCreateMany.mock.calls.map((call) => call[0])
    const secondMemberWeaponWrites = mocks.memberWeaponCreateMany.mock.calls.map((call) => call[0])
    const secondSynergyWrites = mocks.clanSynergyCreateMany.mock.calls.map((call) => call[0])

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).toEqual({
      clanId: 7,
      summaries: [
        {
          period: 'week',
          periodKey: 'week-2026-23',
          memberTelemetryRows: 2,
          memberWeaponRows: 2,
          clanSynergyRows: 1,
        },
        {
          period: 'month',
          periodKey: 'month-2026-06',
          memberTelemetryRows: 2,
          memberWeaponRows: 2,
          clanSynergyRows: 1,
        },
        {
          period: 'all',
          periodKey: 'all-time',
          memberTelemetryRows: 2,
          memberWeaponRows: 2,
          clanSynergyRows: 1,
        },
      ],
    })

    expect(secondMemberTelemetryWrites).toEqual(firstMemberTelemetryWrites)
    expect(secondMemberWeaponWrites).toEqual(firstMemberWeaponWrites)
    expect(secondSynergyWrites).toEqual(firstSynergyWrites)

    expect(firstMemberTelemetryWrites[0]).toEqual({
      data: [
        {
          memberId: 101,
          period: 'week-2026-23',
          periodType: 'week',
          aggressionScore: 19.67,
          supportScore: 34,
          zoneDisciplineScore: 85,
          avgBlueZoneHits: 1,
          avgFirstContactPhase: 2,
          avgCircleDelaySeconds: 18,
          avgCircleDelayPercent: 40,
          avgSafeZonePresencePercent: 60,
          avgOnFootDistanceMeters: 1200,
          avgVehicleDistanceMeters: 3400,
          avgDamageTaken: 80,
          avgVehicleRideEvents: 2,
          avgVehicleLeaveEvents: 1,
          avgPositionEvents: 3,
          matchesPlayed: 1,
        },
        {
          memberId: 102,
          period: 'week-2026-23',
          periodType: 'week',
          aggressionScore: 8.93,
          supportScore: 34,
          zoneDisciplineScore: 100,
          avgBlueZoneHits: 0,
          avgFirstContactPhase: 4,
          avgCircleDelaySeconds: 6,
          avgCircleDelayPercent: 15,
          avgSafeZonePresencePercent: 85,
          avgOnFootDistanceMeters: 1800,
          avgVehicleDistanceMeters: 900,
          avgDamageTaken: 120,
          avgVehicleRideEvents: 1,
          avgVehicleLeaveEvents: 2,
          avgPositionEvents: 1,
          matchesPlayed: 1,
        },
      ],
    })

    expect(firstMemberWeaponWrites[0]).toEqual({
      data: [
        {
          memberId: 101,
          period: 'week-2026-23',
          periodType: 'week',
          weaponName: 'WeapM416_C',
          kills: 2,
          headshots: 1,
          avgDistance: 60,
          maxDistance: 120,
          totalDamage: 250,
          matchCount: 1,
        },
        {
          memberId: 102,
          period: 'week-2026-23',
          periodType: 'week',
          weaponName: 'WeapAK47_C',
          kills: 1,
          headshots: 0,
          avgDistance: 30,
          maxDistance: 30,
          totalDamage: 140,
          matchCount: 1,
        },
      ],
    })

    expect(firstSynergyWrites[0]).toEqual({
      data: [
        {
          clanId: 7,
          memberAId: 101,
          memberBId: 102,
          period: 'week-2026-23',
          periodType: 'week',
          reviveCount: 1,
          coKillCount: 1,
          sharedDamageEvents: 1,
        },
      ],
    })
  })
})