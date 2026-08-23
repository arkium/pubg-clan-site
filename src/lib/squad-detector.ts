import { prisma } from '@/lib/prisma'
import type { ResolvedPubgMatch } from '@/lib/pubg'
import { notifySquadDetected } from '@/lib/notification-service'

export type SquadPeriod = 'week' | 'month'

type ClanMemberLookup = {
  id: number
  displayName: string
  pubgPlayerName: string
  pubgAccountId: string | null
}

type SquadAggregate = {
  memberIds: number[]
  memberNames: string[]
  matchesPlayed: number
  wins: number
  winRate: number
  totalKills: number
  totalDamage: number
  totalAssists: number
  totalRevives: number
  averagePlacement: number
}

function normalizePlayerName(name: string) {
  return name.trim().toLowerCase()
}

function getPeriodStart(period: SquadPeriod) {
  const now = new Date()

  if (period === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
}

function sortAggregateMembers(memberIds: number[], memberNames: string[]) {
  return memberIds
    .map((memberId, index) => ({
      memberId,
      memberName: memberNames[index] ?? String(memberId),
    }))
    .sort((left, right) => left.memberId - right.memberId)
}

function sortAggregates<T extends SquadAggregate>(aggregates: T[]) {
  return aggregates.sort((left, right) => {
    if (right.totalKills !== left.totalKills) {
      return right.totalKills - left.totalKills
    }

    if (right.winRate !== left.winRate) {
      return right.winRate - left.winRate
    }

    if (right.matchesPlayed !== left.matchesPlayed) {
      return right.matchesPlayed - left.matchesPlayed
    }

    return right.totalDamage - left.totalDamage
  })
}

function toSquadAggregate<
  T extends Omit<SquadAggregate, 'winRate' | 'averagePlacement'> & { placementTotal: number },
>(aggregate: T): SquadAggregate {
  const { placementTotal, ...stats } = aggregate

  return {
    ...stats,
    winRate: stats.matchesPlayed > 0 ? stats.wins / stats.matchesPlayed : 0,
    averagePlacement:
      stats.matchesPlayed > 0 ? placementTotal / stats.matchesPlayed : 0,
  }
}

function buildClanMemberLookups(members: ClanMemberLookup[]) {
  const membersByPlayerId = new Map<string, ClanMemberLookup>()
  const membersByName = new Map<string, ClanMemberLookup>()

  for (const member of members) {
    if (member.pubgAccountId) {
      membersByPlayerId.set(member.pubgAccountId, member)
    }

    membersByName.set(normalizePlayerName(member.pubgPlayerName), member)
  }

  return { membersByPlayerId, membersByName }
}

function resolveClanMember(
  participant: ResolvedPubgMatch['rosters'][number]['participants'][number],
  membersByPlayerId: Map<string, ClanMemberLookup>,
  membersByName: Map<string, ClanMemberLookup>
) {
  return (
    membersByPlayerId.get(participant.playerId) ??
    membersByName.get(normalizePlayerName(participant.playerName))
  )
}

// Somme scopée au clan à partir des SquadMember filtrés (getClanSquadMatches
// filtre déjà `members` par clanId) — à utiliser à la place des colonnes
// dénormalisées SquadMatch.totalKills/totalDamage/totalAssists/totalRevives,
// qui ne reflètent que le clan ayant créé la ligne en premier sur un match
// désormais potentiellement partagé entre plusieurs clans (voir
// analyzeMatchForSquads).
function sumClanMemberTotals(members: Array<{ kills: number; damage: number; assists: number; revives: number }>) {
  return members.reduce(
    (acc, member) => {
      acc.totalKills += member.kills
      acc.totalDamage += member.damage
      acc.totalAssists += member.assists
      acc.totalRevives += member.revives
      return acc
    },
    { totalKills: 0, totalDamage: 0, totalAssists: 0, totalRevives: 0 }
  )
}

function buildPairKey(memberIds: number[]) {
  return memberIds.join(':')
}

function buildSquadKey(memberIds: number[]) {
  return memberIds.join(':')
}

async function getClanMembers(clanId: number) {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: {
      id: true,
      members: {
        where: { isActive: true },
        select: {
          id: true,
          displayName: true,
          pubgPlayerName: true,
          pubgAccountId: true,
        },
        orderBy: { id: 'asc' },
      },
    },
  })

  if (!clan) {
    throw new Error('Clan not found')
  }

  return clan.members
}

