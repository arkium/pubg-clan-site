import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireNavPermission } from '@/middleware/auth-permission'
import { getMapLabels } from '@/lib/map-label-service'
import { prisma } from '@/lib/prisma'
import type {
  ClanModePerformanceEntry,
  ClanMatchesResponse,
  PerformerEntry,
  SessionRecapItem,
  SquadMatch,
  SquadPeriod,
  SquadSynergyEntry,
  SquadMatchTelemetryMemberStat,
  SquadMatchTelemetrySummary,
  SquadMatchTelemetryWeaponStat,
} from '@/types/squad-matches'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(period: string | null): SquadPeriod {
  if (period === 'month' || period === 'month-1' || period === 'month-2') {
    return period
  }

  return 'week'
}

function getDateRangeForPeriod(period: SquadPeriod): { gte: Date; lte: Date } {
  const now = new Date()

  if (period === 'week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    return { gte: monday, lte: sunday }
  }

  const monthOffset = period === 'month' ? 0 : period === 'month-1' ? -1 : -2
  const startDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 0, 0, 0, 0)
  const endDate = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999)

  return { gte: startDate, lte: endDate }
}

function teamModeFromMemberCount(memberCount: number) {
  if (memberCount <= 2) {
    return 'duo'
  }

  if (memberCount === 3) {
    return 'trio'
  }

  return 'squad'
}

function buildSynergyKey(memberIds: number[]) {
  return memberIds.join(':')
}

function buildWinRate(wins: number, matchesPlayed: number) {
  return matchesPlayed > 0 ? wins / matchesPlayed : 0
}

function asTelemetrySummary(value: unknown): SquadMatchTelemetrySummary | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const summary = value as Record<string, unknown>
  const requiredKeys = [
    'totalEvents',
    'killEvents',
    'reviveEvents',
    'damageEvents',
    'knockoutEvents',
    'itemUseEvents',
    'vehicleEvents',
    'positionEvents',
    'phaseChangeEvents',
    'blueZoneEvents',
    'distinctEventTypes',
  ] as const

  if (requiredKeys.some((key) => typeof summary[key] !== 'number')) {
    return null
  }

  return summary as unknown as SquadMatchTelemetrySummary
}

function asTelemetryWeaponStats(value: unknown): SquadMatchTelemetryWeaponStat[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is SquadMatchTelemetryWeaponStat => {
      if (!entry || typeof entry !== 'object') {
        return false
      }

      const item = entry as Record<string, unknown>
      return (
        typeof item.weaponName === 'string' &&
        typeof item.kills === 'number' &&
        typeof item.headshots === 'number' &&
        typeof item.damageDealt === 'number'
      )
    })
    .sort((left, right) => {
      if (right.kills !== left.kills) {
        return right.kills - left.kills
      }

      return right.damageDealt - left.damageDealt
    })
    .slice(0, 3)
}

