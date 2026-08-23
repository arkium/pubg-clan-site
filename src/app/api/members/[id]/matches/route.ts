import { prisma } from '@/lib/prisma'
import { getMapLabels } from '@/lib/map-label-service'
import { fetchRecentMatchIds, searchPlayerByName } from '@/lib/pubg'
import { NextResponse } from 'next/server'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

const MATCH_SORT_KEYS = ['pubgCreatedAt', 'kills', 'damageDealt', 'placement'] as const
type MatchSortKey = (typeof MATCH_SORT_KEYS)[number]
type MatchSortDirection = 'asc' | 'desc'

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

/** Parses a "YYYY-MM-DD" query param into a [start, end) day range, or null if absent/invalid. */
function getExactDateRange(value: string | null): { start: Date; end: Date } | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const start = new Date(`${value}T00:00:00.000`)
  if (Number.isNaN(start.getTime())) {
    return null
  }

  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return { start, end }
}

function parseMatchSortKey(value: string | null): MatchSortKey {
  return MATCH_SORT_KEYS.includes(value as MatchSortKey) ? (value as MatchSortKey) : 'pubgCreatedAt'
}

function parseMatchSortDirection(value: string | null): MatchSortDirection {
  return value === 'asc' ? 'asc' : 'desc'
}

function clanModeFromClanMemberCount(memberCount: number | null | undefined): 'solo' | 'duo' | 'trio' | 'squad' {
  if (!memberCount || memberCount <= 1) {
    return 'solo'
  }

  if (memberCount <= 2) {
    return 'duo'
  }

  if (memberCount === 3) {
    return 'trio'
  }

  return 'squad'
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

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')
    const sortBy = parseMatchSortKey(searchParams.get('sortBy'))
    const sortDirection = parseMatchSortDirection(searchParams.get('sortDirection'))
    const exactDateRange = getExactDateRange(searchParams.get('date'))

    // Dashboard mode: when period, limit or offset params are provided,
    // return stored matches in a simplified format
    if (period !== null || limitParam !== null || offsetParam !== null) {
      const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 10, 1), 100) : 10
      const offset = offsetParam ? Math.max(Number(offsetParam) || 0, 0) : 0
      const since = getPeriodDateFilter(period)

      const where = {
        memberId,
        ...(exactDateRange
          ? { pubgCreatedAt: { gte: exactDateRange.start, lt: exactDateRange.end } }
          : since
            ? { pubgCreatedAt: { gte: since } }
            : {}),
      }

      const orderBy = [
        { [sortBy]: sortDirection },
        { id: 'desc' as const },
      ]

      const [matches, totalCount] = await Promise.all([
        prisma.match.findMany({
          where,
          orderBy,
          take: limit,
          skip: offset,
        }),
        prisma.match.count({ where }),
      ])

      const memberForClan = await prisma.clanMember.findUnique({
        where: { id: memberId },
        select: { clanId: true },
      })

      const pubgMatchIds = matches.map((match) => match.pubgMatchId)
      const squadMembers = pubgMatchIds.length
        ? await prisma.squadMember.findMany({
            where: {
              memberId,
              squadMatch: {
                pubgMatchId: { in: pubgMatchIds },
              },
            },
            select: {
              squadMatch: {
                select: {
                  id: true,
                  pubgMatchId: true,
                  _count: {
                    select: {
                      members: true,
                    },
                  },
                  telemetry: {
                    select: { status: true },
                  },
                },
              },
            },
          })
        : []

      const clanMemberCountByMatchId = new Map<string, number>()
      const squadMatchIdByPubgMatchId = new Map<string, string>()
      const telemetryAvailableByPubgMatchId = new Map<string, boolean>()
      for (const squadMember of squadMembers) {
        clanMemberCountByMatchId.set(
          squadMember.squadMatch.pubgMatchId,
          squadMember.squadMatch._count.members
        )
        squadMatchIdByPubgMatchId.set(squadMember.squadMatch.pubgMatchId, squadMember.squadMatch.id)
        telemetryAvailableByPubgMatchId.set(
          squadMember.squadMatch.pubgMatchId,
          squadMember.squadMatch.telemetry?.status === 'success'
        )
      }

      return NextResponse.json({
        sortBy,
        sortDirection,
        matches: matches.map((m) => ({
          id: m.id,
          pubgMatchId: m.pubgMatchId,
          clanMode: clanModeFromClanMemberCount(clanMemberCountByMatchId.get(m.pubgMatchId)),
          mapName: m.mapName,
          gameMode: m.gameMode,
          matchType: m.matchType,
          duration: m.duration,
          placement: m.placement,
          kills: m.kills,
          damageDealt: m.damageDealt,
          assists: m.assists,
          revives: m.revives,
          pubgCreatedAt: m.pubgCreatedAt.toISOString(),
          squad: [],
          clanId: memberForClan?.clanId ?? null,
          squadMatchId: squadMatchIdByPubgMatchId.get(m.pubgMatchId) ?? null,
          telemetryAvailable: telemetryAvailableByPubgMatchId.get(m.pubgMatchId) ?? false,
        })),
        totalCount,
        mapLabels: await getMapLabels(),
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
      select: { pubgMatchId: true },
    })

    const shard = member.platformShard
    let playerId = member.pubgAccountId

    if (!playerId) {
      const player = await searchPlayerByName(member.pubgPlayerName, shard, { memberId })

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

    const allRecentMatchIds = await fetchRecentMatchIds(playerId, shard, { memberId })
    const importedMatchIds = new Set(importedMatches.map((match) => match.pubgMatchId))
    const recentWindow = allRecentMatchIds.slice(0, 10)
    const recentApiMatchIds = recentWindow.filter((matchId) => !importedMatchIds.has(matchId))

    return NextResponse.json({
      memberId,
      playerId,
      shard,
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