async function getClanSquadMatches(clanId: number, period?: SquadPeriod) {
  const createdAtFilter = period ? { gte: getPeriodStart(period) } : undefined

  return prisma.squadMatch.findMany({
    where: {
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      members: {
        some: {
          member: {
            clanId,
          },
        },
      },
    },
    include: {
      // Un SquadMatch peut désormais être partagé entre plusieurs clans (voir
      // analyzeMatchForSquads) : sans ce filtre, un match croisé renverrait
      // aussi les SquadMember de l'autre clan, faussant les paires/squads de
      // synergie et les totaux ci-dessous.
      members: {
        where: { member: { clanId } },
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
}

export async function calculateSquadStats(squadMatchId: string) {
  const squadMatch = await prisma.squadMatch.findUnique({
    where: { id: squadMatchId },
    include: {
      members: true,
    },
  })

  if (!squadMatch) {
    return null
  }

  const totals = squadMatch.members.reduce(
    (acc, member) => {
      acc.totalKills += member.kills
      acc.totalDamage += member.damage
      acc.totalAssists += member.assists
      acc.totalRevives += member.revives
      return acc
    },
    {
      totalKills: 0,
      totalDamage: 0,
      totalAssists: 0,
      totalRevives: 0,
    }
  )

  const updated = await prisma.squadMatch.update({
    where: { id: squadMatchId },
    data: totals,
    include: {
      members: true,
    },
  })

  return {
    ...updated,
    winRate: updated.placement === 1 ? 1 : 0,
  }
}

type DetectedSquad = {
  placement: number
  members: Array<{
    memberId: number
    kills: number
    damage: number
    assists: number
    revives: number
    placement: number
    knockouts: number
    headshotKills: number
    timeSurvived: number
    rideDistance: number
    walkDistance: number
    swimDistance: number
    boosts: number
    heals: number
    vehicleDestroys: number
    roadKills: number
    longestKill: number
    teamKills: number
    weaponsAcquired: number
  }>
}

function detectSquadFromMatchDetails(
  clanMembers: ClanMemberLookup[],
  matchDetails: ResolvedPubgMatch
): DetectedSquad | null {
  const { membersByPlayerId, membersByName } = buildClanMemberLookups(clanMembers)

  let detectedSquad: DetectedSquad | null = null

  for (const roster of matchDetails.rosters) {
    const resolvedMembers = roster.participants
      .map((participant) => {
        const clanMember = resolveClanMember(participant, membersByPlayerId, membersByName)

        if (!clanMember) {
          return null
        }

        return {
          memberId: clanMember.id,
          kills: participant.kills,
          damage: participant.damageDealt,
          assists: participant.assists,
          revives: participant.revives,
          placement: participant.position,
          knockouts: participant.knockouts,
          headshotKills: participant.headshotKills,
          timeSurvived: participant.timeSurvived,
          rideDistance: participant.rideDistance,
          walkDistance: participant.walkDistance,
          swimDistance: participant.swimDistance,
          boosts: participant.boosts,
          heals: participant.heals,
          vehicleDestroys: participant.vehicleDestroys,
          roadKills: participant.roadKills,
          longestKill: participant.longestKill,
          teamKills: participant.teamKills,
          weaponsAcquired: participant.weaponsAcquired,
        }
      })
      .filter((member): member is NonNullable<typeof member> => member !== null)

    const uniqueMembers = Array.from(
      new Map(resolvedMembers.map((member) => [member.memberId, member])).values()
    )

    if (uniqueMembers.length < 2) {
      continue
    }

    const placements = uniqueMembers
      .map((member) => member.placement)
      .filter((placement) => placement > 0)
    const placement = placements.length > 0 ? Math.min(...placements) : 0

    if (
      !detectedSquad ||
      uniqueMembers.length > detectedSquad.members.length ||
      (uniqueMembers.length === detectedSquad.members.length &&
        placement < detectedSquad.placement)
    ) {
      detectedSquad = {
        placement,
        members: uniqueMembers,
      }
    }
  }

  return detectedSquad
}

export async function analyzeMatchForSquads(clanId: number, matchDetails: ResolvedPubgMatch) {
  const clanMembers = await getClanMembers(clanId)
  const detectedSquad = detectSquadFromMatchDetails(clanMembers, matchDetails)

  const existing = await prisma.squadMatch.findUnique({
    where: { pubgMatchId: matchDetails.id },
    select: { id: true, members: { select: { memberId: true } } },
  })

  if (existing) {
    if (!detectedSquad) {
      return prisma.squadMatch.findUnique({
        where: { id: existing.id },
        include: { members: true },
      })
    }

    // Un même SquadMatch (pubgMatchId globalement unique) peut être partagé par
    // plusieurs clans suivis présents dans le même lobby PUBG. Le clan qui
    // synchronise en premier crée la ligne ; les clans suivants n'attachaient
    // jusqu'ici jamais leurs propres membres, rendant le Head-to-Head
    // structurellement impossible (aucun match n'avait jamais de membres de
    // deux clans différents). On complète donc les SquadMember manquants pour
    // ce clan, SANS recalculer les colonnes dénormalisées totalKills/
    // totalDamage/totalAssists/totalRevives du SquadMatch : elles restent
    // scopées au premier clan qui a créé la ligne. Tout consommateur doit
    // recalculer ses propres totaux depuis les SquadMember filtrés par clan
    // (voir matches-cache-service.ts, matches/route.ts, report-generator.ts,
    // et findBestSquads/getSquadWinRates/getClanSquadAnalysis ci-dessous).
    const existingMemberIds = new Set(existing.members.map((member) => member.memberId))
    const newMembers = detectedSquad.members.filter((member) => !existingMemberIds.has(member.memberId))

    if (newMembers.length > 0) {
      await prisma.squadMember.createMany({
        data: newMembers.map((member) => ({ squadMatchId: existing.id, ...member })),
      })
    }

    return prisma.squadMatch.findUnique({
      where: { id: existing.id },
      include: { members: true },
    })
  }

  if (!detectedSquad) {
    return null
  }

  const createdSquadMatch = await prisma.squadMatch.create({
    data: {
      pubgMatchId: matchDetails.id,
      gameMode: matchDetails.gameMode,
      matchType: matchDetails.matchType,
      mapName: matchDetails.mapName,
      placement: detectedSquad.placement,
      createdAt: new Date(matchDetails.createdAt),
      totalKills: 0,
      totalDamage: 0,
      totalAssists: 0,
      totalRevives: 0,
      members: {
        create: detectedSquad.members.map((member) => ({
          memberId: member.memberId,
          kills: member.kills,
          damage: member.damage,
          assists: member.assists,
          revives: member.revives,
          placement: member.placement,
          knockouts: member.knockouts,
          headshotKills: member.headshotKills,
          timeSurvived: member.timeSurvived,
          rideDistance: member.rideDistance,
          walkDistance: member.walkDistance,
          swimDistance: member.swimDistance,
          boosts: member.boosts,
          heals: member.heals,
          vehicleDestroys: member.vehicleDestroys,
          roadKills: member.roadKills,
          longestKill: member.longestKill,
          teamKills: member.teamKills,
          weaponsAcquired: member.weaponsAcquired,
        })),
      },
    },
  })

  const calculated = await calculateSquadStats(createdSquadMatch.id)

  if (calculated) {
    await notifySquadDetected(calculated.id)
  }

  return calculated
}

export async function findBestPairs(clanId: number, period: SquadPeriod) {
  const squadMatches = await getClanSquadMatches(clanId, period)
  const aggregates = new Map<
    string,
    {
      memberIds: number[]
      memberNames: string[]
      matchesPlayed: number
      wins: number
      totalKills: number
      totalDamage: number
      totalAssists: number
      totalRevives: number
      placementTotal: number
    }
  >()

  for (const squadMatch of squadMatches) {
    if (squadMatch.members.length < 2) {
      continue
    }

    for (let leftIndex = 0; leftIndex < squadMatch.members.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < squadMatch.members.length; rightIndex += 1) {
        const left = squadMatch.members[leftIndex]
        const right = squadMatch.members[rightIndex]
        const sortedMembers = sortAggregateMembers(
          [left.member.id, right.member.id],
          [left.member.displayName, right.member.displayName]
        )
        const memberIds = sortedMembers.map((member) => member.memberId)
        const memberNames = sortedMembers.map((member) => member.memberName)
        const key = buildPairKey(memberIds)
        const aggregate = aggregates.get(key) ?? {
          memberIds,
          memberNames,
          matchesPlayed: 0,
          wins: 0,
          totalKills: 0,
          totalDamage: 0,
          totalAssists: 0,
          totalRevives: 0,
          placementTotal: 0,
        }

        aggregate.matchesPlayed += 1
        aggregate.wins += squadMatch.placement === 1 ? 1 : 0
        aggregate.totalKills += left.kills + right.kills
        aggregate.totalDamage += left.damage + right.damage
        aggregate.totalAssists += left.assists + right.assists
        aggregate.totalRevives += left.revives + right.revives
        aggregate.placementTotal += squadMatch.placement

        aggregates.set(key, aggregate)
      }
    }
  }

  return sortAggregates(
    Array.from(aggregates.values()).map((aggregate) => toSquadAggregate(aggregate))
  )
}

export async function findBestSquads(clanId: number, period: SquadPeriod) {
  const squadMatches = await getClanSquadMatches(clanId, period)
  const aggregates = new Map<
    string,
    {
      memberIds: number[]
      memberNames: string[]
      matchesPlayed: number
      wins: number
      totalKills: number
      totalDamage: number
      totalAssists: number
      totalRevives: number
      placementTotal: number
    }
  >()

  for (const squadMatch of squadMatches) {
    if (squadMatch.members.length < 3 || squadMatch.members.length > 4) {
      continue
    }

    const sortedMembers = sortAggregateMembers(
      squadMatch.members.map((member) => member.member.id),
      squadMatch.members.map((member) => member.member.displayName)
    )
    const memberIds = sortedMembers.map((member) => member.memberId)
    const memberNames = sortedMembers.map((member) => member.memberName)
    const key = buildSquadKey(memberIds)
    const aggregate = aggregates.get(key) ?? {
      memberIds,
      memberNames,
      matchesPlayed: 0,
      wins: 0,
      totalKills: 0,
      totalDamage: 0,
      totalAssists: 0,
      totalRevives: 0,
      placementTotal: 0,
    }

    const matchTotals = sumClanMemberTotals(squadMatch.members)

    aggregate.matchesPlayed += 1
    aggregate.wins += squadMatch.placement === 1 ? 1 : 0
    aggregate.totalKills += matchTotals.totalKills
    aggregate.totalDamage += matchTotals.totalDamage
    aggregate.totalAssists += matchTotals.totalAssists
    aggregate.totalRevives += matchTotals.totalRevives
    aggregate.placementTotal += squadMatch.placement

    aggregates.set(key, aggregate)
  }

  return sortAggregates(
    Array.from(aggregates.values()).map((aggregate) => toSquadAggregate(aggregate))
  )
}

export async function getSquadWinRates(clanId: number, period: SquadPeriod) {
  const squadMatches = await getClanSquadMatches(clanId, period)
  const aggregates = new Map<
    string,
    {
      memberIds: number[]
      memberNames: string[]
      matchesPlayed: number
      wins: number
      totalKills: number
      totalDamage: number
      totalAssists: number
      totalRevives: number
      placementTotal: number
    }
  >()

  for (const squadMatch of squadMatches) {
    if (squadMatch.members.length < 2) {
      continue
    }

    const sortedMembers = sortAggregateMembers(
      squadMatch.members.map((member) => member.member.id),
      squadMatch.members.map((member) => member.member.displayName)
    )
    const memberIds = sortedMembers.map((member) => member.memberId)
    const memberNames = sortedMembers.map((member) => member.memberName)
    const key = buildSquadKey(memberIds)
    const aggregate = aggregates.get(key) ?? {
      memberIds,
      memberNames,
      matchesPlayed: 0,
      wins: 0,
      totalKills: 0,
      totalDamage: 0,
      totalAssists: 0,
      totalRevives: 0,
      placementTotal: 0,
    }

    const matchTotals = sumClanMemberTotals(squadMatch.members)

    aggregate.matchesPlayed += 1
    aggregate.wins += squadMatch.placement === 1 ? 1 : 0
    aggregate.totalKills += matchTotals.totalKills
    aggregate.totalDamage += matchTotals.totalDamage
    aggregate.totalAssists += matchTotals.totalAssists
    aggregate.totalRevives += matchTotals.totalRevives
    aggregate.placementTotal += squadMatch.placement

    aggregates.set(key, aggregate)
  }

  return Array.from(aggregates.values())
    .map((aggregate) => toSquadAggregate(aggregate))
    .sort((left, right) => {
      if (right.winRate !== left.winRate) {
        return right.winRate - left.winRate
      }

      if (right.matchesPlayed !== left.matchesPlayed) {
        return right.matchesPlayed - left.matchesPlayed
      }

      return right.totalKills - left.totalKills
    })
}

export async function getClanSquadAnalysis(clanId: number) {
  const squadMatches = await getClanSquadMatches(clanId)

  return {
    squadMatches: squadMatches.map((squadMatch) => ({
      id: squadMatch.id,
      pubgMatchId: squadMatch.pubgMatchId,
      gameMode: squadMatch.gameMode,
      mapName: squadMatch.mapName,
      placement: squadMatch.placement,
      createdAt: squadMatch.createdAt,
      ...sumClanMemberTotals(squadMatch.members),
      members: squadMatch.members.map((member) => ({
        memberId: member.member.id,
        displayName: member.member.displayName,
        kills: member.kills,
        damage: member.damage,
        assists: member.assists,
        revives: member.revives,
        placement: member.placement,
      })),
      winRate: squadMatch.placement === 1 ? 1 : 0,
    })),
    week: {
      topPairs: await findBestPairs(clanId, 'week'),
      topSquads: await findBestSquads(clanId, 'week'),
      winRates: await getSquadWinRates(clanId, 'week'),
    },
    month: {
      topPairs: await findBestPairs(clanId, 'month'),
      topSquads: await findBestSquads(clanId, 'month'),
      winRates: await getSquadWinRates(clanId, 'month'),
    },
  }
}
