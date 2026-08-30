import { prisma } from '@/lib/prisma'

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

  const clanIds = [tournament.organizerClanId, ...tournament.clans.map((entry) => entry.clanId)]

  return prisma.squadMatch.findMany({
    where: {
      matchType: 'custom',
      createdAt: {
        gte: tournament.startDate,
        lte: tournament.endDate,
      },
      ...(tournament.gameMode ? { gameMode: tournament.gameMode } : {}),
      ...(tournament.mapName ? { mapName: tournament.mapName } : {}),
      members: {
        some: {
          member: {
            clanId: { in: clanIds },
          },
        },
      },
    },
    include: {
      members: {
        where: {
          member: {
            clanId: { in: clanIds },
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

  const participantClanIds = new Set(tournament.clans.map((entry) => entry.clanId))
  participantClanIds.add(tournament.organizerClanId)

  if (!participantClanIds.has(clanId) && tournament.organizerClanId !== clanId) {
    throw new Error('Tournament not found for this clan')
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

  const uniqueParticipantClanIds = Array.from(
    new Set([clanId, ...(input.participantClanIds ?? []).filter((value) => Number.isInteger(value) && value > 0)])
  )

  if (uniqueParticipantClanIds.length === 0) {
    throw new Error('At least one participating clan is required')
  }

  const existingClans = await prisma.clan.findMany({
    where: { id: { in: uniqueParticipantClanIds } },
    select: { id: true },
  })

  const existingIds = new Set(existingClans.map((clan) => clan.id))
  const missingIds = uniqueParticipantClanIds.filter((id) => !existingIds.has(id))
  if (missingIds.length > 0) {
    throw new Error(`Unknown clans: ${missingIds.join(', ')}`)
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
      clans: {
        create: uniqueParticipantClanIds
          .filter((clanIdValue) => clanIdValue !== clanId)
          .map((clanIdValue) => ({ clanId: clanIdValue })),
      },
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

  const nextParticipantIds = input.participantClanIds
    ? Array.from(new Set([...input.participantClanIds.filter((value) => Number.isInteger(value) && value > 0), clanId]))
    : existing.clans.map((entry) => entry.clanId)

  const existingClans = await prisma.clan.findMany({
    where: { id: { in: nextParticipantIds } },
    select: { id: true },
  })

  const missingIds = nextParticipantIds.filter((id) => !existingClans.some((clan) => clan.id === id))
  if (missingIds.length > 0) {
    throw new Error(`Unknown clans: ${missingIds.join(', ')}`)
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
      clans: input.participantClanIds
        ? {
            deleteMany: {},
            create: nextParticipantIds
              .filter((id) => id !== clanId)
              .map((clanIdValue) => ({ clanId: clanIdValue })),
          }
        : undefined,
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
