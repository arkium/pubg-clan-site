import { NextResponse } from 'next/server'

import { mapDisplayName, getMapLabels } from '@/lib/map-label-service'
import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

type Scope = 'self' | 'member' | 'clan' | 'best'
type BestMode = 'duo' | 'trio' | 'squad'
type Period = 'week' | 'month' | 'all'

type SquadAggregate = {
  key: string
  memberIds: number[]
  memberNames: string[]
  matches: number
  wins: number
  placementTotal: number
  matchIds: string[]
}

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

function parseScope(value: string | null): Scope {
  if (value === 'member' || value === 'clan' || value === 'best') {
    return value
  }
  return 'self'
}

function parseBestMode(value: string | null): BestMode {
  if (value === 'trio' || value === 'squad') {
    return value
  }
  return 'duo'
}

function parsePeriod(value: string | null): Period {
  if (value === 'week' || value === 'month') {
    return value
  }
  return 'all'
}

function getPeriodBounds(period: Period, now = new Date()) {
  if (period === 'all') {
    return null
  }

  if (period === 'week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    return {
      startDate: monday,
      endDate: sunday,
    }
  }

  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

function getModeLabel(mode: BestMode) {
  if (mode === 'duo') return 'Duo'
  if (mode === 'trio') return 'Trio'
  return 'Squad'
}

function isMatchingMode(memberCount: number, mode: BestMode) {
  if (mode === 'duo') return memberCount === 2
  if (mode === 'trio') return memberCount === 3
  return memberCount >= 4
}

