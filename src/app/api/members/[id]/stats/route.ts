import { Prisma } from '@prisma/client'

import { clanMedalRanks, type LifetimeStats, type MedalRanks } from '@/lib/player-career'
import { prisma } from '@/lib/prisma'
import { fetchLifetimeStats, searchPlayerByName } from '@/lib/pubg'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

/**
 * Carrière PUBG d'un joueur (docs/features/carriere-joueur.md) : stats de carrière tous modes et par mode, médailles du
 * clan (`clanMedalRanks`, stats où « plus = mieux », ex æquo partagés) et, pour la plaque, le nom et le clan du joueur.
 * GET lit le cache (`MemberLifetimeStats`) ; sans cache, il interroge l'API PUBG une fois. POST rafraîchit.
 */

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

async function resolvePlayerId(memberId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
  })

  if (!member || !member.pubgPlayerName) {
    return null
  }

  const shard = member.platformShard
  let playerId = member.pubgAccountId

  if (!playerId) {
    const player = await searchPlayerByName(member.pubgPlayerName, shard, { memberId })

    if (!player) {
      return null
    }

    playerId = player.accountId

    await prisma.clanMember.update({
      where: { id: memberId },
      data: { pubgAccountId: playerId },
    })
  }

  return { shard, playerId }
}

async function upsertStats(memberId: number, stats: Awaited<ReturnType<typeof fetchLifetimeStats>>, now: Date) {
  await prisma.memberLifetimeStats.upsert({
    where: { memberId },
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
      memberId,
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
}

function toLifetimeStats(record: {
  combat: unknown
  victory: unknown
  support: unknown
  vehicle: unknown
  movement: unknown
  other: unknown
}): LifetimeStats {
  return {
    combat: record.combat as LifetimeStats['combat'],
    victory: record.victory as LifetimeStats['victory'],
    support: record.support as LifetimeStats['support'],
    vehicle: record.vehicle as LifetimeStats['vehicle'],
    movement: record.movement as LifetimeStats['movement'],
    other: record.other as LifetimeStats['other'],
  }
}

async function buildClanMetricRanks(memberId: number, clanId: number | null): Promise<MedalRanks> {
  if (!clanId) return clanMedalRanks([], memberId)
  const statsRows = await prisma.memberLifetimeStats.findMany({
    where: { member: { clanId, isActive: true } },
    select: { memberId: true, combat: true, victory: true, support: true, vehicle: true, movement: true, other: true },
  })
  return clanMedalRanks(
    statsRows.map((row) => ({ memberId: row.memberId, stats: toLifetimeStats(row) })),
    memberId
  )
}

async function loadMember(memberId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { displayName: true, pubgPlayerName: true, clanId: true, clan: { select: { name: true, tag: true } } },
  })
  return member
    ? { displayName: member.displayName, pubgPlayerName: member.pubgPlayerName, clanId: member.clanId, clan: member.clan }
    : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const cached = await prisma.memberLifetimeStats.findUnique({
      where: { memberId },
    })

    if (cached) {
      const member = await loadMember(memberId)
      const clanRanks = await buildClanMetricRanks(memberId, member?.clanId ?? null)

      return Response.json({
        memberId,
        member,
        stats: toLifetimeStats(cached),
        statsByMode: {
          squad: cached.statsSquad as LifetimeStats | null,
          duo: cached.statsDuo as LifetimeStats | null,
          solo: cached.statsSolo as LifetimeStats | null,
        },
        clanRanks,
        lastRefreshedAt: cached.lastRefreshedAt,
      })
    }

    const resolved = await resolvePlayerId(memberId)

    if (!resolved) {
      return Response.json(
        { error: 'Member not found or no PUBG account linked' },
        { status: 404 }
      )
    }

    const { shard, playerId } = resolved
    const stats = await fetchLifetimeStats(playerId, shard, { memberId })
    const now = new Date()

    await upsertStats(memberId, stats, now)
    const member = await loadMember(memberId)
    const clanRanks = await buildClanMetricRanks(memberId, member?.clanId ?? null)

    return Response.json({
      memberId,
      member,
      playerId,
      shard,
      stats,
      statsByMode: {
        squad: stats.byMode.squad,
        duo: stats.byMode.duo,
        solo: stats.byMode.solo,
      },
      clanRanks,
      lastRefreshedAt: now,
    })
  } catch (error) {
    console.error('Error fetching lifetime stats:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request)
    if (authError) return authError

    const resolved = await resolvePlayerId(memberId)

    if (!resolved) {
      return Response.json(
        { error: 'Member not found or no PUBG account linked' },
        { status: 404 }
      )
    }

    const { shard, playerId } = resolved
    const stats = await fetchLifetimeStats(playerId, shard, { memberId })
    const now = new Date()

    await upsertStats(memberId, stats, now)
    const member = await loadMember(memberId)
    const clanRanks = await buildClanMetricRanks(memberId, member?.clanId ?? null)

    return Response.json({
      memberId,
      member,
      playerId,
      shard,
      stats,
      statsByMode: {
        squad: stats.byMode.squad,
        duo: stats.byMode.duo,
        solo: stats.byMode.solo,
      },
      clanRanks,
      lastRefreshedAt: now,
    })
  } catch (error) {
    console.error('Error refreshing lifetime stats:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
