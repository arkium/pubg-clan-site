import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

type StatsPeriod = 'week' | 'month' | 'all'

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

function parseStatsPeriod(value: string | null): StatsPeriod {
  return value === 'week' || value === 'month' ? value : 'all'
}

function getISOWeek(date: Date) {
  const value = new Date(date.getTime())
  value.setHours(0, 0, 0, 0)
  value.setDate(value.getDate() + 3 - ((value.getDay() + 6) % 7))
  const firstWeek = new Date(value.getFullYear(), 0, 4)
  return 1 + Math.round(
    ((value.getTime() - firstWeek.getTime()) / 86400000 - 3 + ((firstWeek.getDay() + 6) % 7)) / 7
  )
}

function getStatsPeriodKey(period: StatsPeriod, now = new Date()) {
  if (period === 'all') return 'all-time'
  if (period === 'week') {
    return `week-${now.getFullYear()}-${String(getISOWeek(now)).padStart(2, '0')}`
  }

  return `month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function countCronFieldRuns(value: string, max: number) {
  if (value === '*') return max + 1

  if (value.startsWith('*/')) {
    const step = Number(value.slice(2))
    return Number.isInteger(step) && step > 0 ? Math.ceil((max + 1) / step) : null
  }

  const values = value.split(',').map(Number)
  return values.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= max)
    ? new Set(values).size
    : null
}

function getCronRunsPerDay(expression: string) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = expression.trim().split(/\s+/)
  if (!minute || !hour || dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') return null

  const minuteRuns = countCronFieldRuns(minute, 59)
  const hourRuns = countCronFieldRuns(hour, 23)
  return minuteRuns !== null && hourRuns !== null ? minuteRuns * hourRuns : null
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
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)
    const statsPeriod = parseStatsPeriod(new URL(request.url).searchParams.get('period'))
    const statsPeriodKey = getStatsPeriodKey(statsPeriod)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireNavPermission('clan.stats')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true, name: true, tag: true },
    })

    if (!clan) {
      return Response.json({ error: 'Clan not found' }, { status: 404 })
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

    const playerStats = await prisma.playerStats.findMany({
      where: {
        period: statsPeriodKey,
        member: {
          clanId: parsedClanId,
          isActive: true,
        },
      },
      select: {
        memberId: true,
        timePlayedSeconds: true,
        activeDays: true,
      },
    })

    const statsCron = await prisma.cronSchedule.findUnique({
      where: { key: 'daily_stats_recalc' },
      select: { expression: true },
    })
    const statsCronExpression =
      statsCron?.expression ?? process.env.CLAN_STATS_RECALC_CRON ?? '0 3 * * *'

    const playerStatsMap = new Map(playerStats.map((ps) => [ps.memberId, ps]))

    const members = rows.map((row) => {
      const ps = playerStatsMap.get(row.member.id)
      return {
        memberId: row.member.id,
        displayName: row.member.displayName,
        lastRefreshedAt: row.lastRefreshedAt.toISOString(),
        stats: toLifetimeStats(row),
        engagement: {
          timePlayedSeconds: ps?.timePlayedSeconds ?? 0,
          activeDays: ps?.activeDays ?? 0,
        },
      }
    })

    return Response.json({
      clan,
      members,
      period: statsPeriod,
      statsRecalculation: {
        expression: statsCronExpression,
        timezone: process.env.CLAN_MATCH_SYNC_TIMEZONE ?? 'UTC',
        runsPerDay: getCronRunsPerDay(statsCronExpression),
      },
    })
  } catch (error) {
    console.error('Error fetching clan lifetime stats:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
