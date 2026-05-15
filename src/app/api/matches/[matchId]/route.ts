import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const PUBG_API_KEY = process.env.PUBG_API_KEY
const PUBG_BASE_URL = 'https://api.pubg.com'

type ParticipantStats = {
  playerId?: string
  kills: number
  assists: number
  damageDealt: number
  headshotKills: number
  revives: number
  winPlace: number
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params
    
    const { searchParams } = new URL(request.url)
    const shard = searchParams.get('shard')
    const playerId = searchParams.get('playerId')
    const memberId = searchParams.get('memberId')

    if (!shard || !playerId) {
      return NextResponse.json(
        { error: 'shard and playerId are required' },
        { status: 400 }
      )
    }

    const matchRes = await fetch(
      `${PUBG_BASE_URL}/shards/${shard}/matches/${matchId}`,
      {
        headers: { Authorization: `Bearer ${PUBG_API_KEY}`, Accept: 'application/vnd.api+json' },
      }
    )

    if (!matchRes.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch match from PUBG API' },
        { status: 404 }
      )
    }

    const matchData = await matchRes.json()
    const match = matchData?.data
    const included = Array.isArray(matchData?.included) ? matchData.included : []
    const rosters = match?.relationships?.rosters?.data

    if (!match || !Array.isArray(rosters)) {
      console.error('Invalid PUBG match response: missing match or roster relationships', {
        matchId,
        shard,
        hasMatch: Boolean(match),
        hasRosters: Array.isArray(rosters),
      })
      return NextResponse.json(
        { error: 'Invalid match data from PUBG API' },
        { status: 502 }
      )
    }

    console.debug('Resolving player participant from PUBG match payload', {
      matchId,
      playerId,
      shard,
      rosterCount: rosters.length,
      includedCount: included.length,
    })

    let playerParticipant: {
      attributes?: { stats?: ParticipantStats }
    } | null = null

    for (const rosterRef of rosters) {
      if (!rosterRef?.id) {
        console.debug('Skipping roster reference without id', { matchId, rosterRef })
        continue
      }

      const roster = included.find(
        (item: { id?: string; type?: string }) => item.id === rosterRef.id && item.type === 'roster'
      ) as { relationships?: { participants?: { data?: Array<{ id?: string }> } } } | undefined

      if (!roster) {
        console.debug('Roster reference not found in included payload', {
          matchId,
          rosterId: rosterRef.id,
        })
        continue
      }

      const rosterParticipants = roster?.relationships?.participants?.data
      if (!Array.isArray(rosterParticipants)) {
        console.debug('Roster missing participant relationships', {
          matchId,
          rosterId: rosterRef.id,
        })
        continue
      }

      for (const participantRef of rosterParticipants) {
        if (!participantRef?.id) continue

        const participant = included.find(
          (item: { id?: string; type?: string; attributes?: { stats?: { playerId?: string } } }) =>
            item.id === participantRef.id &&
            item.type === 'participant' &&
            item.attributes?.stats?.playerId === playerId
        )

        if (participant) {
          playerParticipant = participant
          break
        }
      }

      if (playerParticipant) {
        break
      }
    }

    if (!playerParticipant) {
      console.warn('Player not found in match rosters', { matchId, playerId, shard })
      return NextResponse.json(
        { error: 'Player not found in match' },
        { status: 404 }
      )
    }

    const stats = playerParticipant.attributes?.stats
    if (
      !stats ||
      typeof stats.kills !== 'number' ||
      typeof stats.assists !== 'number' ||
      typeof stats.damageDealt !== 'number' ||
      typeof stats.headshotKills !== 'number' ||
      typeof stats.revives !== 'number' ||
      typeof stats.winPlace !== 'number'
    ) {
      console.error('Player participant found without stats payload', { matchId, playerId, shard })
      return NextResponse.json(
        { error: 'Invalid participant data from PUBG API' },
        { status: 502 }
      )
    }

    // Sauvegarde en base si memberId fourni
    if (memberId) {
      await prisma.match.upsert({
        where: {
          memberId_pubgMatchId: {
            memberId: parseInt(memberId),
            pubgMatchId: match.id,
          },
        },
        update: {
          kills: stats.kills,
          assists: stats.assists,
          damageDealt: stats.damageDealt,
          headshotKills: stats.headshotKills,
          revives: stats.revives,
          playedAt: new Date(match.attributes.createdAt),
          mode: match.attributes.gameMode,
        },
        create: {
          memberId: parseInt(memberId),
          pubgMatchId: match.id,
          kills: stats.kills,
          assists: stats.assists,
          damageDealt: stats.damageDealt,
          headshotKills: stats.headshotKills,
          revives: stats.revives,
          playedAt: new Date(match.attributes.createdAt),
          mode: match.attributes.gameMode,
        },
      })
    }

    return NextResponse.json({
      id: match.id,
      mode: match.attributes.gameMode,
      createdAt: match.attributes.createdAt,
      durationSeconds: match.attributes.durationSeconds,
      stats: {
        kills: stats.kills,
        assists: stats.assists,
        damageDealt: stats.damageDealt,
        headshotKills: stats.headshotKills,
        revives: stats.revives,
        position: stats.winPlace,
      },
    })
  } catch (error) {
    console.error('Error fetching match:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
