import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  squadMatchFindMany: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  memberTelemetryDeleteMany: vi.fn(),
  memberTelemetryCreateMany: vi.fn(),
  memberWeaponDeleteMany: vi.fn(),
  memberWeaponCreateMany: vi.fn(),
  clanSynergyDeleteMany: vi.fn(),
  clanSynergyCreateMany: vi.fn(),
  memberBodyZoneDeleteMany: vi.fn(),
  memberBodyZoneCreateMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    squadMatch: {
      findMany: mocks.squadMatchFindMany,
    },
    $queryRaw: mocks.queryRaw,
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
    memberBodyZoneStats: {
      deleteMany: mocks.memberBodyZoneDeleteMany,
      createMany: mocks.memberBodyZoneCreateMany,
    },
  },
}))

import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'

describe('recalculateTelemetryPeriodAggregatesForClan', () => {
  beforeEach(() => {
    mocks.squadMatchFindMany.mockReset()
    mocks.queryRaw.mockReset()
    mocks.transaction.mockReset()
    mocks.memberTelemetryDeleteMany.mockReset()
    mocks.memberTelemetryCreateMany.mockReset()
    mocks.memberWeaponDeleteMany.mockReset()
    mocks.memberWeaponCreateMany.mockReset()
    mocks.clanSynergyDeleteMany.mockReset()
    mocks.clanSynergyCreateMany.mockReset()
    mocks.memberBodyZoneDeleteMany.mockReset()
    mocks.memberBodyZoneCreateMany.mockReset()

    mocks.transaction.mockImplementation(async (callback: () => Promise<void>) => callback())
    mocks.memberTelemetryDeleteMany.mockResolvedValue({ count: 0 })
    mocks.memberTelemetryCreateMany.mockResolvedValue({ count: 0 })
    mocks.memberWeaponDeleteMany.mockResolvedValue({ count: 0 })
    mocks.memberWeaponCreateMany.mockResolvedValue({ count: 0 })
    mocks.clanSynergyDeleteMany.mockResolvedValue({ count: 0 })
    mocks.clanSynergyCreateMany.mockResolvedValue({ count: 0 })
    mocks.memberBodyZoneDeleteMany.mockResolvedValue({ count: 0 })
    mocks.memberBodyZoneCreateMany.mockResolvedValue({ count: 0 })
  })

  it('is idempotent for identical successful snapshots across all periods', async () => {
    mocks.squadMatchFindMany.mockResolvedValue([
      {
        id: 'squad-1',
        members: [
          {
            // Distances de l'API PUBG, en mètres : la source des moyennes (la nage compte « à pied »).
            walkDistance: 1150,
            swimDistance: 50,
            rideDistance: 3400,
            member: {
              id: 101,
              clanId: 7,
              pubgPlayerName: 'PlayerA',
              pubgAccountId: 'account.a',
            },
          },
          {
            walkDistance: 1800,
            swimDistance: 0,
            rideDistance: 900,
            member: {
              id: 102,
              clanId: 7,
              pubgPlayerName: 'PlayerB',
              pubgAccountId: 'account.b',
            },
          },
        ],
      },
    ])

    const memberStatsFixture = [
      {
        memberKey: 'account.a',
        firstKillPhase: 2,
        kills: 2,
        revives: 1,
        knockouts: 1,
        damageTaken: 80,
        // Centimètres de la télémétrie, avion compris : ignorés par les moyennes.
        onFootDistanceMeters: 864_898,
        vehicleDistanceMeters: 1_035_597,
        blueZoneHits: 1,
        circleDelaySeconds: 18,
        circleDelayPercent: 40,
        damageDealt: 250,
        vehicleRideEvents: 2,
        vehicleLeaveEvents: 1,
        positionEvents: 3,
        healsUsed: 0,
        healAmountTotal: 0,
        boostsUsed: 0,
        maxVehicleSpeedKph: 0,
        weapons: [
          {
            weaponName: 'WeapM416_C',
            kills: 2,
            headshots: 1,
            damageDealt: 250,
            shotsFired: 0,
            hitsLanded: 0,
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
        onFootDistanceMeters: 999_999,
        vehicleDistanceMeters: 999_999,
        blueZoneHits: 0,
        circleDelaySeconds: 6,
        circleDelayPercent: 15,
        damageDealt: 140,
        vehicleRideEvents: 1,
        vehicleLeaveEvents: 2,
        positionEvents: 1,
        healsUsed: 0,
        healAmountTotal: 0,
        boostsUsed: 0,
        maxVehicleSpeedKph: 0,
        weapons: [
          {
            weaponName: 'WeapAK47_C',
            kills: 1,
            headshots: 0,
            damageDealt: 140,
            shotsFired: 0,
            hitsLanded: 0,
            killDistanceTotal: 30,
            killDistanceCount: 1,
            killDistanceMax: 30,
          },
        ],
      },
    ]

    mocks.queryRaw.mockResolvedValue([
      {
        squadMatchId: 'squad-1',
        memberStats: JSON.stringify(memberStatsFixture),
        weaponStats: JSON.stringify([]),
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
          clanSynergyRows: 2,
          memberBodyZoneRows: 0,
        },
        {
          period: 'month',
          periodKey: 'month-2026-06',
          memberTelemetryRows: 2,
          memberWeaponRows: 2,
          clanSynergyRows: 2,
          memberBodyZoneRows: 0,
        },
        {
          period: 'all',
          periodKey: 'all-time',
          memberTelemetryRows: 2,
          memberWeaponRows: 2,
          clanSynergyRows: 2,
          memberBodyZoneRows: 0,
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
          // Les trois scores sont normalisés par rapport au meilleur joueur de
          // la période, pas sur une échelle absolue : le 101 domine
          // l'agressivité (100) mais encaisse le seul passage en zone bleue du
          // groupe, ce qui l'ancre à 0 sur la discipline de zone.
          aggressionScore: 100,
          supportScore: 100,
          zoneDisciplineScore: 0,
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
          avgHealsUsed: 0,
          avgHealAmount: 0,
          avgBoostsUsed: 0,
          maxVehicleSpeedKph: 0,
          matchesPlayed: 1,
        },
        {
          memberId: 102,
          period: 'week-2026-23',
          periodType: 'week',
          aggressionScore: 41.23,
          supportScore: 100,
          // Aucun passage en zone bleue : c'est le joueur le plus propre.
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
          avgHealsUsed: 0,
          avgHealAmount: 0,
          avgBoostsUsed: 0,
          maxVehicleSpeedKph: 0,
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
          shotsFired: 0,
          hitsLanded: 0,
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
          shotsFired: 0,
          hitsLanded: 0,
          avgDistance: 30,
          maxDistance: 30,
          totalDamage: 140,
          matchCount: 1,
        },
      ],
      skipDuplicates: true,
    })

    // 2 membres dans le squad -> mode 'duo' ; le fixture ne fournit pas de
    // matchType -> seul le bucket 'all' matche (voir matchTypeMatchesFilter),
    // d'où 2 lignes : (all|duo) puis (all|all) — CLAN_SYNERGY_TEAM_MODES
    // itère duo/trio/squad/all dans cet ordre.
    expect(firstSynergyWrites[0]).toEqual({
      data: [
        {
          clanId: 7,
          memberAId: 101,
          memberBId: 102,
          period: 'week-2026-23',
          periodType: 'week',
          matchType: 'all',
          mode: 'duo',
          reviveCount: 1,
          recallCount: 0,
          coKillCount: 1,
          sharedDamageEvents: 1,
        },
        {
          clanId: 7,
          memberAId: 101,
          memberBId: 102,
          period: 'week-2026-23',
          periodType: 'week',
          matchType: 'all',
          mode: 'all',
          reviveCount: 1,
          recallCount: 0,
          coKillCount: 1,
          sharedDamageEvents: 1,
        },
      ],
    })
  })

  it('partitions clan synergy rows by matchType (official/casual/custom/all)', async () => {
    mocks.squadMatchFindMany.mockResolvedValue([
      {
        id: 'squad-casual-1',
        matchType: 'casual',
        members: [
          {
            member: {
              id: 201,
              clanId: 7,
              pubgPlayerName: 'PlayerC',
              pubgAccountId: 'account.c',
            },
          },
          {
            member: {
              id: 202,
              clanId: 7,
              pubgPlayerName: 'PlayerD',
              pubgAccountId: 'account.d',
            },
          },
        ],
      },
    ])

    mocks.queryRaw.mockResolvedValue([
      {
        squadMatchId: 'squad-casual-1',
        memberStats: JSON.stringify([
          { memberKey: 'account.c', kills: 1, revives: 0, recalls: 0, damageDealt: 50 },
          { memberKey: 'account.d', kills: 1, revives: 0, recalls: 0, damageDealt: 50 },
        ]),
        weaponStats: JSON.stringify([]),
      },
    ])

    const referenceDate = new Date('2026-06-03T12:00:00.000Z')
    await recalculateTelemetryPeriodAggregatesForClan(7, referenceDate)

    const weekSynergyWrite = mocks.clanSynergyCreateMany.mock.calls[0][0]
    const combosWritten = weekSynergyWrite.data
      .map((row: { matchType: string; mode: string }) => `${row.matchType}|${row.mode}`)
      .sort()

    // 2 membres -> mode 'duo'. La paire n'appartient qu'aux combinaisons
    // (matchType: casual|all) × (mode: duo|all) — jamais official/custom ni trio/squad.
    expect(combosWritten).toEqual(['all|all', 'all|duo', 'casual|all', 'casual|duo'])
    for (const combo of weekSynergyWrite.data) {
      expect(combo).toMatchObject({ memberAId: 201, memberBId: 202, coKillCount: 1 })
    }
  })

  describe('zones d’impact (docs/TODO/zones-d-impact.md)', () => {
    const member = (id: number, clanId: number, name: string) => ({
      walkDistance: 0,
      swimDistance: 0,
      rideDistance: 0,
      member: { id, clanId, pubgPlayerName: name, pubgAccountId: `account.${name.toLowerCase()}` },
    })
    const stats = (memberKey: string, zones: Record<string, unknown> = {}) => ({ memberKey, kills: 1, weapons: [], ...zones })

    function seed(matches: Array<{ id: string; memberStats: unknown[] }>) {
      mocks.squadMatchFindMany.mockResolvedValue(
        matches.map((match) => ({ id: match.id, matchType: 'official', members: [member(301, 7, 'Alpha'), member(302, 9, 'Autre')] }))
      )
      mocks.queryRaw.mockResolvedValue(
        matches.map((match) => ({ squadMatchId: match.id, memberStats: JSON.stringify(match.memberStats), weaponStats: '[]' }))
      )
    }
    const writtenRows = () => mocks.memberBodyZoneCreateMany.mock.calls.flatMap((call) => call[0].data)

    it('écrit une ligne par membre du clan, côté et zone touchée ; une zone inconnue va en « other »', async () => {
      seed([
        {
          id: 'squad-z',
          memberStats: [
            stats('account.alpha', {
              bodyZonesDealt: [
                { zone: 'head', hits: 2, damage: 80 },
                { zone: 'torso', hits: 5, damage: 150.456 },
                { zone: 'tentacle', hits: 1, damage: 10 },
              ],
              bodyZonesTaken: [{ zone: 'other', hits: 2, damage: 20 }],
            }),
            stats('account.autre', { bodyZonesDealt: [{ zone: 'head', hits: 9, damage: 300 }], bodyZonesTaken: [] }),
          ],
        },
      ])

      const result = await recalculateTelemetryPeriodAggregatesForClan(7, new Date('2026-10-28T12:00:00'))

      const weekRows = writtenRows().filter((row) => row.period === 'week-2026-44')
      expect(weekRows).toEqual([
        { memberId: 301, period: 'week-2026-44', periodType: 'week', side: 'dealt', zone: 'head', hits: 2, damage: 80, matchesMeasured: 1 },
        { memberId: 301, period: 'week-2026-44', periodType: 'week', side: 'dealt', zone: 'torso', hits: 5, damage: 150.46, matchesMeasured: 1 },
        { memberId: 301, period: 'week-2026-44', periodType: 'week', side: 'dealt', zone: 'other', hits: 1, damage: 10, matchesMeasured: 1 },
        { memberId: 301, period: 'week-2026-44', periodType: 'week', side: 'taken', zone: 'other', hits: 2, damage: 20, matchesMeasured: 1 },
      ])
      // Le joueur d'un autre clan n'est pas écrit ; les anciennes lignes de la clé sont effacées avant, pour ce clan.
      expect(writtenRows().every((row) => row.memberId === 301)).toBe(true)
      expect(mocks.memberBodyZoneDeleteMany).toHaveBeenCalledWith({ where: { period: 'week-2026-44', member: { clanId: 7 } } })
      expect(result.summaries.map((summary) => summary.memberBodyZoneRows)).toEqual([4, 4, 4])
    })

    it('une partie analysée avant le parseur à zones n’est ni comptée ni mesurée ; deux passes écrivent la même chose', async () => {
      seed([
        { id: 'avant', memberStats: [stats('account.alpha')] },
        { id: 'apres', memberStats: [stats('account.alpha', { bodyZonesDealt: [{ zone: 'legs', hits: 3, damage: 45 }], bodyZonesTaken: [] })] },
      ])

      await recalculateTelemetryPeriodAggregatesForClan(7, new Date('2026-10-28T12:00:00'))
      const first = writtenRows()
      expect(first.filter((row) => row.period === 'all-time')).toEqual([
        { memberId: 301, period: 'all-time', periodType: 'all', side: 'dealt', zone: 'legs', hits: 3, damage: 45, matchesMeasured: 1 },
      ])

      mocks.memberBodyZoneCreateMany.mockClear()
      await recalculateTelemetryPeriodAggregatesForClan(7, new Date('2026-10-28T12:00:00'))
      expect(writtenRows()).toEqual(first)
    })

    it('le lundi, recalcule aussi la semaine précédente ; le 2 du mois, le mois précédent', async () => {
      seed([{ id: 'squad-z', memberStats: [stats('account.alpha', { bodyZonesDealt: [], bodyZonesTaken: [] })] }])
      const keys = async (date: string) =>
        (await recalculateTelemetryPeriodAggregatesForClan(7, new Date(date))).summaries.map((summary) => summary.periodKey)
      expect(await keys('2026-11-09T08:00:00')).toEqual(['week-2026-46', 'week-2026-45', 'month-2026-11', 'all-time'])
      expect(await keys('2026-11-02T08:00:00')).toEqual(['week-2026-45', 'week-2026-44', 'month-2026-11', 'month-2026-10', 'all-time'])
    })
  })
})
