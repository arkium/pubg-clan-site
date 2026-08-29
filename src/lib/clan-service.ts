import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  fetchClanMembers,
  fetchLifetimeStats,
  fetchPlayerClan,
  fetchPubgClanById,
  searchPlayerByName,
  type PubgClan,
} from '@/lib/pubg'
import { recalculateStatsForClan } from '@/lib/stats-calculator'

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue
}

function roundValue(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : 0
}

function buildStoredPubgClan(pubgClan: PubgClan | null, shard: string) {
  if (!pubgClan) {
    return null
  }

  return {
    shard,
    clanId: pubgClan.id,
    name: pubgClan.name,
    tag: pubgClan.tag,
    memberCount: pubgClan.memberCount,
    raw: pubgClan.raw,
  }
}

function buildTopPerformer(
  entries: Array<{
    memberId: number
    displayName: string
    totalKills: number
    totalDamage: number
    matchesPlayed: number
    winRate: number
  }>,
  metric: 'totalKills' | 'totalDamage' | 'winRate',
  minMatches = 0
) {
  const filtered = entries.filter((entry) => entry.matchesPlayed >= minMatches)

  if (filtered.length === 0) {
    return null
  }

  const winner = filtered.reduce((best, entry) => (entry[metric] > best[metric] ? entry : best))

  return {
    memberId: winner.memberId,
    displayName: winner.displayName,
    value: roundValue(winner[metric]),
    matchesPlayed: winner.matchesPlayed,
  }
}

export async function upsertTrackedClanFromPubg(pubgClan: PubgClan, platformShard: string) {
  const existingClan = await prisma.clan.findFirst({
    where: {
      platformShard,
      OR: [
        { pubgClanId: pubgClan.id },
        { 
          pubgClanId: null,
          name: pubgClan.name 
        },
      ],
    },
  })

  const clanStats = {
    syncedAt: new Date().toISOString(),
    pubg: buildStoredPubgClan(pubgClan, platformShard),
  }

  if (existingClan) {
    return prisma.clan.update({
      where: { id: existingClan.id },
      data: {
        name: pubgClan.name,
        tag: pubgClan.tag,
        platformShard,
        pubgClanId: pubgClan.id,
        clanStats: toJsonInput(clanStats),
      },
    })
  }

  return prisma.clan.create({
    data: {
      name: pubgClan.name,
      tag: pubgClan.tag,
      platformShard,
      pubgClanId: pubgClan.id,
      clanStats: toJsonInput(clanStats),
    },
  })
}

export async function ensureTrackedClanForPlayer(playerId: string, platformShard: string) {
  try {
    console.info('[Clan Service] Ensuring tracked clan for player', { playerId, platformShard })
    const pubgClan = await fetchPlayerClan(playerId, platformShard)

    if (!pubgClan) {
      console.warn('[Clan Service] No PUBG clan resolved for player', { playerId, platformShard })
      return null
    }

    const clan = await upsertTrackedClanFromPubg(pubgClan, platformShard)

    console.info('[Clan Service] PUBG clan resolved and tracked', {
      playerId,
      platformShard,
      clanId: clan.id,
      pubgClanId: pubgClan.id,
      clanName: clan.name,
    })

    return { clan, pubgClan }
  } catch (error) {
    console.error('Error ensuring tracked clan for player:', error)
    return null
  }
}

export async function getOrCreateUngroupedClan(platformShard: string) {
  const existing = await prisma.clan.findFirst({
    where: {
      platformShard,
      name: 'Ungrouped',
      pubgClanId: null,
    },
  })

  if (existing) {
    return existing
  }

  return prisma.clan.create({
    data: {
      name: 'Ungrouped',
      tag: 'UNG',
      platformShard,
    },
  })
}

async function resolvePubgClanForLocalClan(clanId: number) {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: {
      id: true,
      name: true,
      tag: true,
      platformShard: true,
      pubgClanId: true,
      members: {
        where: { isActive: true },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          pubgAccountId: true,
          pubgPlayerName: true,
          platformShard: true,
        },
      },
    },
  })

  if (!clan) {
    return null
  }

  if (clan.pubgClanId) {
    const pubgClan = await fetchPubgClanById(clan.pubgClanId, clan.platformShard, { clanId: clan.id })
    return pubgClan ? { clan, pubgClan } : { clan, pubgClan: null }
  }

  for (const member of clan.members) {
    let playerId = member.pubgAccountId

    if (!playerId) {
      const player = await searchPlayerByName(member.pubgPlayerName, member.platformShard, {
        clanId: clan.id,
        memberId: member.id,
      })
      playerId = player?.accountId ?? null
    }

    if (!playerId) {
      continue
    }

    const pubgClan = await fetchPlayerClan(playerId, member.platformShard, {
      clanId: clan.id,
      memberId: member.id,
    })

    if (pubgClan) {
      return { clan, pubgClan }
    }
  }

  return { clan, pubgClan: null }
}

