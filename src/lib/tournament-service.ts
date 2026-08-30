import { prisma } from '@/lib/prisma'
import { fetchMatchDetails } from '@/lib/pubg'

export type TournamentRulesInput = {
  placementPoints?: Record<string | number, number> | null
  killPoints?: number | string | null
  winBonus?: number | string | null
  bestOfRounds?: number | null
}

export type NormalizedTournamentRules = {
  placementPoints: Record<number, number>
  killPoints: number
  winBonus: number
  bestOfRounds: number | null
}

type TournamentMemberRow = {
  memberId: number
  member: {
    clanId: number | null
    displayName?: string | null
  }
  kills: number
  placement: number
}

type TournamentMatchLike = {
  id: string
  createdAt: Date | string
  mapName?: string | null
  gameMode?: string | null
  placement?: number | null
  members: TournamentMemberRow[]
}

export type TournamentTeam = {
  key: string
  clanId: number
  memberIds: number[]
  members: TournamentMemberRow[]
  bestPlacement: number
  totalKills: number
}

export type TournamentStanding = {
  clanId: number
  totalPoints: number
  totalKills: number
  matchesPlayed: number
  wins: number
  bestPlacement: number | null
  averagePlacement: number
}

const DEFAULT_PLACEMENT_POINTS: Record<number, number> = {
  1: 15,
  2: 12,
  3: 10,
  4: 8,
  5: 6,
  6: 4,
  7: 2,
  8: 1,
  9: 1,
  10: 1,
}

function asNumber(value: number | string | null | undefined, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function normalizeTournamentRules(
  input?: TournamentRulesInput | null
): NormalizedTournamentRules {
  const placementPoints = { ...DEFAULT_PLACEMENT_POINTS }

  if (input?.placementPoints && typeof input.placementPoints === 'object') {
    for (const [rawKey, rawValue] of Object.entries(input.placementPoints)) {
      const placement = Number(rawKey)
      const points = asNumber(rawValue, 0)
      if (Number.isInteger(placement) && placement > 0) {
        placementPoints[placement] = points
      }
    }
  }

  const bestOfRounds =
    typeof input?.bestOfRounds === 'number' && Number.isFinite(input.bestOfRounds)
      ? Math.max(1, Math.trunc(input.bestOfRounds))
      : input?.bestOfRounds !== null && input?.bestOfRounds !== undefined
        ? Math.max(1, Math.trunc(Number(input.bestOfRounds)))
        : null

  return {
    placementPoints,
    killPoints: asNumber(input?.killPoints, 0),
    winBonus: asNumber(input?.winBonus, 0),
    bestOfRounds,
  }
}

function buildTeamKey(memberIds: number[]) {
  return [...memberIds].sort((left, right) => left - right).join(':')
}

function endOfTournamentDay(value: Date) {
  const end = new Date(value)
  if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0 && end.getUTCMilliseconds() === 0) {
    end.setUTCHours(23, 59, 59, 999)
  }
  return end
}

export function groupMatchIntoTeams(
  match: TournamentMatchLike,
  participatingClanIds: number[]
): TournamentTeam[] {
  const allowed = new Set(participatingClanIds)
  const byClan = new Map<number, TournamentMemberRow[]>()

  for (const member of match.members ?? []) {
    const clanId = member?.member.clanId
    if (!member || clanId === null || !allowed.has(clanId)) continue
    const existing = byClan.get(clanId) ?? []
    existing.push(member)
    byClan.set(clanId, existing)
  }

  const teams: TournamentTeam[] = []
  const seen = new Set<string>()

  for (const [clanId, members] of [...byClan.entries()].sort((left, right) => left[0] - right[0])) {
    const memberIds = [...new Set(members.map((member) => member.memberId))].sort((left, right) => left - right)
    const key = buildTeamKey(memberIds)
    if (seen.has(key)) continue
    seen.add(key)

    const bestPlacement = members.reduce((min, member) => Math.min(min, member.placement), Number.MAX_SAFE_INTEGER)
    const totalKills = members.reduce((sum, member) => sum + member.kills, 0)

    teams.push({
      key,
      clanId,
      memberIds,
      members,
      bestPlacement,
      totalKills,
    })
  }

  return teams
}