function aggregateTeams(
  squadMatches: Array<{
    id: string
    placement: number
    members: Array<{
      memberId: number
      member: {
        displayName: string
      }
    }>
  }>,
  mode: BestMode,
  requiredMemberId?: number
) {
  const aggregates = new Map<string, SquadAggregate>()

  for (const match of squadMatches) {
    const members = [...match.members].sort((left, right) => left.memberId - right.memberId)
    if (!isMatchingMode(members.length, mode)) {
      continue
    }

    if (requiredMemberId && !members.some((entry) => entry.memberId === requiredMemberId)) {
      continue
    }

    const key = members.map((entry) => entry.memberId).join(':')
    const existing = aggregates.get(key) ?? {
      key,
      memberIds: members.map((entry) => entry.memberId),
      memberNames: members.map((entry) => entry.member.displayName),
      matches: 0,
      wins: 0,
      placementTotal: 0,
      matchIds: [],
    }

    existing.matches += 1
    existing.wins += match.placement === 1 ? 1 : 0
    existing.placementTotal += match.placement
    existing.matchIds.push(match.id)

    aggregates.set(key, existing)
  }

  return Array.from(aggregates.values()).sort((left, right) => {
    if (right.wins !== left.wins) {
      return right.wins - left.wins
    }

    if (right.matches !== left.matches) {
      return right.matches - left.matches
    }

    const leftAverage = left.matches > 0 ? left.placementTotal / left.matches : Number.POSITIVE_INFINITY
    const rightAverage = right.matches > 0 ? right.placementTotal / right.matches : Number.POSITIVE_INFINITY
    return leftAverage - rightAverage
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

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        displayName: true,
        clanId: true,
      },
    })

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const scope = parseScope(searchParams.get('scope'))
    const bestMode = parseBestMode(searchParams.get('bestMode'))
    const period = parsePeriod(searchParams.get('period'))
    const periodBounds = getPeriodBounds(period)
    const targetMemberIdValue = searchParams.get('targetMemberId')
    const targetMemberId = targetMemberIdValue ? Number(targetMemberIdValue) : null

    const mapLabels = await getMapLabels()

    const clanMembers = member.clanId
      ? await prisma.clanMember.findMany({
          where: { clanId: member.clanId, isActive: true },
          select: {
            id: true,
            displayName: true,
          },
          orderBy: { displayName: 'asc' },
        })
      : []

    const memberOptions = clanMembers.length > 0
      ? clanMembers
      : [
          {
            id: member.id,
            displayName: member.displayName,
          },
        ]

    const effectiveMemberId =
      scope === 'member' && targetMemberId && memberOptions.some((entry) => entry.id === targetMemberId)
        ? targetMemberId
        : memberId

    let scopeLabel = `Stats cartes de ${member.displayName}`
    let matchRows: Array<{
      mapName: string
      gameMode: string
      kills: number
      knockouts: number
      assists: number
      damageDealt: number
      headshotKills: number
      revives: number
      placement: number
      duration: number
    }> = []

    if (scope === 'clan') {
      if (!member.clanId) {
        return NextResponse.json({
          scope,
          scopeLabel: 'Clan indisponible',
          options: {
            members: memberOptions,
            bestModes: ['duo', 'trio', 'squad'],
          },
          selected: {
            memberId,
            targetMemberId: null,
            bestMode,
            period,
          },
          totals: {
            rows: 0,
            maps: 0,
          },
          mapStats: [],
          bestCompositions: [],
          mapLabels,
        })
      }

      scopeLabel = 'Stats cartes du clan'
      matchRows = await prisma.match.findMany({
        where: {
          member: {
            clanId: member.clanId,
            isActive: true,
          },
          matchType: 'official',
          ...(periodBounds
            ? { pubgCreatedAt: { gte: periodBounds.startDate, lte: periodBounds.endDate } }
            : {}),
        },
        select: {
          mapName: true,
          gameMode: true,
          kills: true,
          knockouts: true,
          assists: true,
          damageDealt: true,
          headshotKills: true,
          revives: true,
          placement: true,
          duration: true,
        },
      })
    } else if (scope === 'best') {
      const squadMatches = await prisma.squadMatch.findMany({
        where: {
          matchType: 'official',
          ...(periodBounds
            ? { createdAt: { gte: periodBounds.startDate, lte: periodBounds.endDate } }
            : {}),
          members: {
            some: {
              memberId,
            },
          },
        },
        select: {
          id: true,
          placement: true,
          members: {
            select: {
              memberId: true,
              member: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      })

      const bestTeam = aggregateTeams(squadMatches, bestMode, memberId)[0]

      if (!bestTeam) {
        scopeLabel = `Meilleur ${bestMode} indisponible`
        matchRows = []
      } else {
        scopeLabel = `Meilleur ${bestMode}: ${bestTeam.memberNames.join(', ')}`
        const pubgMatchIds = await prisma.squadMatch.findMany({
          where: { id: { in: bestTeam.matchIds } },
          select: { pubgMatchId: true },
        })

        matchRows = await prisma.match.findMany({
          where: {
            memberId: { in: bestTeam.memberIds },
            matchType: 'official',
            pubgMatchId: { in: pubgMatchIds.map((entry) => entry.pubgMatchId) },
            ...(periodBounds
              ? { pubgCreatedAt: { gte: periodBounds.startDate, lte: periodBounds.endDate } }
              : {}),
          },
          select: {
            mapName: true,
            gameMode: true,
            kills: true,
            knockouts: true,
            assists: true,
            damageDealt: true,
            headshotKills: true,
            revives: true,
            placement: true,
            duration: true,
          },
        })
      }
    } else {
      const targetMember = memberOptions.find((entry) => entry.id === effectiveMemberId)
      scopeLabel =
        scope === 'member'
          ? `Stats cartes de ${targetMember?.displayName ?? `Joueur #${effectiveMemberId}`}`
          : `Stats cartes de ${member.displayName}`

      matchRows = await prisma.match.findMany({
        where: {
          memberId: effectiveMemberId,
          matchType: 'official',
          ...(periodBounds
            ? { pubgCreatedAt: { gte: periodBounds.startDate, lte: periodBounds.endDate } }
            : {}),
        },
        select: {
          mapName: true,
          gameMode: true,
          kills: true,
          knockouts: true,
          assists: true,
          damageDealt: true,
          headshotKills: true,
          revives: true,
          placement: true,
          duration: true,
        },
      })
    }

    const mapAggregates = new Map<
      string,
      {
        mapName: string
        matches: number
        wins: number
        top10: number
        placementTotal: number
        totalKills: number
        totalKnockouts: number
        totalAssists: number
        totalDamage: number
        totalHeadshots: number
        totalRevives: number
        totalDuration: number
      }
    >()

    for (const row of matchRows) {
      const existing = mapAggregates.get(row.mapName) ?? {
        mapName: row.mapName,
        matches: 0,
        wins: 0,
        top10: 0,
        placementTotal: 0,
        totalKills: 0,
        totalKnockouts: 0,
        totalAssists: 0,
        totalDamage: 0,
        totalHeadshots: 0,
        totalRevives: 0,
        totalDuration: 0,
      }

      existing.matches += 1
      existing.wins += row.placement === 1 ? 1 : 0
      existing.top10 += row.placement <= 10 ? 1 : 0
      existing.placementTotal += row.placement
      existing.totalKills += row.kills
      existing.totalKnockouts += row.knockouts
      existing.totalAssists += row.assists
      existing.totalDamage += row.damageDealt
      existing.totalHeadshots += row.headshotKills
      existing.totalRevives += row.revives
      existing.totalDuration += row.duration

      mapAggregates.set(row.mapName, existing)
    }

    const mapStats = Array.from(mapAggregates.values())
      .map((entry) => ({
        mapName: entry.mapName,
        mapLabel: mapDisplayName(entry.mapName, mapLabels),
        matches: entry.matches,
        wins: entry.wins,
        winRate: entry.matches > 0 ? entry.wins / entry.matches : 0,
        top10Rate: entry.matches > 0 ? entry.top10 / entry.matches : 0,
        avgPlacement: entry.matches > 0 ? entry.placementTotal / entry.matches : 0,
        totalKills: entry.totalKills,
        totalKnockouts: entry.totalKnockouts,
        totalAssists: entry.totalAssists,
        totalDamage: entry.totalDamage,
        totalHeadshots: entry.totalHeadshots,
        totalRevives: entry.totalRevives,
        avgDurationSeconds: entry.matches > 0 ? entry.totalDuration / entry.matches : 0,
      }))
      .sort((left, right) => {
        if (right.matches !== left.matches) {
          return right.matches - left.matches
        }
        if (right.wins !== left.wins) {
          return right.wins - left.wins
        }
        return right.totalDamage - left.totalDamage
      })

    const bestCompositionsScopeMemberId =
      scope === 'member'
        ? effectiveMemberId
        : scope === 'self' || scope === 'best'
          ? memberId
          : null

    const compositionSquadMatches = await prisma.squadMatch.findMany({
      where: {
        ...(periodBounds
          ? { createdAt: { gte: periodBounds.startDate, lte: periodBounds.endDate } }
          : {}),
        members:
          scope === 'clan' && member.clanId
            ? {
                some: {
                  member: {
                    clanId: member.clanId,
                    isActive: true,
                  },
                },
              }
            : {
                some: {
                  memberId: bestCompositionsScopeMemberId ?? memberId,
                },
              },
      },
      select: {
        id: true,
        placement: true,
        members: {
          select: {
            memberId: true,
            member: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
    })

    const bestCompositions = (['duo', 'trio', 'squad'] as const)
      .map((mode) => {
        const best = aggregateTeams(
          compositionSquadMatches,
          mode,
          scope === 'clan' ? undefined : bestCompositionsScopeMemberId ?? memberId
        )[0]

        if (!best) {
          return {
            mode,
            label: getModeLabel(mode),
            teamMembers: [],
            matches: 0,
            wins: 0,
            winRate: 0,
            avgPlacement: 0,
          }
        }

        return {
          mode,
          label: getModeLabel(mode),
          teamMembers: best.memberNames,
          matches: best.matches,
          wins: best.wins,
          winRate: best.matches > 0 ? best.wins / best.matches : 0,
          avgPlacement: best.matches > 0 ? best.placementTotal / best.matches : 0,
        }
      })

    return NextResponse.json({
      scope,
      scopeLabel,
      options: {
        members: memberOptions,
        bestModes: ['duo', 'trio', 'squad'],
      },
      selected: {
        memberId,
        targetMemberId: scope === 'member' ? effectiveMemberId : null,
        bestMode,
        period,
      },
      totals: {
        rows: matchRows.length,
        maps: mapStats.length,
      },
      mapStats,
      bestCompositions,
      mapLabels,
    })
  } catch (error) {
    console.error('Error fetching map stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