export async function syncTrackedClanStats(clanId: number) {
  const resolved = await resolvePubgClanForLocalClan(clanId)

  if (!resolved) {
    throw new Error('Clan not found')
  }

  const { clan, pubgClan } = resolved

  await recalculateStatsForClan(clan.id)

  const statsRows = await prisma.playerStats.findMany({
    where: {
      period: 'all-time',
      member: {
        clanId: clan.id,
        isActive: true,
      },
    },
    include: {
      member: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  })

  const trackedMembersCount = await prisma.clanMember.count({
    where: {
      clanId: clan.id,
      isActive: true,
    },
  })

  const summary = statsRows.reduce(
    (acc, row) => {
      acc.totalKills += row.totalKills
      acc.totalDamage += row.totalDamage
      acc.totalAssists += row.totalAssists
      acc.totalRevives += row.totalRevives
      acc.matchesPlayed += row.matchesPlayed
      acc.matchesWon += row.matchesWon
      return acc
    },
    {
      totalKills: 0,
      totalDamage: 0,
      totalAssists: 0,
      totalRevives: 0,
      matchesPlayed: 0,
      matchesWon: 0,
    }
  )

  const trackedStats = statsRows.map((row) => ({
    memberId: row.member.id,
    displayName: row.member.displayName,
    totalKills: row.totalKills,
    totalDamage: row.totalDamage,
    matchesPlayed: row.matchesPlayed,
    winRate: row.winRate,
  }))

  const clanStats = {
    syncedAt: new Date().toISOString(),
    pubg: buildStoredPubgClan(pubgClan, clan.platformShard),
    tracked: {
      membersCount: trackedMembersCount,
      aggregated: {
        totalKills: summary.totalKills,
        totalDamage: roundValue(summary.totalDamage),
        totalAssists: summary.totalAssists,
        totalRevives: summary.totalRevives,
        matchesPlayed: summary.matchesPlayed,
        matchesWon: summary.matchesWon,
        winRate:
          summary.matchesPlayed > 0 ? roundValue(summary.matchesWon / summary.matchesPlayed) : 0,
      },
      topPerformers: {
        kills: buildTopPerformer(trackedStats, 'totalKills'),
        damage: buildTopPerformer(trackedStats, 'totalDamage'),
        winRate: buildTopPerformer(trackedStats, 'winRate', 3),
      },
    },
  }

  const updatedClan = await prisma.clan.update({
    where: { id: clan.id },
    data: {
      ...(pubgClan
        ? {
            name: pubgClan.name,
            tag: pubgClan.tag,
            pubgClanId: pubgClan.id,
          }
        : {}),
      clanStats: toJsonInput(clanStats),
    },
    select: {
      id: true,
      name: true,
      tag: true,
      platformShard: true,
      pubgClanId: true,
      clanStats: true,
    },
  })

  return updatedClan
}

export type ClanMembershipDiff = {
  pubgClanId: string
  shard: string
  pubgMembersCount: number
  pubgMemberCountFromApi: number | null
  usedFallback: boolean
  incompleteRelationships: boolean
  matched: Array<{
    accountId: string
    pubgName: string | null
    memberId: number
    displayName: string
  }>
  inPubgOnly: Array<{
    accountId: string
    pubgName: string | null
  }>
  inSiteOnly: Array<{
    memberId: number
    displayName: string
    pubgAccountId: string
  }>
  unverified: Array<{
    memberId: number
    displayName: string
  }>
}

export async function syncClanMembership(clanId: number): Promise<ClanMembershipDiff> {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: {
      pubgClanId: true,
      platformShard: true,
      members: {
        where: { isActive: true },
        select: {
          id: true,
          displayName: true,
          pubgAccountId: true,
        },
      },
    },
  })

  if (!clan) {
    throw new Error('Clan not found')
  }

  if (!clan.pubgClanId) {
    throw new Error('Clan has no PUBG clan ID — sync stats first')
  }

  // Try the dedicated /members endpoint first (includes player names).
  // If it fails (404 or unsupported shard), fall back to memberIds from the clan response.
  let pubgMembers: Awaited<ReturnType<typeof fetchClanMembers>>
  let usedFallback = false
  let pubgMemberCountFromApi: number | null = null

  try {
    pubgMembers = await fetchClanMembers(clan.pubgClanId, clan.platformShard, { clanId })
    pubgMemberCountFromApi = pubgMembers.length
  } catch {
    usedFallback = true
    const pubgClan = await fetchPubgClanById(clan.pubgClanId, clan.platformShard, { clanId })
    pubgMemberCountFromApi = pubgClan?.memberCount ?? null
    pubgMembers = (pubgClan?.memberIds ?? []).map((id) => ({ accountId: id, name: null }))
  }

  // If the fallback relationships have fewer members than the official count, the data is
  // incomplete — inSiteOnly would produce false positives (members still in PUBG would appear
  // as having left).
  const incompleteRelationships =
    usedFallback &&
    pubgMemberCountFromApi !== null &&
    pubgMembers.length < pubgMemberCountFromApi

  // Normalize to lowercase to handle potential casing differences between API endpoints.
  const pubgAccountIdSet = new Set(pubgMembers.map((m) => m.accountId.toLowerCase()))
  const pubgMemberByAccountId = new Map(pubgMembers.map((m) => [m.accountId.toLowerCase(), m]))

  const matched: ClanMembershipDiff['matched'] = []
  const inSiteOnly: ClanMembershipDiff['inSiteOnly'] = []
  const unverified: ClanMembershipDiff['unverified'] = []

  for (const member of clan.members) {
    if (!member.pubgAccountId) {
      unverified.push({ memberId: member.id, displayName: member.displayName })
      continue
    }

    if (pubgAccountIdSet.has(member.pubgAccountId.toLowerCase())) {
      const pubgMember = pubgMemberByAccountId.get(member.pubgAccountId.toLowerCase())
      matched.push({
        accountId: member.pubgAccountId,
        pubgName: pubgMember?.name ?? null,
        memberId: member.id,
        displayName: member.displayName,
      })
    } else {
      inSiteOnly.push({
        memberId: member.id,
        displayName: member.displayName,
        pubgAccountId: member.pubgAccountId,
      })
    }
  }

  const matchedAccountIds = new Set(matched.map((m) => m.accountId))
  const inPubgOnly = pubgMembers
    .filter((m) => !matchedAccountIds.has(m.accountId))
    .map((m) => ({ accountId: m.accountId, pubgName: m.name }))

  return {
    pubgClanId: clan.pubgClanId,
    shard: clan.platformShard,
    pubgMembersCount: pubgMembers.length,
    pubgMemberCountFromApi,
    usedFallback,
    incompleteRelationships,
    matched,
    inPubgOnly,
    inSiteOnly,
    unverified,
  }
}