function asTelemetryMemberStats(value: unknown): SquadMatchTelemetryMemberStat[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is SquadMatchTelemetryMemberStat => {
      if (!entry || typeof entry !== 'object') {
        return false
      }

      const item = entry as Record<string, unknown>
      return (
        typeof item.memberKey === 'string' &&
        typeof item.kills === 'number' &&
        typeof item.headshots === 'number' &&
        typeof item.damageDealt === 'number' &&
        typeof item.revives === 'number' &&
        typeof item.knockouts === 'number' &&
        typeof item.deaths === 'number' &&
        typeof item.blueZoneHits === 'number' &&
        typeof item.vehicleRideEvents === 'number' &&
        typeof item.vehicleLeaveEvents === 'number' &&
        typeof item.positionEvents === 'number'
      )
    })
    .sort((left, right) => {
      if (right.kills !== left.kills) {
        return right.kills - left.kills
      }

      if (right.damageDealt !== left.damageDealt) {
        return right.damageDealt - left.damageDealt
      }

      return right.revives - left.revives
    })
    .slice(0, 4)
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
      totalDurationSeconds: number
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
      totalDurationSeconds: entry.totalDurationSeconds,
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

    const roleError = await requireNavPermission('clan.matches')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const period = parsePeriod(request.nextUrl.searchParams.get('period'))
    const requestedGameMode = request.nextUrl.searchParams.get('gameMode')?.trim() ?? ''
    const gameModeFilter =
      requestedGameMode === 'duo' || requestedGameMode === 'trio' || requestedGameMode === 'squad'
        ? requestedGameMode
        : undefined
    const periodRange = getDateRangeForPeriod(period)
    const baseWhere = {
      createdAt: {
        gte: periodRange.gte,
        lte: periodRange.lte,
      },
      members: {
        some: {
          member: {
            clanId: parsedClanId,
            isActive: true,
          },
        },
      },
    }

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
      where: baseWhere,
      include: {
        telemetry: {
          select: {
            status: true,
            parserVersion: true,
            parsedAt: true,
            bytesDownloaded: true,
            errorCode: true,
            errorMessage: true,
          },
        },
        // Un SquadMatch peut être partagé entre plusieurs clans (voir
        // analyzeMatchForSquads dans squad-detector.ts) : sans ce filtre, un
        // match croisé renverrait aussi les SquadMember de l'autre clan.
        members: {
          where: { member: { clanId: parsedClanId, isActive: true } },
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

    const telemetryRows = squadMatches.length
      ? await prisma.$queryRaw<Array<{
          squadMatchId: string
          summary: unknown
          weaponStats: unknown
          memberStats: unknown
        }>>(Prisma.sql`
          SELECT squadMatchId, summary, weaponStats, memberStats
          FROM SquadMatchTelemetry
          WHERE squadMatchId IN (${Prisma.join(squadMatches.map((match) => match.id))})
        `)
      : []

    const telemetryExtraByMatchId = new Map(
      telemetryRows.map((row) => [row.squadMatchId, row])
    )

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
      matchType: match.matchType,
      placement: match.placement,
      createdAt: match.createdAt.toISOString(),
      durationSeconds: durationByMatchId.get(match.pubgMatchId) ?? 0,
      // Recalculé depuis les SquadMember (déjà filtrés par clan ci-dessus)
      // plutôt que depuis SquadMatch.totalKills/totalDamage/totalAssists/
      // totalRevives — ces colonnes ne reflètent que le clan ayant créé la
      // ligne en premier sur un match potentiellement partagé entre plusieurs
      // clans (voir analyzeMatchForSquads dans squad-detector.ts).
      totalKills: match.members.reduce((sum, member) => sum + member.kills, 0),
      totalDamage: match.members.reduce((sum, member) => sum + member.damage, 0),
      totalAssists: match.members.reduce((sum, member) => sum + member.assists, 0),
      totalRevives: match.members.reduce((sum, member) => sum + member.revives, 0),
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
      telemetry: match.telemetry
        ? {
            status:
              match.telemetry.status === 'success' || match.telemetry.status === 'failed'
                ? match.telemetry.status
                : 'pending',
            parserVersion: match.telemetry.parserVersion,
            parsedAt: match.telemetry.parsedAt.toISOString(),
            bytesDownloaded: match.telemetry.bytesDownloaded,
            summary: asTelemetrySummary(telemetryExtraByMatchId.get(match.id)?.summary),
            topWeapons: asTelemetryWeaponStats(telemetryExtraByMatchId.get(match.id)?.weaponStats),
            memberStats: asTelemetryMemberStats(telemetryExtraByMatchId.get(match.id)?.memberStats),
            errorCode: match.telemetry.errorCode,
            errorMessage: match.telemetry.errorMessage,
          }
        : {
            status: 'pending',
            parserVersion: null,
            parsedAt: null,
            bytesDownloaded: null,
            summary: null,
            topWeapons: [],
            memberStats: [],
            errorCode: null,
            errorMessage: null,
          },
    }))

    const filteredSquads = gameModeFilter
      ? squads.filter((match) => teamModeFromMemberCount(match.members.length) === gameModeFilter)
      : squads

    const stats = filteredSquads.reduce(
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
        totalDurationSeconds: number
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
        totalDurationSeconds: number
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

    const modePerformance: Record<'duo' | 'trio' | 'squad', ClanModePerformanceEntry> = {
      duo: {
        mode: 'duo',
        matches: 0,
        kills: 0,
        wins: 0,
        losses: 0,
        damage: 0,
        assists: 0,
        durationSeconds: 0,
      },
      trio: {
        mode: 'trio',
        matches: 0,
        kills: 0,
        wins: 0,
        losses: 0,
        damage: 0,
        assists: 0,
        durationSeconds: 0,
      },
      squad: {
        mode: 'squad',
        matches: 0,
        kills: 0,
        wins: 0,
        losses: 0,
        damage: 0,
        assists: 0,
        durationSeconds: 0,
      },
    }

    for (const match of filteredSquads) {
      const mode = modePerformance[teamModeFromMemberCount(match.members.length)]
      mode.matches += 1
      mode.kills += match.totalKills
      mode.damage += match.totalDamage
      mode.assists += match.totalAssists
      mode.durationSeconds += match.durationSeconds

      if (match.isWin) {
        mode.wins += 1
      } else {
        mode.losses += 1
      }

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
              totalDurationSeconds: 0,
            }

            pair.matchesPlayed += 1
            pair.wins += match.isWin ? 1 : 0
            pair.totalKills += pairMembers[0].kills + pairMembers[1].kills
            pair.totalDamage += pairMembers[0].damage + pairMembers[1].damage
            pair.totalDurationSeconds += match.durationSeconds

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
          totalDurationSeconds: 0,
        }

        squad.matchesPlayed += 1
        squad.wins += match.isWin ? 1 : 0
        squad.totalKills += match.totalKills
        squad.totalDamage += match.totalDamage
        squad.totalDurationSeconds += match.durationSeconds

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
      availableModes: Array.from(
        new Set(squads.map((match) => teamModeFromMemberCount(match.members.length)))
      ).sort(),
      mapLabels: await getMapLabels(),
      squads: filteredSquads,
      stats: {
        totalKills: stats.totalKills,
        totalDamage: stats.totalDamage,
        winRate: buildWinRate(stats.wins, stats.matchCount),
        matchCount: stats.matchCount,
      },
      modePerformance: [modePerformance.duo, modePerformance.trio, modePerformance.squad],
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
