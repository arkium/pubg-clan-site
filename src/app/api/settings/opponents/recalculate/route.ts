import { Prisma } from '@prisma/client'
import { requireSuperUser } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

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

export async function POST(request: Request) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const t0 = Date.now()

  try {
    const body = (await request.json().catch(() => ({}))) as { period?: string }
    const period = body?.period === 'week' || body?.period === 'month' ? body.period : 'all'
    const periodStart = getPeriodStart(period)
    const periodFilter = periodStart ? Prisma.sql`AND ce.lastSeenAt >= ${periodStart}` : Prisma.empty

    // 1. Fetch aggregated stats for this period for all opponent clans
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

    // 2. Clear previous cache for this period
    await prisma.opponentClanStatsCache.deleteMany({
      where: { period },
    })

    // 3. Member counts & tracked clans count
    const [memberCountsRaw, trackedClansCountsRaw] = await Promise.all([
      prisma.$queryRaw<Array<{ opponentClanId: string; count: bigint }>>`
        SELECT opponentClanId, COUNT(*) as count 
        FROM Player 
        WHERE opponentClanId IS NOT NULL 
        GROUP BY opponentClanId
      `,
      prisma.$queryRaw<Array<{ opponentClanId: string; count: bigint }>>`
        SELECT
          p.opponentClanId,
          COUNT(DISTINCT ce.clanId) as count
        FROM ClanEncounter ce
        INNER JOIN Player p ON p.id = ce.playerId
        WHERE p.opponentClanId IS NOT NULL
        GROUP BY p.opponentClanId
      `,
    ])

    const memberCounts = new Map(memberCountsRaw.map((row) => [row.opponentClanId, Number(row.count)]))
    const trackedClansCounts = new Map(trackedClansCountsRaw.map((row) => [row.opponentClanId, Number(row.count)]))

    // 4. Insert in batches
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
          trackedClansCount: trackedClansCounts.get(agg.id) || 0,
        })),
      })
    }

    // 5. Global metrics for SystemStatsCache
    const [noClanAggregate, withClanAggregate, totalEncountersAggregate, trackedClanCount, opponentClanCount, uniquePlayersCount, trackedClanMatchCount] =
      await Promise.all([
        prisma.$queryRaw<Array<{ playerCount: bigint }>>`
          SELECT COUNT(DISTINCT p.id) as playerCount
          FROM ClanEncounter ce
          INNER JOIN Player p ON p.id = ce.playerId
          WHERE p.opponentClanId IS NULL ${periodFilter}
        `,
        prisma.$queryRaw<Array<{ playerCount: bigint }>>`
          SELECT COUNT(DISTINCT p.id) as playerCount
          FROM ClanEncounter ce
          INNER JOIN Player p ON p.id = ce.playerId
          WHERE p.opponentClanId IS NOT NULL ${periodFilter}
        `,
        prisma.clanEncounter.aggregate({
          where: periodStart ? { lastSeenAt: { gte: periodStart } } : undefined,
          _sum: { encounterCount: true },
        }),
        prisma.clan.count({ where: { isActive: true } }),
        prisma.opponentClan.count(),
        prisma.player.count(),
        prisma.match.count({
          where: periodStart ? { pubgCreatedAt: { gte: periodStart } } : undefined,
        }),
      ])

    const totalEncounters = totalEncountersAggregate._sum.encounterCount ?? 0
    const noClanPlayerCount = Number(noClanAggregate[0]?.playerCount ?? 0)
    const withClanPlayerCount = Number(withClanAggregate[0]?.playerCount ?? 0)

    const updatedSystemStats = await prisma.systemStatsCache.upsert({
      where: { period },
      update: {
        trackedClanCount,
        opponentClanCount,
        totalEncounters,
        noClanPlayerCount,
        withClanPlayerCount,
        trackedClanMatchCount,
        uniquePlayersCount,
        computedAt: new Date(),
      },
      create: {
        period,
        trackedClanCount,
        opponentClanCount,
        totalEncounters,
        noClanPlayerCount,
        withClanPlayerCount,
        trackedClanMatchCount,
        uniquePlayersCount,
        computedAt: new Date(),
      },
    })

    const durationMs = Date.now() - t0

    return Response.json({
      success: true,
      period,
      durationMs,
      counters: {
        trackedClanCount,
        opponentClanCount,
        totalEncounters,
        noClanPlayerCount,
        lastComputedAt: updatedSystemStats.computedAt.toISOString(),
      },
    })
  } catch (err: any) {
    console.error('Erreur lors du recalcul des statistiques adverses:', err)
    return Response.json(
      { error: err?.message || 'Erreur lors du recalcul des statistiques' },
      { status: 500 }
    )
  }
}
