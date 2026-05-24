import { NextRequest, NextResponse } from 'next/server'

import { getMapLabels } from '@/lib/map-label-service'
import { prisma } from '@/lib/prisma'
import type {
  ClanMatchesResponse,
  PerformerEntry,
  SessionRecapItem,
  SquadMatch,
  SquadPeriod,
  SquadSynergyEntry,
} from '@/types/squad-matches'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(period: string | null): SquadPeriod {
  return period === 'month' ? 'month' : 'week'
}

function getPeriodStart(period: SquadPeriod) {
  const now = new Date()
  if (period === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
}

function buildSynergyKey(memberIds: number[]) {
  return memberIds.join(':')
}

function buildWinRate(wins: number, matchesPlayed: number) {
  return matchesPlayed > 0 ? wins / matchesPlayed : 0
}

function toSortedSynergies(
  aggregates: Map<
    string,
    {
      memberIds: number[]
      memberNames: string[]
      matchesPlayed: number
      wins: number
      totalKills: number
      totalDamage: number
    }
  >
) {
  return Array.from(aggregates.values())
    .map<SquadSynergyEntry>((entry) => ({
      memberIds: entry.memberIds,
      memberNames: entry.memberNames,
      matchesPlayed: entry.matchesPlayed,
      totalKills: entry.totalKills,
      totalDamage: entry.totalDamage,
      winRate: buildWinRate(entry.wins, entry.matchesPlayed),
    }))
    .sort((left, right) => {
      if (right.matchesPlayed !== left.matchesPlayed) {
        return right.matchesPlayed - left.matchesPlayed
      }

      if (right.winRate !== left.winRate) {
        return right.winRate - left.winRate
      }

      return right.totalKills - left.totalKills
    })
}

function sortPerformer(entries: PerformerEntry[], metric: 'kills' | 'damage' | 'survival') {
  return [...entries].sort((left, right) => {
    if (metric === 'kills') {
      if (right.totalKills !== left.totalKills) {
        return right.totalKills - left.totalKills
      }
    }

    if (metric === 'damage') {
      if (right.totalDamage !== left.totalDamage) {
        return right.totalDamage - left.totalDamage
      }
    }

    if (metric === 'survival') {
      if (left.averagePlacement !== right.averagePlacement) {
        return left.averagePlacement - right.averagePlacement
      }
    }

    if (right.matchesPlayed !== left.matchesPlayed) {
      return right.matchesPlayed - left.matchesPlayed
    }

    return left.displayName.localeCompare(right.displayName)
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const period = parsePeriod(request.nextUrl.searchParams.get('period'))
    const requestedGameMode = request.nextUrl.searchParams.get('gameMode')?.trim() ?? ''
    const gameModeFilter = requestedGameMode.length > 0 ? requestedGameMode : undefined
    const periodStart = getPeriodStart(period)

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: {
        id: true,
        name: true,
      },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const squadMatches = await prisma.squadMatch.findMany({
      where: {
        createdAt: { gte: periodStart },
        ...(gameModeFilter ? { gameMode: gameModeFilter } : {}),
        members: {
          some: {
            member: {
              clanId: parsedClanId,
              isActive: true,
            },
          },
        },
      },
      include: {
        members: {
          include: {
            member: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
          orderBy: { memberId: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const durationByMatchId = new Map<string, number>()

    if (squadMatches.length > 0) {
      const durationRows = await prisma.match.groupBy({
        by: ['pubgMatchId'],
        where: {
          pubgMatchId: { in: squadMatches.map((match) => match.pubgMatchId) },
          member: {
            clanId: parsedClanId,
            isActive: true,
          },
        },
        _avg: {
          duration: true,
        },
      })

      for (const row of durationRows) {
        durationByMatchId.set(row.pubgMatchId, Math.round(row._avg.duration ?? 0))
      }
    }

    const squads: SquadMatch[] = squadMatches.map((match) => ({
      id: match.id,
      pubgMatchId: match.pubgMatchId,
      gameMode: match.gameMode,
      mapName: match.mapName,
      placement: match.placement,
      createdAt: match.createdAt.toISOString(),
      durationSeconds: durationByMatchId.get(match.pubgMatchId) ?? 0,
      totalKills: match.totalKills,
      totalDamage: match.totalDamage,
      totalAssists: match.totalAssists,
      totalRevives: match.totalRevives,
      members: match.members.map((member) => ({
        memberId: member.member.id,
        displayName: member.member.displayName,
        kills: member.kills,
        damage: member.damage,
        assists: member.assists,
        revives: member.revives,
        placement: member.placement,
      })),
      isWin: match.placement === 1,
    }))

    const stats = squads.reduce(
      (acc, match) => {
        acc.totalKills += match.totalKills
        acc.totalDamage += match.totalDamage
        acc.matchCount += 1
        acc.wins += match.isWin ? 1 : 0
        return acc
      },
      {
        totalKills: 0,
        totalDamage: 0,
        matchCount: 0,
        wins: 0,
      }
    )

    const sessionsMap = new Map<
      string,
      {
        date: string
        matches: SquadMatch[]
        totalDuration: number
        totalKills: number
        totalDamage: number
        wins: number
        members: Map<number, string>
      }
    >()

    const pairAggregates = new Map<
      string,
      {
        memberIds: number[]
        memberNames: string[]
        matchesPlayed: number
        wins: number
        totalKills: number
        totalDamage: number
      }
    >()

    const squadAggregates = new Map<
      string,
      {
        memberIds: number[]
        memberNames: string[]
        matchesPlayed: number
        wins: number
        totalKills: number
        totalDamage: number
      }
    >()

    const performerAggregates = new Map<
      number,
      {
        memberId: number
        displayName: string
        matchesPlayed: number
        totalKills: number
        totalDamage: number
        placementTotal: number
      }
    >()

    for (const match of squads) {
      const date = match.createdAt.slice(0, 10)
      const session = sessionsMap.get(date) ?? {
        date,
        matches: [],
        totalDuration: 0,
        totalKills: 0,
        totalDamage: 0,
        wins: 0,
        members: new Map<number, string>(),
      }

      session.matches.push(match)
      session.totalDuration += match.durationSeconds
      session.totalKills += match.totalKills
      session.totalDamage += match.totalDamage
      session.wins += match.isWin ? 1 : 0

      for (const member of match.members) {
        session.members.set(member.memberId, member.displayName)

        const performer = performerAggregates.get(member.memberId) ?? {
          memberId: member.memberId,
          displayName: member.displayName,
          matchesPlayed: 0,
          totalKills: 0,
          totalDamage: 0,
          placementTotal: 0,
        }

        performer.matchesPlayed += 1
        performer.totalKills += member.kills
        performer.totalDamage += member.damage
        performer.placementTotal += match.placement

        performerAggregates.set(member.memberId, performer)
      }

      sessionsMap.set(date, session)

      if (match.members.length >= 2) {
        for (let left = 0; left < match.members.length - 1; left += 1) {
          for (let right = left + 1; right < match.members.length; right += 1) {
            const pairMembers = [match.members[left], match.members[right]].sort(
              (a, b) => a.memberId - b.memberId
            )
            const memberIds = pairMembers.map((member) => member.memberId)
            const key = buildSynergyKey(memberIds)
            const pair = pairAggregates.get(key) ?? {
              memberIds,
              memberNames: pairMembers.map((member) => member.displayName),
              matchesPlayed: 0,
              wins: 0,
              totalKills: 0,
              totalDamage: 0,
            }

            pair.matchesPlayed += 1
            pair.wins += match.isWin ? 1 : 0
            pair.totalKills += pairMembers[0].kills + pairMembers[1].kills
            pair.totalDamage += pairMembers[0].damage + pairMembers[1].damage

            pairAggregates.set(key, pair)
          }
        }
      }

      if (match.members.length >= 3 && match.members.length <= 4) {
        const squadMembers = [...match.members].sort((a, b) => a.memberId - b.memberId)
        const memberIds = squadMembers.map((member) => member.memberId)
        const key = buildSynergyKey(memberIds)
        const squad = squadAggregates.get(key) ?? {
          memberIds,
          memberNames: squadMembers.map((member) => member.displayName),
          matchesPlayed: 0,
          wins: 0,
          totalKills: 0,
          totalDamage: 0,
        }

        squad.matchesPlayed += 1
        squad.wins += match.isWin ? 1 : 0
        squad.totalKills += match.totalKills
        squad.totalDamage += match.totalDamage

        squadAggregates.set(key, squad)
      }
    }

    const sessions = Array.from(sessionsMap.values())
      .map<SessionRecapItem>((session) => ({
        date: session.date,
        matches: session.matches.sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt)
        ),
        totalDuration: session.totalDuration,
        totalKills: session.totalKills,
        totalDamage: session.totalDamage,
        winRate: buildWinRate(session.wins, session.matches.length),
        members: Array.from(session.members.entries()).map(([memberId, displayName]) => ({
          memberId,
          displayName,
        })),
      }))
      .sort((left, right) => right.date.localeCompare(left.date))

    const performerEntries = Array.from(performerAggregates.values()).map<PerformerEntry>((entry) => ({
      memberId: entry.memberId,
      displayName: entry.displayName,
      matchesPlayed: entry.matchesPlayed,
      totalKills: entry.totalKills,
      totalDamage: entry.totalDamage,
      averagePlacement: entry.matchesPlayed > 0 ? entry.placementTotal / entry.matchesPlayed : 0,
    }))

    const payload: ClanMatchesResponse = {
      clanId: clan.id,
      clanName: clan.name,
      period,
      ...(gameModeFilter ? { gameMode: gameModeFilter } : {}),
      availableModes: Array.from(new Set(squads.map((match) => match.gameMode))).sort(),
      mapLabels: await getMapLabels(),
      squads,
      stats: {
        totalKills: stats.totalKills,
        totalDamage: stats.totalDamage,
        winRate: buildWinRate(stats.wins, stats.matchCount),
        matchCount: stats.matchCount,
      },
      sessions,
      synergies: {
        topPairs: toSortedSynergies(pairAggregates).slice(0, 5),
        topSquads: toSortedSynergies(squadAggregates).slice(0, 5),
      },
      topPerformers: {
        kills: sortPerformer(performerEntries, 'kills').slice(0, 5),
        damage: sortPerformer(performerEntries, 'damage').slice(0, 5),
        survival: sortPerformer(performerEntries, 'survival').slice(0, 5),
      },
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching clan matches:', error)
    return NextResponse.json({ error: 'Failed to fetch clan matches' }, { status: 500 })
  }
}
