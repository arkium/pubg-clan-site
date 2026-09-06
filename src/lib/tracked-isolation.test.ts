import { recalculateStatsForClan } from './stats-calculator'
import { precomputeClanMatchesStats } from './matches-cache-service'
import { prisma } from './prisma'

// This test ensures that a ClanMember with joinStatus = 'tracked'
// does not pollute clan aggregates (PlayerStats, ClanMatchesCache).
describe('Watchlist Isolation (joinStatus: tracked)', () => {
  it('excludes tracked members from PlayerStats and the clan matches cache', async () => {
    const clan = await prisma.clan.create({
      data: { name: 'Test Isolation Clan', tag: 'ISOL', isActive: true },
    })

    try {
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

      const squadMatch = await prisma.squadMatch.create({
        data: {
          pubgMatchId: 'match_isolation_test_1',
          gameMode: 'squad',
          mapName: 'Erangel',
          placement: 1,
          createdAt: new Date(),
          totalKills: 105,
          totalDamage: 25500,
          totalAssists: 3,
          totalRevives: 1,
          members: {
            create: [
              {
                memberId: activeMember.id,
                kills: 5,
                damage: 500,
                assists: 1,
                revives: 0,
                placement: 1,
              },
              {
                // Huge stats: must never reach clan aggregates while 'tracked'.
                memberId: trackedMember.id,
                kills: 100,
                damage: 25000,
                assists: 2,
                revives: 1,
                placement: 1,
              },
            ],
          },
        },
      })

      await recalculateStatsForClan(clan.id)
      await precomputeClanMatchesStats(clan.id)

      const activeStats = await prisma.playerStats.findUnique({
        where: { memberId_period: { memberId: activeMember.id, period: 'all-time' } },
      })
      expect(activeStats?.totalKills).toBe(5)
      expect(activeStats?.totalDamage).toBe(500)

      const trackedStatsCount = await prisma.playerStats.count({
        where: { memberId: trackedMember.id },
      })
      expect(trackedStatsCount).toBe(0)

      const cache = await prisma.clanMatchesCache.findUnique({
        where: { clanId_period_matchType: { clanId: clan.id, period: 'all', matchType: 'all' } },
      })
      const payload = cache?.payload as unknown as {
        globalStats: { totalKills: number; totalDamage: number }
        rosterStats: Array<{ memberId: number }>
      }
      expect(payload.globalStats.totalKills).toBe(5)
      expect(payload.globalStats.totalDamage).toBe(500)
      expect(payload.rosterStats).toHaveLength(1)
      expect(payload.rosterStats[0].memberId).toBe(activeMember.id)

      await prisma.squadMatch.delete({ where: { id: squadMatch.id } })
    } finally {
      await prisma.clanMatchesCache.deleteMany({ where: { clanId: clan.id } })
      await prisma.playerStats.deleteMany({ where: { member: { clanId: clan.id } } })
      await prisma.clanMember.deleteMany({ where: { clanId: clan.id } })
      await prisma.clan.delete({ where: { id: clan.id } })
    }
  })
})
