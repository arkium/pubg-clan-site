import { prisma } from '@/lib/prisma'
import { fetchLifetimeStats, searchPlayerByName } from '@/lib/pubg'
import { NextResponse } from 'next/server'

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
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

    const stats = await fetchLifetimeStats(playerId, shard)

    return NextResponse.json({
      memberId,
      playerId,
      shard,
      stats,
    })
  } catch (error) {
    console.error('Error fetching lifetime stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
