import { prisma } from '@/lib/prisma'
import {
  fetchCurrentSeason,
  fetchPlayerRankedStats,
  fetchPlayerSeasonStats,
  searchPlayerByName,
} from '@/lib/pubg'
import { NextResponse } from 'next/server'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

async function resolvePlayerId(memberId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { id: true, pubgPlayerName: true, pubgAccountId: true, platformShard: true },
  })

  if (!member) {
    return null
  }

  const shard = member.platformShard
  let playerId = member.pubgAccountId

  if (!playerId) {
    const player = await searchPlayerByName(member.pubgPlayerName, shard, { memberId })
    if (!player?.accountId) {
      return null
    }
    playerId = player.accountId
    await prisma.clanMember.update({ where: { id: memberId }, data: { pubgAccountId: playerId } })
  }

  return { shard, playerId }
}

async function fetchAndUpsertSeasonStats(memberId: number, shard: string, playerId: string) {
  const currentSeason = await fetchCurrentSeason(shard)
  if (!currentSeason) {
    return null
  }

  const [ranked, normal] = await Promise.all([
    fetchPlayerRankedStats(playerId, shard, currentSeason.seasonId, { memberId }),
    fetchPlayerSeasonStats(playerId, shard, currentSeason.seasonId, { memberId }),
  ])

  const now = new Date()

  const upserted = await prisma.memberSeasonStats.upsert({
    where: { memberId_seasonId: { memberId, seasonId: currentSeason.seasonId } },
    update: {
      rankedGameMode: ranked?.gameMode ?? null,
      rankedTier: ranked?.tier ?? null,
      rankedSubTier: ranked?.subTier ?? null,
      rankedPoints: ranked?.currentRankPoints ?? 0,
      rankedBestTier: ranked?.bestTier ?? null,
      rankedBestSubTier: ranked?.bestSubTier ?? null,
      rankedBestPoints: ranked?.bestRankPoints ?? 0,
      rankedKills: ranked?.kills ?? 0,
      rankedDamage: ranked?.damageDealt ?? 0,
      rankedWins: ranked?.wins ?? 0,
      rankedMatches: ranked?.roundsPlayed ?? 0,
      rankedAssists: ranked?.assists ?? 0,
      rankedRevives: ranked?.revives ?? 0,
      normalKills: normal.kills,
      normalDamage: normal.damageDealt,
      normalWins: normal.wins,
      normalLosses: normal.losses,
      normalAssists: normal.assists,
      normalRevives: normal.revives,
      normalMatches: normal.wins + normal.losses,
      lastRefreshedAt: now,
    },
    create: {
      memberId,
      seasonId: currentSeason.seasonId,
      rankedGameMode: ranked?.gameMode ?? null,
      rankedTier: ranked?.tier ?? null,
      rankedSubTier: ranked?.subTier ?? null,
      rankedPoints: ranked?.currentRankPoints ?? 0,
      rankedBestTier: ranked?.bestTier ?? null,
      rankedBestSubTier: ranked?.bestSubTier ?? null,
      rankedBestPoints: ranked?.bestRankPoints ?? 0,
      rankedKills: ranked?.kills ?? 0,
      rankedDamage: ranked?.damageDealt ?? 0,
      rankedWins: ranked?.wins ?? 0,
      rankedMatches: ranked?.roundsPlayed ?? 0,
      rankedAssists: ranked?.assists ?? 0,
      rankedRevives: ranked?.revives ?? 0,
      normalKills: normal.kills,
      normalDamage: normal.damageDealt,
      normalWins: normal.wins,
      normalLosses: normal.losses,
      normalAssists: normal.assists,
      normalRevives: normal.revives,
      normalMatches: normal.wins + normal.losses,
      lastRefreshedAt: now,
    },
  })

  return { seasonId: currentSeason.seasonId, isOffseason: currentSeason.isOffseason, stats: upserted }
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

    const authError = await requireSameClanAsMember(memberId, request)
    if (authError) return authError

    const cached = await prisma.memberSeasonStats.findMany({
      where: { memberId },
      orderBy: { seasonId: 'desc' },
      take: 3,
    })

    return NextResponse.json({ memberId, seasons: cached })
  } catch (error) {
    console.error('[season-stats] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return NextResponse.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request)
    if (authError) return authError

    const resolved = await resolvePlayerId(memberId)
    if (!resolved) {
      return NextResponse.json({ error: 'Member not found or no PUBG account linked' }, { status: 404 })
    }

    const result = await fetchAndUpsertSeasonStats(memberId, resolved.shard, resolved.playerId)
    if (!result) {
      return NextResponse.json({ error: 'Current season not found' }, { status: 404 })
    }

    return NextResponse.json({ memberId, ...result })
  } catch (error) {
    console.error('[season-stats] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
