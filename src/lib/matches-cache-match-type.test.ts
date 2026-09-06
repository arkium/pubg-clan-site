import { precomputeClanMatchesStats } from './matches-cache-service'
import { prisma } from './prisma'

// Vérifie que precomputeClanMatchesStats partitionne correctement les
// SquadMatch par matchType (voir bandeau de filtres sur /clans/[clanId]/overview) :
// 'official' et 'custom' sont des correspondances exactes, 'casual' regroupe
// aussi 'airoyale' (cf. MatchHistory.tsx), et 'all' ignore le type.
describe('Match type filtering (ClanMatchesCache)', () => {
  it('partitions official/casual/custom/all correctly, including airoyale->casual grouping', async () => {
    const clan = await prisma.clan.create({
      data: { name: 'MatchType Test Clan', tag: 'MTYP', isActive: true },
    })

    try {
      const member = await prisma.clanMember.create({
        data: {
          clanId: clan.id,
          pubgPlayerName: 'P1',
          displayName: 'P1',
          pubgAccountId: 'acc_mtype_1',
          isActive: true,
          joinStatus: 'active',
        },
      })

      const makeMatch = (pubgMatchId: string, matchType: string, kills: number) =>
        prisma.squadMatch.create({
          data: {
            pubgMatchId,
            gameMode: 'squad',
            matchType,
            mapName: 'Erangel',
            placement: 1,
            createdAt: new Date(),
            totalKills: kills,
            totalDamage: kills * 100,
            totalAssists: 0,
            totalRevives: 0,
            members: {
              create: [
                {
                  memberId: member.id,
                  kills,
                  damage: kills * 100,
                  assists: 0,
                  revives: 0,
                  placement: 1,
                },
              ],
            },
          },
        })

      const official = await makeMatch('mtype_official', 'official', 10)
      const casual = await makeMatch('mtype_casual', 'casual', 7)
      const airoyale = await makeMatch('mtype_airoyale', 'airoyale', 4)
      const custom = await makeMatch('mtype_custom', 'custom', 3)

      await precomputeClanMatchesStats(clan.id)

      async function readCache(matchType: string) {
        const row = await prisma.clanMatchesCache.findUnique({
          where: { clanId_period_matchType: { clanId: clan.id, period: 'all', matchType } },
        })
        return row?.payload as unknown as {
          globalStats: { totalKills: number; matchCount: number }
        }
      }

      expect((await readCache('official')).globalStats).toMatchObject({
        totalKills: 10,
        matchCount: 1,
      })
      // Le bucket 'casual' regroupe 'casual' + 'airoyale'
      expect((await readCache('casual')).globalStats).toMatchObject({
        totalKills: 11,
        matchCount: 2,
      })
      expect((await readCache('custom')).globalStats).toMatchObject({
        totalKills: 3,
        matchCount: 1,
      })
      expect((await readCache('all')).globalStats).toMatchObject({
        totalKills: 24,
        matchCount: 4,
      })

      await prisma.squadMatch.deleteMany({
        where: { id: { in: [official.id, casual.id, airoyale.id, custom.id] } },
      })
    } finally {
      await prisma.clanMatchesCache.deleteMany({ where: { clanId: clan.id } })
      await prisma.playerStats.deleteMany({ where: { member: { clanId: clan.id } } })
      await prisma.clanMember.deleteMany({ where: { clanId: clan.id } })
      await prisma.clan.delete({ where: { id: clan.id } })
    }
  })

  it('exposes an unsliced per-mode roster (byMode[mode].rosterStats) with wins', async () => {
    const clan = await prisma.clan.create({
      data: { name: 'TeamMode Roster Test Clan', tag: 'TMRS', isActive: true },
    })

    try {
      const [p1, p2, p3, p4] = await Promise.all(
        ['P1', 'P2', 'P3', 'P4'].map((name, i) =>
          prisma.clanMember.create({
            data: {
              clanId: clan.id,
              pubgPlayerName: name,
              displayName: name,
              pubgAccountId: `acc_tmrs_${i}`,
              isActive: true,
              joinStatus: 'active',
            },
          })
        )
      )

      const duoMatch = await prisma.squadMatch.create({
        data: {
          pubgMatchId: 'tmrs_duo',
          gameMode: 'duo',
          matchType: 'official',
          mapName: 'Erangel',
          placement: 1,
          createdAt: new Date(),
          totalKills: 8,
          totalDamage: 800,
          totalAssists: 0,
          totalRevives: 0,
          members: {
            create: [
              { memberId: p1.id, kills: 5, damage: 500, assists: 0, revives: 0, placement: 1 },
              { memberId: p2.id, kills: 3, damage: 300, assists: 0, revives: 0, placement: 1 },
            ],
          },
        },
      })

      const squadMatch = await prisma.squadMatch.create({
        data: {
          pubgMatchId: 'tmrs_squad',
          gameMode: 'squad',
          matchType: 'official',
          mapName: 'Erangel',
          placement: 2,
          createdAt: new Date(),
          totalKills: 8,
          totalDamage: 800,
          totalAssists: 0,
          totalRevives: 0,
          members: {
            create: [p1, p2, p3, p4].map((m) => ({
              memberId: m.id,
              kills: 2,
              damage: 200,
              assists: 0,
              revives: 0,
              placement: 2,
            })),
          },
        },
      })

      await precomputeClanMatchesStats(clan.id)

      const row = await prisma.clanMatchesCache.findUnique({
        where: { clanId_period_matchType: { clanId: clan.id, period: 'all', matchType: 'official' } },
      })
      const payload = row?.payload as unknown as {
        byMode: Record<
          'all' | 'duo' | 'trio' | 'squad',
          { rosterStats: Array<{ memberId: number; matchesPlayed: number; totalKills: number; wins: number }> }
        >
      }

      const duoRoster = payload.byMode.duo.rosterStats
      expect(duoRoster).toHaveLength(2)
      expect(duoRoster.find((r) => r.memberId === p1.id)).toMatchObject({
        matchesPlayed: 1,
        totalKills: 5,
        wins: 1,
      })
      expect(duoRoster.find((r) => r.memberId === p3.id)).toBeUndefined()

      const squadRoster = payload.byMode.squad.rosterStats
      expect(squadRoster).toHaveLength(4)
      expect(squadRoster.find((r) => r.memberId === p3.id)).toMatchObject({
        matchesPlayed: 1,
        totalKills: 2,
        wins: 0,
      })

      const allRoster = payload.byMode.all.rosterStats
      expect(allRoster.find((r) => r.memberId === p1.id)).toMatchObject({
        matchesPlayed: 2,
        totalKills: 7,
        wins: 1,
      })

      await prisma.squadMatch.deleteMany({ where: { id: { in: [duoMatch.id, squadMatch.id] } } })
    } finally {
      await prisma.clanMatchesCache.deleteMany({ where: { clanId: clan.id } })
      await prisma.playerStats.deleteMany({ where: { member: { clanId: clan.id } } })
      await prisma.clanMember.deleteMany({ where: { clanId: clan.id } })
      await prisma.clan.delete({ where: { id: clan.id } })
    }
  })
})