export function computeTournamentStandings(
  matches: TournamentMatchLike[],
  participatingClanIds: number[],
  rulesInput: TournamentRulesInput | NormalizedTournamentRules = {}
): TournamentStanding[] {
  const rules = normalizeTournamentRules(rulesInput)
  const standings = new Map<number, TournamentStanding>()
  const teamScores = new Map<string, { clanId: number; entries: Array<{ points: number; totalKills: number; bestPlacement: number; wins: number }> }>()

  for (const match of matches) {
    const teams = groupMatchIntoTeams(match, participatingClanIds)

    for (const team of teams) {
      const placementScore = rules.placementPoints[team.bestPlacement] ?? 0
      const killScore = team.totalKills * rules.killPoints
      const winBonus = team.bestPlacement === 1 ? rules.winBonus : 0
      const points = placementScore + killScore + winBonus

      const key = team.key
      const aggregate = teamScores.get(key) ?? { clanId: team.clanId, entries: [] }
      aggregate.entries.push({
        points,
        totalKills: team.totalKills,
        bestPlacement: team.bestPlacement,
        wins: team.bestPlacement === 1 ? 1 : 0,
      })
      teamScores.set(key, aggregate)
    }
  }

  for (const team of teamScores.values()) {
    const selectedEntries =
      rules.bestOfRounds !== null && rules.bestOfRounds !== undefined
        ? [...team.entries].sort((left, right) => right.points - left.points).slice(0, rules.bestOfRounds)
        : team.entries

    for (const entry of selectedEntries) {
      const existing = standings.get(team.clanId) ?? {
        clanId: team.clanId,
        totalPoints: 0,
        totalKills: 0,
        matchesPlayed: 0,
        wins: 0,
        bestPlacement: null,
        averagePlacement: 0,
      }

      existing.totalPoints += entry.points
      existing.totalKills += entry.totalKills
      existing.wins += entry.wins
      existing.bestPlacement = existing.bestPlacement === null ? entry.bestPlacement : Math.min(existing.bestPlacement, entry.bestPlacement)
      existing.averagePlacement += entry.bestPlacement
      existing.matchesPlayed += 1
      standings.set(team.clanId, existing)
    }
  }

  const finalStandings = Array.from(standings.values()).map((standing) => ({
    ...standing,
    averagePlacement:
      standing.matchesPlayed > 0 ? standing.averagePlacement / standing.matchesPlayed : 0,
  }))

  return finalStandings.sort((left, right) => {
    if (right.totalPoints !== left.totalPoints) return right.totalPoints - left.totalPoints
    if (right.totalKills !== left.totalKills) return right.totalKills - left.totalKills
    if (left.bestPlacement !== right.bestPlacement) {
      if (left.bestPlacement === null) return 1
      if (right.bestPlacement === null) return -1
      return left.bestPlacement - right.bestPlacement
    }
    return 0
  })
}

