import { getDropPressureDashboardStats } from './drop-pressure-stats'
import { prisma } from './prisma'

// Vérifie que le filtre matchType (bandeau /clans/[clanId]/overview) est bien
// appliqué à la requête live sur DropPressureStat via la relation squadMatch,
// puisque DropPressureStat n'a pas de colonne matchType propre.
describe('Match type filtering (DropPressureStat live query)', () => {
  it('filters dashboard stats by matchType via the squadMatch relation', async () => {
    const clan = await prisma.clan.create({
      data: { name: 'DropPressure MType Clan', tag: 'DPMT', isActive: true },
    })

    try {
      const member = await prisma.clanMember.create({
        data: {
          clanId: clan.id,
          pubgPlayerName: 'DP1',
          displayName: 'DP1',
          pubgAccountId: 'acc_dpmt_1',
          isActive: true,
          joinStatus: 'active',
        },
      })

      const officialMatch = await prisma.squadMatch.create({
        data: {
          pubgMatchId: 'dp_mtype_official',
          gameMode: 'squad',
          matchType: 'official',
          mapName: 'Erangel',
          placement: 1,
          createdAt: new Date(),
          totalKills: 0,
          totalDamage: 0,
          totalAssists: 0,
          totalRevives: 0,
        },
      })
      const casualMatch = await prisma.squadMatch.create({
        data: {
          pubgMatchId: 'dp_mtype_casual',
          gameMode: 'squad',
          matchType: 'casual',
          mapName: 'Erangel',
          placement: 1,
          createdAt: new Date(),
          totalKills: 0,
          totalDamage: 0,
          totalAssists: 0,
          totalRevives: 0,
        },
      })

      await prisma.dropPressureStat.create({
        data: {
          squadMatchId: officialMatch.id,
          memberId: member.id,
          mapName: 'Erangel',
          x: 0,
          y: 0,
          matchDate: new Date(),
          nearbyPlayerCount250m: 5,
          pressureLevel: 'hot',
        },
      })
      await prisma.dropPressureStat.create({
        data: {
          squadMatchId: casualMatch.id,
          memberId: member.id,
          mapName: 'Erangel',
          x: 0,
          y: 0,
          matchDate: new Date(),
          nearbyPlayerCount250m: 2,
          pressureLevel: 'calm',
        },
      })

      const officialStats = await getDropPressureDashboardStats({
        clanId: clan.id,
        period: 'all',
        matchType: 'official',
      })
      expect(officialStats.dropCount).toBe(1)

      const casualStats = await getDropPressureDashboardStats({
        clanId: clan.id,
        period: 'all',
        matchType: 'casual',
      })
      expect(casualStats.dropCount).toBe(1)

      const allStats = await getDropPressureDashboardStats({
        clanId: clan.id,
        period: 'all',
        matchType: 'all',
      })
      expect(allStats.dropCount).toBe(2)
    } finally {
      await prisma.dropPressureStat.deleteMany({ where: { member: { clanId: clan.id } } })
      await prisma.squadMatch.deleteMany({
        where: { pubgMatchId: { in: ['dp_mtype_official', 'dp_mtype_casual'] } },
      })
      await prisma.clanMember.deleteMany({ where: { clanId: clan.id } })
      await prisma.clan.delete({ where: { id: clan.id } })
    }
  })

  it('filters dashboard stats by team mode via resolved squadMatchId membership', async () => {
    const clan = await prisma.clan.create({
      data: { name: 'DropPressure Mode Clan', tag: 'DPMD', isActive: true },
    })

    try {
      const [p1, p2, p3, p4] = await Promise.all(
        ['DPM1', 'DPM2', 'DPM3', 'DPM4'].map((name, i) =>
          prisma.clanMember.create({
            data: {
              clanId: clan.id,
              pubgPlayerName: name,
              displayName: name,
              pubgAccountId: `acc_dpmd_${i}`,
              isActive: true,
              joinStatus: 'active',
            },
          })
        )
      )

      const duoMatch = await prisma.squadMatch.create({
        data: {
          pubgMatchId: 'dp_mode_duo',
          gameMode: 'duo',
          matchType: 'official',
          mapName: 'Erangel',
          placement: 1,
          createdAt: new Date(),
          totalKills: 0,
          totalDamage: 0,
          totalAssists: 0,
          totalRevives: 0,
          members: {
            create: [p1, p2].map((m) => ({
              memberId: m.id,
              kills: 0,
              damage: 0,
              assists: 0,
              revives: 0,
              placement: 1,
            })),
          },
        },
      })

      const squadMatch = await prisma.squadMatch.create({
        data: {
          pubgMatchId: 'dp_mode_squad',
          gameMode: 'squad',
          matchType: 'official',
          mapName: 'Erangel',
          placement: 1,
          createdAt: new Date(),
          totalKills: 0,
          totalDamage: 0,
          totalAssists: 0,
          totalRevives: 0,
          members: {
            create: [p1, p2, p3, p4].map((m) => ({
              memberId: m.id,
              kills: 0,
              damage: 0,
              assists: 0,
              revives: 0,
              placement: 1,
            })),
          },
        },
      })

      await prisma.dropPressureStat.create({
        data: {
          squadMatchId: duoMatch.id,
          memberId: p1.id,
          mapName: 'Erangel',
          x: 0,
          y: 0,
          matchDate: new Date(),
          nearbyPlayerCount250m: 5,
          pressureLevel: 'hot',
        },
      })
      await prisma.dropPressureStat.create({
        data: {
          squadMatchId: squadMatch.id,
          memberId: p1.id,
          mapName: 'Erangel',
          x: 0,
          y: 0,
          matchDate: new Date(),
          nearbyPlayerCount250m: 2,
          pressureLevel: 'calm',
        },
      })

      const duoStats = await getDropPressureDashboardStats({ clanId: clan.id, period: 'all', mode: 'duo' })
      expect(duoStats.dropCount).toBe(1)

      const squadStats = await getDropPressureDashboardStats({ clanId: clan.id, period: 'all', mode: 'squad' })
      expect(squadStats.dropCount).toBe(1)

      const allStats = await getDropPressureDashboardStats({ clanId: clan.id, period: 'all', mode: 'all' })
      expect(allStats.dropCount).toBe(2)
    } finally {
      await prisma.dropPressureStat.deleteMany({ where: { member: { clanId: clan.id } } })
      await prisma.squadMatch.deleteMany({
        where: { pubgMatchId: { in: ['dp_mode_duo', 'dp_mode_squad'] } },
      })
      await prisma.clanMember.deleteMany({ where: { clanId: clan.id } })
      await prisma.clan.delete({ where: { id: clan.id } })
    }
  })
})
