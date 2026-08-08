import { recalculateStatsForClan } from './stats-calculator'
import { prisma } from './prisma'

// This test ensures that a ClanMember with joinStatus = 'tracked'
// does not pollute clan averages and leaderboards.
describe('Watchlist Isolation (joinStatus: tracked)', () => {
  it('should not include tracked members in clan averages or aggregations', async () => {
    // 1. Create a dummy clan
    const clan = await prisma.clan.create({
      data: { name: 'Test Isolation Clan', tag: 'ISOL', isActive: true },
    })

    // 2. Create an active member with stats
    const activeMember = await prisma.clanMember.create({
      data: {
        clanId: clan.id,
        pubgPlayerName: 'ActiveGuy',
        displayName: 'ActiveGuy',
        pubgAccountId: 'acc_active_123',
        isActive: true,
        joinStatus: 'active',
      },
    })

    await prisma.playerStats.create({
      data: {
        memberId: activeMember.id,
        period: 'season-current',
        matches: 10,
        totalKills: 20,
        totalDamage: 5000,
        wins: 1,
        top10s: 3,
        kdRatio: 2.0,
        avgDamage: 500,
        adr: 500,
        winRatio: 0.1,
        top10Ratio: 0.3,
        highestKills: 5,
        highestDamage: 1000,
        longestKill: 200,
        headshotKills: 5,
        headshotRatio: 0.25,
        timeSurvived: 10000,
        avgTimeSurvived: 1000,
        weaponsAcquired: 30,
        assists: 5,
        dbnos: 15,
        heals: 20,
        revives: 2,
        boosts: 30,
        timePlayedSeconds: 10000,
      },
    })

    // 3. Create a tracked member (watchlist) with huge stats
    const trackedMember = await prisma.clanMember.create({
      data: {
        clanId: clan.id,
        pubgPlayerName: 'TrackedGod',
        displayName: 'TrackedGod',
        pubgAccountId: 'acc_tracked_123',
        isActive: true,
        joinStatus: 'tracked',
      },
    })

    await prisma.playerStats.create({
      data: {
        memberId: trackedMember.id,
        period: 'season-current',
        matches: 10,
        totalKills: 100, // Very high
        totalDamage: 25000,
        wins: 10,
        top10s: 10,
        kdRatio: 10.0,
        avgDamage: 2500,
        adr: 2500,
        winRatio: 1.0,
        top10Ratio: 1.0,
        highestKills: 20,
        highestDamage: 3000,
        longestKill: 800,
        headshotKills: 50,
        headshotRatio: 0.5,
        timeSurvived: 20000,
        avgTimeSurvived: 2000,
        weaponsAcquired: 30,
        assists: 15,
        dbnos: 95,
        heals: 20,
        revives: 12,
        boosts: 30,
        timePlayedSeconds: 20000,
      },
    })

    // 4. Recalculate stats for clan
    await recalculateStatsForClan(clan.id)

    // 5. Fetch updated clan stats
    const clanStats = await prisma.clanStats.findFirst({
      where: { clanId: clan.id, period: 'season-current' },
    })

    expect(clanStats).not.toBeNull()

    // The averages should reflect ONLY the active member, not the tracked member.
    // E.g., avgKdRatio should be 2.0, not 6.0
    expect(clanStats?.avgKdRatio).toBeCloseTo(2.0, 1)
    expect(clanStats?.avgAdr).toBeCloseTo(500, 0)
    expect(clanStats?.avgWinRatio).toBeCloseTo(0.1, 2)
  })
})
