import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const PERIODS = ['week', 'month', 'all'] as const

function getPeriodStart(period: string): Date | null {
  const now = new Date()
  if (period === 'week') {
    now.setDate(now.getDate() - 7)
    return now
  }
  if (period === 'month') {
    now.setDate(now.getDate() - 30)
    return now
  }
  return null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isCron = request.headers.get('x-vercel-cron') === '1'
  const isSuperUser = url.searchParams.get('force') === 'true' // In a real app we'd check auth

  if (!isCron && !isSuperUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    for (const period of PERIODS) {
      const periodStart = getPeriodStart(period)
      const periodFilter = periodStart ? Prisma.sql`AND ce.lastSeenAt >= ${periodStart}` : Prisma.empty

      // Fetch aggregated stats for this period for all opponent clans
      const aggregates = await prisma.$queryRaw<
        Array<{
          id: string
          asOpponentCount: bigint
          asTeammateCount: bigint
          lastSeenAt: Date
        }>
      >(Prisma.sql`
        SELECT
          oc.id as id,
          SUM(ce.encounterCount - ce.teammateEncounterCount) as asOpponentCount,
          SUM(ce.teammateEncounterCount) as asTeammateCount,
          MAX(ce.lastSeenAt) as lastSeenAt
        FROM ClanEncounter ce
        INNER JOIN Player p ON p.id = ce.playerId
        INNER JOIN OpponentClan oc ON oc.id = p.opponentClanId
        WHERE 1=1 
          ${periodFilter}
          AND NOT EXISTS (
            SELECT 1 FROM Clan c 
            WHERE c.pubgClanId = oc.pubgClanId 
              AND c.platformShard = oc.platformShard
              AND c.isActive = 1
          )
        GROUP BY oc.id
      `)

      // Delete existing stats for this period to completely refresh them
      await prisma.opponentClanStatsCache.deleteMany({
        where: { period }
      })

      // We need to also calculate memberCount (all time) for each OpponentClan.
      const memberCountsRaw = await prisma.$queryRaw<Array<{ opponentClanId: string; count: bigint }>>(Prisma.sql`
        SELECT opponentClanId, COUNT(*) as count 
        FROM Player 
        WHERE opponentClanId IS NOT NULL 
        GROUP BY opponentClanId
      `)
      const memberCounts = new Map(memberCountsRaw.map(row => [row.opponentClanId, Number(row.count)]))

      // And we need to calculate how many tracked clans encountered this opponent clan (all time).
      const trackedClansCountsRaw = await prisma.$queryRaw<Array<{ opponentClanId: string; count: bigint }>>(Prisma.sql`
        SELECT
          p.opponentClanId,
          COUNT(DISTINCT ce.clanId) as count
        FROM ClanEncounter ce
        INNER JOIN Player p ON p.id = ce.playerId
        WHERE p.opponentClanId IS NOT NULL
        GROUP BY p.opponentClanId
      `)
      const trackedClansCounts = new Map(trackedClansCountsRaw.map(row => [row.opponentClanId, Number(row.count)]))

      // Insert the new stats in chunks
      const chunkSize = 1000
      for (let i = 0; i < aggregates.length; i += chunkSize) {
        const chunk = aggregates.slice(i, i + chunkSize)
        await prisma.opponentClanStatsCache.createMany({
          data: chunk.map((agg) => ({
            opponentClanId: agg.id,
            period,
            periodKey: period,
            asOpponentCount: Number(agg.asOpponentCount),
            asTeammateCount: Number(agg.asTeammateCount),
            lastSeenAt: agg.lastSeenAt,
            memberCount: memberCounts.get(agg.id) || 0,
            trackedClansCount: trackedClansCounts.get(agg.id) || 0
          }))
        })
      }

      // Calculate global stats for this period
      const [noClanAggregate] = await prisma.$queryRaw<Array<{ playerCount: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT p.id) as playerCount
        FROM ClanEncounter ce
        INNER JOIN Player p ON p.id = ce.playerId
        WHERE p.opponentClanId IS NULL ${periodFilter}
      `)
      const [withClanAggregate] = await prisma.$queryRaw<Array<{ playerCount: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT p.id) as playerCount
        FROM ClanEncounter ce
        INNER JOIN Player p ON p.id = ce.playerId
        WHERE p.opponentClanId IS NOT NULL ${periodFilter}
      `)
      const totalEncountersAggregate = await prisma.clanEncounter.aggregate({
        where: periodStart ? { lastSeenAt: { gte: periodStart } } : undefined,
        _sum: { encounterCount: true },
      })
      const trackedClanCount = await prisma.clan.count({ where: { isActive: true } })
      const opponentClanCount = await prisma.opponentClan.count()
      const uniquePlayersCount = await prisma.player.count()
      const trackedClanMatchCount = await prisma.match.count({
        where: periodStart ? { pubgCreatedAt: { gte: periodStart } } : undefined,
      })

      await prisma.systemStatsCache.upsert({
        where: { period },
        update: {
          trackedClanCount,
          opponentClanCount,
          totalEncounters: totalEncountersAggregate._sum.encounterCount ?? 0,
          noClanPlayerCount: Number(noClanAggregate?.playerCount ?? 0),
          withClanPlayerCount: Number(withClanAggregate?.playerCount ?? 0),
          trackedClanMatchCount,
          uniquePlayersCount,
        },
        create: {
          period,
          trackedClanCount,
          opponentClanCount,
          totalEncounters: totalEncountersAggregate._sum.encounterCount ?? 0,
          noClanPlayerCount: Number(noClanAggregate?.playerCount ?? 0),
          withClanPlayerCount: Number(withClanAggregate?.playerCount ?? 0),
          trackedClanMatchCount,
          uniquePlayersCount,
        }
      })
    }

    // Finally, update missingMembersCount for all tracked clans (all time, not per period)
    const missingMembersAggregates = await prisma.$queryRaw<Array<{ clanId: number; missingCount: bigint }>>(
      Prisma.sql`
        SELECT c.id as clanId, COUNT(DISTINCT p.id) as missingCount
        FROM Clan c
        INNER JOIN OpponentClan oc ON oc.pubgClanId = c.pubgClanId AND oc.platformShard = c.platformShard
        INNER JOIN Player p ON p.opponentClanId = oc.id
        WHERE c.pubgClanId IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ClanMember cm WHERE cm.clanId = c.id AND cm.pubgAccountId = p.pubgAccountId
          )
        GROUP BY c.id
      `
    )
    for (const agg of missingMembersAggregates) {
      await prisma.clan.update({
        where: { id: agg.clanId },
        data: { missingMembersCount: Number(agg.missingCount) }
      })
    }

    return Response.json({ success: true })
  } catch (error: any) {
    console.error('Error calculating opponent stats:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
