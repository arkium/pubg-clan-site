import { prisma } from '@/lib/prisma'
import { fetchLifetimeStats, searchPlayerByName } from '@/lib/pubg'
import { NextResponse } from 'next/server'

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

async function resolvePlayerId(memberId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
  })

  if (!member || !member.pubgPlayerName) {
    return null
  }

  const shard = member.platformShard
  let playerId = member.pubgAccountId

  if (!playerId) {
    const player = await searchPlayerByName(member.pubgPlayerName, shard)

    if (!player) {
      return null
    }

    playerId = player.accountId

    await prisma.clanMember.update({
      where: { id: memberId },
      data: { pubgAccountId: playerId },
    })
  }

  return { shard, playerId }
}

async function upsertStats(memberId: number, stats: Awaited<ReturnType<typeof fetchLifetimeStats>>, now: Date) {
  await prisma.memberLifetimeStats.upsert({
    where: { memberId },
    update: {
      combat: stats.combat,
      victory: stats.victory,
      support: stats.support,
      vehicle: stats.vehicle,
      movement: stats.movement,
      other: stats.other,
      lastRefreshedAt: now,
    },
    create: {
      memberId,
      combat: stats.combat,
      victory: stats.victory,
      support: stats.support,
      vehicle: stats.vehicle,
      movement: stats.movement,
      other: stats.other,
      lastRefreshedAt: now,
    },
  })
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

    const cached = await prisma.memberLifetimeStats.findUnique({
      where: { memberId },
    })

    if (cached) {
      return NextResponse.json({
        memberId,
        stats: {
          combat: cached.combat,
          victory: cached.victory,
          support: cached.support,
          vehicle: cached.vehicle,
          movement: cached.movement,
          other: cached.other,
        },
        lastRefreshedAt: cached.lastRefreshedAt,
      })
    }

    const resolved = await resolvePlayerId(memberId)

    if (!resolved) {
      return NextResponse.json(
        { error: 'Member not found or no PUBG account linked' },
        { status: 404 }
      )
    }

    const { shard, playerId } = resolved
    const stats = await fetchLifetimeStats(playerId, shard)
    const now = new Date()

    await upsertStats(memberId, stats, now)

    return NextResponse.json({
      memberId,
      playerId,
      shard,
      stats,
      lastRefreshedAt: now,
    })
  } catch (error) {
    console.error('Error fetching lifetime stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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

    const resolved = await resolvePlayerId(memberId)

    if (!resolved) {
      return NextResponse.json(
        { error: 'Member not found or no PUBG account linked' },
        { status: 404 }
      )
    }

    const { shard, playerId } = resolved
    const stats = await fetchLifetimeStats(playerId, shard)
    const now = new Date()

    await upsertStats(memberId, stats, now)

    return NextResponse.json({
      memberId,
      playerId,
      shard,
      stats,
      lastRefreshedAt: now,
    })
  } catch (error) {
    console.error('Error refreshing lifetime stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
