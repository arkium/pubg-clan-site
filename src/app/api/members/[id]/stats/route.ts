import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { fetchLifetimeStats, searchPlayerByName } from '@/lib/pubg'
import { NextResponse } from 'next/server'

type LifetimeStats = {
  combat: {
    kills: number
    deaths: number
    kdRatio: number
    headshots: number
    assists: number
    knockouts: number
    highestKillstreak: number
    longestKill: number
    teamkills: number
    suicides: number
  }
  victory: {
    wins: number
    losses: number
    winLossRatio: number
    longestTimeAlive: number
  }
  support: {
    teammatesRevived: number
    boostsUsed: number
    healed: number
  }
  vehicle: {
    vehiclesDestroyed: number
    roadkills: number
  }
  movement: {
    drivenDistance: number
    walkedDistance: number
    swamDistance: number
  }
  other: {
    weaponsPicked: number
    damageGiven: number
  }
}

type ClanMetricRanks = Record<string, 1 | 2 | 3 | null>

const RANKED_METRICS: Array<{
  key: string
  order: 'asc' | 'desc'
  getValue: (stats: LifetimeStats) => number
}> = [
  { key: 'combat.kills', order: 'desc', getValue: (stats) => stats.combat.kills },
  { key: 'combat.deaths', order: 'asc', getValue: (stats) => stats.combat.deaths },
  { key: 'combat.kdRatio', order: 'desc', getValue: (stats) => stats.combat.kdRatio },
  { key: 'combat.headshots', order: 'desc', getValue: (stats) => stats.combat.headshots },
  { key: 'combat.assists', order: 'desc', getValue: (stats) => stats.combat.assists },
  { key: 'combat.knockouts', order: 'desc', getValue: (stats) => stats.combat.knockouts },
  { key: 'combat.highestKillstreak', order: 'desc', getValue: (stats) => stats.combat.highestKillstreak },
  { key: 'combat.longestKill', order: 'desc', getValue: (stats) => stats.combat.longestKill },
  { key: 'combat.teamkills', order: 'desc', getValue: (stats) => stats.combat.teamkills },
  { key: 'combat.suicides', order: 'asc', getValue: (stats) => stats.combat.suicides },
  { key: 'victory.wins', order: 'desc', getValue: (stats) => stats.victory.wins },
  { key: 'victory.losses', order: 'asc', getValue: (stats) => stats.victory.losses },
  { key: 'victory.winLossRatio', order: 'desc', getValue: (stats) => stats.victory.winLossRatio },
  { key: 'victory.longestTimeAlive', order: 'desc', getValue: (stats) => stats.victory.longestTimeAlive },
  { key: 'support.teammatesRevived', order: 'desc', getValue: (stats) => stats.support.teammatesRevived },
  { key: 'support.boostsUsed', order: 'desc', getValue: (stats) => stats.support.boostsUsed },
  { key: 'support.healed', order: 'desc', getValue: (stats) => stats.support.healed },
  { key: 'vehicle.vehiclesDestroyed', order: 'desc', getValue: (stats) => stats.vehicle.vehiclesDestroyed },
  { key: 'vehicle.roadkills', order: 'desc', getValue: (stats) => stats.vehicle.roadkills },
  { key: 'movement.drivenDistance', order: 'desc', getValue: (stats) => stats.movement.drivenDistance },
  { key: 'movement.walkedDistance', order: 'desc', getValue: (stats) => stats.movement.walkedDistance },
  { key: 'movement.swamDistance', order: 'desc', getValue: (stats) => stats.movement.swamDistance },
  { key: 'other.weaponsPicked', order: 'desc', getValue: (stats) => stats.other.weaponsPicked },
  { key: 'other.damageGiven', order: 'desc', getValue: (stats) => stats.other.damageGiven },
]

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
      statsSquad: stats.byMode.squad ?? Prisma.JsonNull,
      statsDuo: stats.byMode.duo ?? Prisma.JsonNull,
      statsSolo: stats.byMode.solo ?? Prisma.JsonNull,
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
      statsSquad: stats.byMode.squad ?? Prisma.JsonNull,
      statsDuo: stats.byMode.duo ?? Prisma.JsonNull,
      statsSolo: stats.byMode.solo ?? Prisma.JsonNull,
      lastRefreshedAt: now,
    },
  })
}

function toLifetimeStats(record: {
  combat: unknown
  victory: unknown
  support: unknown
  vehicle: unknown
  movement: unknown
  other: unknown
}): LifetimeStats {
  return {
    combat: record.combat as LifetimeStats['combat'],
    victory: record.victory as LifetimeStats['victory'],
    support: record.support as LifetimeStats['support'],
    vehicle: record.vehicle as LifetimeStats['vehicle'],
    movement: record.movement as LifetimeStats['movement'],
    other: record.other as LifetimeStats['other'],
  }
}

async function buildClanMetricRanks(memberId: number): Promise<ClanMetricRanks> {
  const emptyRanks = Object.fromEntries(RANKED_METRICS.map((metric) => [metric.key, null])) as ClanMetricRanks

  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { clanId: true },
  })

  if (!member?.clanId) {
    return emptyRanks
  }

  const statsRows = await prisma.memberLifetimeStats.findMany({
    where: {
      member: {
        clanId: member.clanId,
        isActive: true,
      },
    },
    select: {
      memberId: true,
      combat: true,
      victory: true,
      support: true,
      vehicle: true,
      movement: true,
      other: true,
    },
  })

  if (statsRows.length === 0) {
    return emptyRanks
  }

  const entries = statsRows.map((row) => ({
    memberId: row.memberId,
    stats: toLifetimeStats(row),
  }))

  const ranks: ClanMetricRanks = { ...emptyRanks }

  for (const metric of RANKED_METRICS) {
    const sorted = [...entries].sort((left, right) => {
      const leftValue = metric.getValue(left.stats)
      const rightValue = metric.getValue(right.stats)
      return metric.order === 'asc' ? leftValue - rightValue : rightValue - leftValue
    })
    const rank = sorted.findIndex((entry) => entry.memberId === memberId) + 1
    ranks[metric.key] = rank >= 1 && rank <= 3 ? (rank as 1 | 2 | 3) : null
  }

  return ranks
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
      const clanRanks = await buildClanMetricRanks(memberId)

      return NextResponse.json({
        memberId,
        stats: toLifetimeStats(cached),
        statsByMode: {
          squad: cached.statsSquad as LifetimeStats | null,
          duo: cached.statsDuo as LifetimeStats | null,
          solo: cached.statsSolo as LifetimeStats | null,
        },
        clanRanks,
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
    const clanRanks = await buildClanMetricRanks(memberId)

    return NextResponse.json({
      memberId,
      playerId,
      shard,
      stats,
      statsByMode: {
        squad: stats.byMode.squad,
        duo: stats.byMode.duo,
        solo: stats.byMode.solo,
      },
      clanRanks,
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
    const clanRanks = await buildClanMetricRanks(memberId)

    return NextResponse.json({
      memberId,
      playerId,
      shard,
      stats,
      statsByMode: {
        squad: stats.byMode.squad,
        duo: stats.byMode.duo,
        solo: stats.byMode.solo,
      },
      clanRanks,
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
