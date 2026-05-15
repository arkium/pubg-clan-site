import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const PUBG_API_KEY = process.env.PUBG_API_KEY
const PUBG_BASE_URL = 'https://api.pubg.com'

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
    const match = matchData.data
    
    // Récupère les rosters du match
    const rosters = match.relationships.rosters.data
    
    // Trouve le roster du joueur
    let playerParticipant: any = null
    
    for (const rosterRef of rosters) {
      const roster = matchData.included.find((item: any) => item.id === rosterRef.id)
      if (!roster) continue
      
      // Cherche le participant dans ce roster
      const participantRef = roster.relationships.participants.data.find((p: any) => 
        matchData.included.some((item: any) => 
          item.id === p.id && item.attributes.stats.playerId === playerId
        )
      )
      
      if (participantRef) {
        playerParticipant = matchData.included.find((item: any) => item.id === participantRef.id)
        break
      }
    }

    if (!playerParticipant) {
      return NextResponse.json(
        { error: 'Player not found in match' },
        { status: 404 }
      )
    }

    const stats = playerParticipant.attributes.stats

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