export async function syncClanLifetimeStats(clanId: number) {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { id: true },
  })

  if (!clan) {
    throw new Error('Clan not found')
  }

  const members = await prisma.clanMember.findMany({
    where: {
      clanId,
      isActive: true,
    },
    select: {
      id: true,
      pubgPlayerName: true,
      pubgAccountId: true,
      platformShard: true,
    },
    orderBy: { id: 'asc' },
  })

  let refreshedCount = 0
  let skippedCount = 0
  const errors: string[] = []

  for (const member of members) {
    try {
      let accountId = member.pubgAccountId

      if (!accountId) {
        const player = await searchPlayerByName(member.pubgPlayerName, member.platformShard, {
          clanId,
          memberId: member.id,
        })

        if (!player?.accountId) {
          skippedCount += 1
          errors.push(`Member ${member.id}: compte PUBG introuvable pour ${member.pubgPlayerName}`)
          continue
        }

        accountId = player.accountId

        await prisma.clanMember.update({
          where: { id: member.id },
          data: { pubgAccountId: accountId },
        })
      }

      const stats = await fetchLifetimeStats(accountId, member.platformShard, { clanId, memberId: member.id })
      const now = new Date()

      await prisma.memberLifetimeStats.upsert({
        where: { memberId: member.id },
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
          memberId: member.id,
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

      refreshedCount += 1
    } catch (error) {
      skippedCount += 1
      const reason = error instanceof Error ? error.message : 'Erreur inconnue'
      errors.push(`Member ${member.id}: ${reason}`)
    }
  }

  return {
    clanId,
    membersTotal: members.length,
    refreshedCount,
    skippedCount,
    errors,
  }
}
