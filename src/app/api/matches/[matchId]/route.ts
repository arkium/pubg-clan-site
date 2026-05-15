import { prisma } from '@/lib/prisma'
import { fetchMatchDetails } from '@/lib/pubg'
import { NextRequest, NextResponse } from 'next/server'

function parseMemberId(memberId: unknown) {
  const parsed = Number(memberId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function createMatchRecordId(memberId: number, matchId: string) {
  return `${memberId}-${matchId}`
}

function toImportedMatchData(memberId: number, match: Awaited<ReturnType<typeof fetchMatchDetails>>) {
  return {
    id: createMatchRecordId(memberId, match.id),
    memberId,
    pubgMatchId: match.id,
    gameMode: match.gameMode,
    mapName: match.mapName,
    kills: match.stats.kills,
    knockouts: match.stats.knockouts,
    assists: match.stats.assists,
    damageDealt: match.stats.damageDealt,
    headshotKills: match.stats.headshotKills,
    revives: match.stats.revives,
    placement: match.stats.position,
    playersAlive: 0,
    duration: match.durationSeconds,
    pubgCreatedAt: new Date(match.createdAt),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params
    const shard = request.nextUrl.searchParams.get('shard')
    const playerId = request.nextUrl.searchParams.get('playerId')

    if (!shard || !playerId) {
      return NextResponse.json(
        { error: 'shard and playerId are required' },
        { status: 400 }
      )
    }

    const match = await fetchMatchDetails(matchId, playerId, shard)

    return NextResponse.json({
      id: match.id,
      mode: match.gameMode,
      mapName: match.mapName,
      createdAt: match.createdAt,
      durationSeconds: match.durationSeconds,
      stats: {
        kills: match.stats.kills,
        assists: match.stats.assists,
        damageDealt: match.stats.damageDealt,
        headshotKills: match.stats.headshotKills,
        revives: match.stats.revives,
        position: match.stats.position,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Player not found in match' ? 404 : 500

    console.error('Error fetching match:', error)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params
    const body = await request.json()
    const memberId = parseMemberId(body?.memberId)
    const shard = typeof body?.shard === 'string' ? body.shard : null
    const playerId = typeof body?.playerId === 'string' ? body.playerId : null

    if (!memberId || !shard || !playerId) {
      return NextResponse.json(
        { error: 'memberId, shard and playerId are required' },
        { status: 400 }
      )
    }

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: { id: true },
    })

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const match = await fetchMatchDetails(matchId, playerId, shard)
    const importedMatchData = toImportedMatchData(memberId, match)

    const savedMatch = await prisma.match.upsert({
      where: {
        memberId_pubgMatchId: {
          memberId,
          pubgMatchId: match.id,
        },
      },
      update: {
        gameMode: importedMatchData.gameMode,
        mapName: importedMatchData.mapName,
        kills: importedMatchData.kills,
        knockouts: importedMatchData.knockouts,
        assists: importedMatchData.assists,
        damageDealt: importedMatchData.damageDealt,
        headshotKills: importedMatchData.headshotKills,
        revives: importedMatchData.revives,
        placement: importedMatchData.placement,
        playersAlive: importedMatchData.playersAlive,
        duration: importedMatchData.duration,
        pubgCreatedAt: importedMatchData.pubgCreatedAt,
      },
      create: importedMatchData,
    })

    return NextResponse.json(savedMatch, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Player not found in match' ? 404 : 500

    console.error('Error importing match:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
