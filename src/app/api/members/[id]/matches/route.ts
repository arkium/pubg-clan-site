import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const PUBG_API_KEY = process.env.PUBG_API_KEY
const PUBG_BASE_URL = 'https://api.pubg.com'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseInt(id)

    // Récupère le membre
    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
    })

    if (!member || !member.pubgPlayerName) {
      return NextResponse.json(
        { error: 'Member not found or no PUBG account linked' },
        { status: 404 }
      )
    }

    const shard = member.platformShard
    
    // Récupère le joueur
    const playerRes = await fetch(
      `${PUBG_BASE_URL}/shards/${shard}/players?filter[playerNames]=${member.pubgPlayerName}`,
      {
        headers: { Authorization: `Bearer ${PUBG_API_KEY}`, Accept: 'application/vnd.api+json' },
      }
    )

    if (!playerRes.ok) {
      throw new Error('Failed to fetch player from PUBG API')
    }

    const playerData = await playerRes.json()
    const player = playerData.data[0]

    if (!player) {
      return NextResponse.json(
        { error: 'Player not found in PUBG API' },
        { status: 404 }
      )
    }

    // Sauvegarde l'ID du joueur PUBG
    await prisma.clanMember.update({
      where: { id: memberId },
      data: { pubgAccountId: player.id },
    })

    // Récupère les stats et matchIds depuis /seasons/lifetime
    const seasonRes = await fetch(
      `${PUBG_BASE_URL}/shards/${shard}/players/${player.id}/seasons/lifetime`,
      {
        headers: { Authorization: `Bearer ${PUBG_API_KEY}`, Accept: 'application/vnd.api+json' },
      }
    )

    if (!seasonRes.ok) {
      throw new Error('Failed to fetch player seasons from PUBG API')
    }

    const seasonData = await seasonRes.json()
    
    // Récupère tous les matchIds
    const allMatchIds: string[] = []
    const matchesData = seasonData.data.relationships
    
    Object.values(matchesData).forEach((modeMatches: any) => {
      if (modeMatches.data && Array.isArray(modeMatches.data)) {
        modeMatches.data.forEach((match: any) => {
          if (match.id && !allMatchIds.includes(match.id)) {
            allMatchIds.push(match.id)
          }
        })
      }
    })

    if (allMatchIds.length === 0) {
      return NextResponse.json([])
    }

    // Retourne seulement les 10 derniers matchIds (sans attendre les détails)
    const matchIdsToFetch = allMatchIds.slice(0, 10)
    
    return NextResponse.json({
      memberId,
      playerId: player.id,
      shard,
      matchIds: matchIdsToFetch,
      totalMatches: allMatchIds.length,
    })
  } catch (error) {
    console.error('Error fetching matches:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}