export async function getTournamentMatches(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      organizerClanId: true,
      startDate: true,
      endDate: true,
      gameMode: true,
      mapName: true,
      clans: {
        select: { clanId: true },
      },
    },
  })

  if (!tournament) {
    throw new Error('Tournament not found')
  }

  const endDate = endOfTournamentDay(tournament.endDate)

  return prisma.squadMatch.findMany({
    where: {
      matchType: 'custom',
      createdAt: {
        gte: tournament.startDate,
        lte: endDate,
      },
      ...(tournament.gameMode ? { gameMode: tournament.gameMode } : {}),
      ...(tournament.mapName ? { mapName: tournament.mapName } : {}),
      members: {
        some: {
          member: {
            isActive: true,
            clan: { isActive: true },
          },
        },
      },
    },
    include: {
      members: {
        where: {
          member: {
            isActive: true,
            clan: { isActive: true },
          },
        },
        include: {
          member: {
            select: {
              id: true,
              clanId: true,
              displayName: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export function getTrackedTournamentClanIds(matches: TournamentMatchLike[]) {
  return Array.from(
    new Set(
      matches.flatMap((match) => match.members.map((member) => member.member.clanId))
        .filter((clanId): clanId is number => clanId !== null)
    )
  )
}

export async function materializeTournamentCustomMatches(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      organizerClanId: true,
      startDate: true,
      endDate: true,
      clans: { select: { clanId: true } },
    },
  })

  if (!tournament) throw new Error('Tournament not found')

  const allCustomMatches = await prisma.match.findMany({
    where: {
      matchType: 'custom',
      member: { clanId: tournament.organizerClanId },
    },
    select: {
      pubgMatchId: true,
      pubgCreatedAt: true,
      gameMode: true,
      matchType: true,
      mapName: true,
      kills: true,
      damageDealt: true,
      assists: true,
      revives: true,
      placement: true,
      knockouts: true,
      headshotKills: true,
      duration: true,
      member: {
        select: {
          id: true,
          clanId: true,
          pubgAccountId: true,
          platformShard: true,
        },
      },
    },
  })
  const startAt = tournament.startDate.getTime()
  const endAt = endOfTournamentDay(tournament.endDate).getTime()
  const sourceMatches = allCustomMatches.filter((match) =>
    match.pubgCreatedAt.getTime() >= startAt &&
    match.pubgCreatedAt.getTime() <= endAt
  )

  const matchesByPubgId = new Map<string, typeof sourceMatches>()
  for (const match of sourceMatches) {
    const grouped = matchesByPubgId.get(match.pubgMatchId) ?? []
    grouped.push(match)
    matchesByPubgId.set(match.pubgMatchId, grouped)
  }

  const existing = await prisma.squadMatch.findMany({
    where: { pubgMatchId: { in: [...matchesByPubgId.keys()] } },
    select: { pubgMatchId: true },
  })
  const existingIds = new Set(existing.map((match) => match.pubgMatchId))
  let materializedCount = 0
  const errors: string[] = []

  const trackedMembers = await prisma.clanMember.findMany({
    where: { isActive: true, clan: { isActive: true } },
    select: { id: true, pubgAccountId: true, pubgPlayerName: true },
  })
  const membersByAccountId = new Map(
    trackedMembers.filter((member) => member.pubgAccountId).map((member) => [member.pubgAccountId!, member])
  )
  const membersByName = new Map(trackedMembers.map((member) => [member.pubgPlayerName.trim().toLowerCase(), member]))

  for (const [pubgMatchId, matchRows] of matchesByPubgId) {

    try {
      const reference = matchRows[0]
      if (!reference) continue
      if (!reference.member.pubgAccountId) {
        errors.push(`${pubgMatchId}: organizer account id is missing`)
        continue
      }
      const details = await fetchMatchDetails(pubgMatchId, reference.member.pubgAccountId ?? '', reference.member.platformShard)
      const trackedParticipants = new Map<number, { memberId: number; kills: number; damage: number; assists: number; revives: number; placement: number; knockouts: number; headshotKills: number; timeSurvived: number; rideDistance: number; walkDistance: number; swimDistance: number; boosts: number; heals: number; vehicleDestroys: number; roadKills: number; longestKill: number; teamKills: number; weaponsAcquired: number }>()

      for (const roster of details.rosters) {
        for (const participant of roster.participants) {
          const member = membersByAccountId.get(participant.playerId) ?? membersByName.get(participant.playerName.trim().toLowerCase())
          if (!member) continue
          trackedParticipants.set(member.id, {
            memberId: member.id, kills: participant.kills, damage: participant.damageDealt, assists: participant.assists,
            revives: participant.revives, placement: participant.position, knockouts: participant.knockouts,
            headshotKills: participant.headshotKills, timeSurvived: participant.timeSurvived, rideDistance: participant.rideDistance,
            walkDistance: participant.walkDistance, swimDistance: participant.swimDistance, boosts: participant.boosts,
            heals: participant.heals, vehicleDestroys: participant.vehicleDestroys, roadKills: participant.roadKills,
            longestKill: participant.longestKill, teamKills: participant.teamKills, weaponsAcquired: participant.weaponsAcquired,
          })
        }
      }

      const members = Array.from(trackedParticipants.values())
      if (members.length === 0) continue
      const existingMatch = existingIds.has(pubgMatchId)
        ? await prisma.squadMatch.findUnique({ where: { pubgMatchId }, select: { id: true, members: { select: { memberId: true } } } })
        : null

      if (existingMatch) {
        const existingMemberIds = new Set(existingMatch.members.map((member) => member.memberId))
        const missingMembers = members.filter((member) => !existingMemberIds.has(member.memberId))
        if (missingMembers.length > 0) {
          await prisma.squadMember.createMany({ data: missingMembers.map(({ memberId, ...member }) => ({ squadMatchId: existingMatch.id, memberId, ...member })) })
          materializedCount += 1
        }
      } else {
        await prisma.squadMatch.create({
          data: {
            pubgMatchId, gameMode: details.gameMode, matchType: details.matchType, mapName: details.mapName,
            placement: Math.min(...members.map((member) => member.placement)), createdAt: new Date(details.createdAt),
            totalKills: members.reduce((total, member) => total + member.kills, 0), totalDamage: members.reduce((total, member) => total + member.damage, 0),
            totalAssists: members.reduce((total, member) => total + member.assists, 0), totalRevives: members.reduce((total, member) => total + member.revives, 0),
            members: { create: members },
          },
        })
        materializedCount += 1
      }
    } catch (error) {
      errors.push(`${pubgMatchId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    sourceRowCount: sourceMatches.length,
    sourceMatchCount: matchesByPubgId.size,
    materializedCount,
    alreadyMaterializedCount: existingIds.size,
    errors,
  }
}

export type TournamentRulesValue = TournamentRulesInput['placementPoints'] | null

export type TournamentCreateInput = {
  title: string
  description?: string | null
  startDate: Date | string
  endDate: Date | string
  gameMode?: string | null
  mapName?: string | null
  status?: 'draft' | 'active' | 'finished'
  rules?: TournamentRulesInput | null
  participantClanIds?: number[]
}

export type TournamentUpdateInput = Partial<TournamentCreateInput>

export async function listClanTournaments(clanId: number) {
  return prisma.tournament.findMany({
    where: {
      organizerClanId: clanId,
    },
    include: {
      organizerClan: { select: { id: true, name: true } },
      clans: {
        select: {
          clanId: true,
          clan: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
  })
}

export async function getTournamentForClan(clanId: number, tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      organizerClan: { select: { id: true, name: true } },
      clans: {
        select: {
          clanId: true,
          clan: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!tournament) {
    throw new Error('Tournament not found')
  }

  if (tournament.organizerClanId !== clanId) {
    throw new Error('Tournament not found for this organizer clan')
  }

  return tournament
}

export async function createTournament(clanId: number, input: TournamentCreateInput) {
  const title = input.title?.trim()
  if (!title) {
    throw new Error('Title is required')
  }

  const startDate = new Date(input.startDate)
  const endDate = new Date(input.endDate)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Start and end dates are required')
  }

  if (endDate.getTime() < startDate.getTime()) {
    throw new Error('End date must be after start date')
  }

  const normalizedRules = normalizeTournamentRules(input.rules)

  return prisma.tournament.create({
    data: {
      organizerClanId: clanId,
      title,
      description: input.description?.trim() || null,
      startDate,
      endDate,
      gameMode: input.gameMode?.trim() || null,
      mapName: input.mapName?.trim() || null,
      status: input.status ?? 'draft',
      rules: normalizedRules,
    },
    include: {
      organizerClan: { select: { id: true, name: true } },
      clans: {
        select: {
          clanId: true,
          clan: { select: { id: true, name: true } },
        },
      },
    },
  })
}

export async function updateTournament(clanId: number, tournamentId: string, input: TournamentUpdateInput) {
  const existing = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, organizerClanId: true, clans: { select: { clanId: true } } },
  })

  if (!existing) {
    throw new Error('Tournament not found')
  }

  if (existing.organizerClanId !== clanId) {
    throw new Error('Only the organizer can update this tournament')
  }

  const nextRules = input.rules ? normalizeTournamentRules(input.rules) : undefined

  const tournament = await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      ...(input.title ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
      ...(input.endDate ? { endDate: new Date(input.endDate) } : {}),
      ...(input.gameMode !== undefined ? { gameMode: input.gameMode?.trim() || null } : {}),
      ...(input.mapName !== undefined ? { mapName: input.mapName?.trim() || null } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(nextRules ? { rules: nextRules } : {}),
    },
    include: {
      organizerClan: { select: { id: true, name: true } },
      clans: {
        select: {
          clanId: true,
          clan: { select: { id: true, name: true } },
        },
      },
    },
  })

  return tournament
}
