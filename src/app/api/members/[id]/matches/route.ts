import { prisma } from '@/lib/prisma'
import { fetchRecentMatchIds, searchPlayerByName } from '@/lib/pubg'
import { NextResponse } from 'next/server'

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

function getPeriodDateFilter(period: string | null): Date | null {
  if (period === 'week') {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d
  }
  if (period === 'month') {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d
  }
  return null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return NextResponse.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')

    // Dashboard mode: when period, limit or offset params are provided,
    // return stored matches in a simplified format
    if (period !== null || limitParam !== null || offsetParam !== null) {
      const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 10, 1), 100) : 10
      const offset = offsetParam ? Math.max(Number(offsetParam) || 0, 0) : 0
      const since = getPeriodDateFilter(period)

      const where = {
        memberId,
        ...(since ? { pubgCreatedAt: { gte: since } } : {}),
      }

      const [matches, totalCount] = await Promise.all([
        prisma.match.findMany({
          where,
          orderBy: { pubgCreatedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.match.count({ where }),
      ])

      return NextResponse.json({
        matches: matches.map((m) => ({
          id: m.id,
          pubgMatchId: m.pubgMatchId,
          mapName: m.mapName,
          gameMode: m.gameMode,
          placement: m.placement,
          kills: m.kills,
          damageDealt: m.damageDealt,
          assists: m.assists,
          revives: m.revives,
          pubgCreatedAt: m.pubgCreatedAt.toISOString(),
          squad: [],
        })),
        totalCount,
      })
    }

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
    })

    if (!member || !member.pubgPlayerName) {
      return NextResponse.json(
        { error: 'Member not found or no PUBG account linked' },
        { status: 404 }
      )
    }

    const importedMatches = await prisma.match.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
    })

    const shard = member.platformShard
    let playerId = member.pubgAccountId

    if (!playerId) {
      const player = await searchPlayerByName(member.pubgPlayerName, shard)

      if (!player) {
        return NextResponse.json(
          { error: 'Player not found in PUBG API' },
          { status: 404 }
        )
      }

      playerId = player.accountId

      await prisma.clanMember.update({
        where: { id: memberId },
        data: { pubgAccountId: playerId },
      })
    }

    const allRecentMatchIds = await fetchRecentMatchIds(playerId, shard)
    const importedMatchIds = new Set(importedMatches.map((match) => match.pubgMatchId))
    const recentWindow = allRecentMatchIds.slice(0, 10)
    const recentApiMatchIds = recentWindow.filter((matchId) => !importedMatchIds.has(matchId))

    return NextResponse.json({
      memberId,
      playerId,
      shard,
      importedMatches,
      recentApiMatchIds,
      recentMatchesConsidered: recentWindow.length,
      totalMatches: allRecentMatchIds.length,
    })
  } catch (error) {
    console.error('Error fetching matches:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
