import { NextResponse } from 'next/server'

import { getMapLabels } from '@/lib/map-label-service'
import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

type Scope = 'self' | 'member' | 'clan' | 'best'
type BestMode = 'duo' | 'trio' | 'squad'
type Period = 'week' | 'month' | 'all'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

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

function getPeriodStart(period: Period): Date | null {
  if (period === 'all') {
    return null
  }

  const now = new Date()

  if (period === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
}

function toMondayIndex(day: number) {
  return (day + 6) % 7
}

function buildHeatmap(createdAtList: Date[]) {
  const counts = new Map<string, number>()

  for (const createdAt of createdAtList) {
    const day = toMondayIndex(createdAt.getDay())
    const hour = createdAt.getHours()
    const key = `${day}-${hour}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  let maxCellCount = 0
  const heatmap = DAY_LABELS.flatMap((dayLabel, dayIndex) =>
    Array.from({ length: 24 }, (_, hour) => {
      const count = counts.get(`${dayIndex}-${hour}`) ?? 0
      if (count > maxCellCount) {
        maxCellCount = count
      }
      return {
        day: dayLabel,
        dayIndex,
        hour,
        count,
      }
    })
  )

  return {
    heatmap,
    maxCellCount,
  }
}

function uniqueSortedMapNames(mapNames: string[]) {
  return Array.from(new Set(mapNames)).sort((left, right) => left.localeCompare(right))
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

    const authError = await requireSameClanAsMember(memberId, request)
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
    const periodStart = getPeriodStart(period)
    const selectedMapName = searchParams.get('mapName') ?? ''
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

    if (scope === 'clan') {
      if (!member.clanId) {
        return NextResponse.json({
          scope,
          scopeLabel: 'Clan indisponible',
          options: {
            members: memberOptions,
            bestModes: ['duo', 'trio', 'squad'],
            mapNames: [],
            mapLabels,
          },
          selected: {
            memberId,
            targetMemberId: null,
            bestMode,
            period,
            mapName: '',
          },
          matchCount: 0,
          heatmap: [],
          maxCellCount: 0,
        })
      }

      const clanMatches = await prisma.squadMatch.findMany({
        where: {
          ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
          members: {
            some: {
              member: {
                clanId: member.clanId,
                isActive: true,
              },
            },
          },
        },
        select: {
          createdAt: true,
          mapName: true,
        },
      })

      const mapNames = uniqueSortedMapNames(clanMatches.map((match) => match.mapName))
      const effectiveMapName = mapNames.includes(selectedMapName) ? selectedMapName : ''
      const filteredMatches =
        effectiveMapName.length > 0
          ? clanMatches.filter((match) => match.mapName === effectiveMapName)
          : clanMatches

      const createdAtList = filteredMatches.map((match) => match.createdAt)
      const { heatmap, maxCellCount } = buildHeatmap(createdAtList)

      return NextResponse.json({
        scope,
        scopeLabel: 'Activite du clan',
        options: {
          members: memberOptions,
          bestModes: ['duo', 'trio', 'squad'],
          mapNames,
          mapLabels,
        },
        selected: {
          memberId,
          targetMemberId: null,
          bestMode,
          period,
          mapName: effectiveMapName,
        },
        matchCount: createdAtList.length,
        heatmap,
        maxCellCount,
      })
    }

    if (scope === 'best') {
      const squadMatches = await prisma.squadMatch.findMany({
        where: {
          ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
          members: {
            some: {
              memberId,
            },
          },
        },
        select: {
          placement: true,
          createdAt: true,
          mapName: true,
          members: {
            select: {
              memberId: true,
              member: {
                select: {
                  displayName: true,
                },
              },
            },
            orderBy: { memberId: 'asc' },
          },
        },
      })

      type TeamAggregate = {
        teammateIds: number[]
        teammateNames: string[]
        matches: number
        wins: number
        placements: number
        createdAtEntries: Array<{ createdAt: Date; mapName: string }>
      }

      const aggregates = new Map<string, TeamAggregate>()

      for (const match of squadMatches) {
        const members = match.members

        const isMatchingMode =
          (bestMode === 'duo' && members.length === 2) ||
          (bestMode === 'trio' && members.length === 3) ||
          (bestMode === 'squad' && members.length >= 4)

        if (!isMatchingMode) {
          continue
        }

        const teammates = members.filter((entry) => entry.memberId !== memberId)
        if (teammates.length === 0) {
          continue
        }

        const teammateIds = teammates.map((entry) => entry.memberId)
        const key = teammateIds.join(':')
        const existing = aggregates.get(key) ?? {
          teammateIds,
          teammateNames: teammates.map((entry) => entry.member.displayName),
          matches: 0,
          wins: 0,
          placements: 0,
          createdAtEntries: [],
        }

        existing.matches += 1
        existing.wins += match.placement === 1 ? 1 : 0
        existing.placements += match.placement
        existing.createdAtEntries.push({ createdAt: match.createdAt, mapName: match.mapName })
        aggregates.set(key, existing)
      }

      const bestTeam = Array.from(aggregates.values()).sort((left, right) => {
        if (right.wins !== left.wins) {
          return right.wins - left.wins
        }
        if (right.matches !== left.matches) {
          return right.matches - left.matches
        }
        const leftAveragePlacement = left.matches > 0 ? left.placements / left.matches : Number.POSITIVE_INFINITY
        const rightAveragePlacement = right.matches > 0 ? right.placements / right.matches : Number.POSITIVE_INFINITY
        return leftAveragePlacement - rightAveragePlacement
      })[0]

      const mapNames = uniqueSortedMapNames(
        (bestTeam?.createdAtEntries ?? []).map((entry) => entry.mapName)
      )
      const effectiveMapName = mapNames.includes(selectedMapName) ? selectedMapName : ''
      const filteredEntries =
        effectiveMapName.length > 0
          ? (bestTeam?.createdAtEntries ?? []).filter((entry) => entry.mapName === effectiveMapName)
          : bestTeam?.createdAtEntries ?? []

      const createdAtList = filteredEntries.map((entry) => entry.createdAt)
      const { heatmap, maxCellCount } = buildHeatmap(createdAtList)

      return NextResponse.json({
        scope,
        scopeLabel: bestTeam
          ? `Meilleur ${bestMode}: ${bestTeam.teammateNames.join(', ')}`
          : `Meilleur ${bestMode} indisponible`,
        options: {
          members: memberOptions,
          bestModes: ['duo', 'trio', 'squad'],
          mapNames,
          mapLabels,
        },
        selected: {
          memberId,
          targetMemberId: null,
          bestMode,
          period,
          mapName: effectiveMapName,
        },
        matchCount: createdAtList.length,
        heatmap,
        maxCellCount,
      })
    }

    const effectiveMemberId =
      scope === 'member' && targetMemberId && memberOptions.some((entry) => entry.id === targetMemberId)
        ? targetMemberId
        : memberId

    const targetMember = memberOptions.find((entry) => entry.id === effectiveMemberId)

    const matches = await prisma.match.findMany({
      where: {
        memberId: effectiveMemberId,
        ...(periodStart ? { pubgCreatedAt: { gte: periodStart } } : {}),
      },
      select: {
        pubgCreatedAt: true,
        mapName: true,
      },
    })

    const mapNames = uniqueSortedMapNames(matches.map((match) => match.mapName))
    const effectiveMapName = mapNames.includes(selectedMapName) ? selectedMapName : ''
    const filteredMatches =
      effectiveMapName.length > 0
        ? matches.filter((match) => match.mapName === effectiveMapName)
        : matches

    const createdAtList = filteredMatches.map((match) => match.pubgCreatedAt)
    const { heatmap, maxCellCount } = buildHeatmap(createdAtList)

    return NextResponse.json({
      scope,
      scopeLabel:
        scope === 'member'
          ? `Activite de ${targetMember?.displayName ?? `Joueur #${effectiveMemberId}`}`
          : `Activite de ${member.displayName}`,
      options: {
        members: memberOptions,
        bestModes: ['duo', 'trio', 'squad'],
        mapNames,
        mapLabels,
      },
      selected: {
        memberId,
        targetMemberId: scope === 'member' ? effectiveMemberId : null,
        bestMode,
        period,
        mapName: effectiveMapName,
      },
      matchCount: createdAtList.length,
      heatmap,
      maxCellCount,
    })
  } catch (error) {
    console.error('Error fetching activity heatmap:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
