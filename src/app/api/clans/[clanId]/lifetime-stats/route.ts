import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

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

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function toLifetimeStats(row: {
  combat: unknown
  victory: unknown
  support: unknown
  vehicle: unknown
  movement: unknown
  other: unknown
}): LifetimeStats {
  return {
    combat: row.combat as LifetimeStats['combat'],
    victory: row.victory as LifetimeStats['victory'],
    support: row.support as LifetimeStats['support'],
    vehicle: row.vehicle as LifetimeStats['vehicle'],
    movement: row.movement as LifetimeStats['movement'],
    other: row.other as LifetimeStats['other'],
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true, name: true, tag: true },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const rows = await prisma.memberLifetimeStats.findMany({
      where: {
        member: {
          clanId: parsedClanId,
          isActive: true,
        },
      },
      select: {
        lastRefreshedAt: true,
        combat: true,
        victory: true,
        support: true,
        vehicle: true,
        movement: true,
        other: true,
        member: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    })

    const members = rows.map((row) => ({
      memberId: row.member.id,
      displayName: row.member.displayName,
      lastRefreshedAt: row.lastRefreshedAt.toISOString(),
      stats: toLifetimeStats(row),
    }))

    return NextResponse.json({
      clan,
      members,
    })
  } catch (error) {
    console.error('Error fetching clan lifetime stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
