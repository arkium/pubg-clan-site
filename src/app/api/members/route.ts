import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'
import { searchPlayerByName } from '@/lib/pubg'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'
import { ensureTrackedClanForPlayer, getOrCreateUngroupedClan, syncTrackedClanStats } from '@/lib/clan-service'
import { requirePermission } from '@/middleware/auth-permission'
import { z } from 'zod'

const RANKED_METRICS: Array<{
  key: string
  order: 'asc' | 'desc'
  getValue: (stats: {
    combat: Record<string, number>
    victory: Record<string, number>
    support: Record<string, number>
    vehicle: Record<string, number>
    movement: Record<string, number>
    other: Record<string, number>
  }) => number
}> = [
  { key: 'combat.kills', order: 'desc', getValue: (stats) => stats.combat.kills ?? 0 },
  { key: 'combat.deaths', order: 'asc', getValue: (stats) => stats.combat.deaths ?? 0 },
  { key: 'combat.kdRatio', order: 'desc', getValue: (stats) => stats.combat.kdRatio ?? 0 },
  { key: 'combat.headshots', order: 'desc', getValue: (stats) => stats.combat.headshots ?? 0 },
  { key: 'combat.assists', order: 'desc', getValue: (stats) => stats.combat.assists ?? 0 },
  { key: 'combat.knockouts', order: 'desc', getValue: (stats) => stats.combat.knockouts ?? 0 },
  { key: 'combat.highestKillstreak', order: 'desc', getValue: (stats) => stats.combat.highestKillstreak ?? 0 },
  { key: 'combat.longestKill', order: 'desc', getValue: (stats) => stats.combat.longestKill ?? 0 },
  { key: 'combat.teamkills', order: 'desc', getValue: (stats) => stats.combat.teamkills ?? 0 },
  { key: 'combat.suicides', order: 'asc', getValue: (stats) => stats.combat.suicides ?? 0 },
  { key: 'victory.wins', order: 'desc', getValue: (stats) => stats.victory.wins ?? 0 },
  { key: 'victory.losses', order: 'asc', getValue: (stats) => stats.victory.losses ?? 0 },
  { key: 'victory.winLossRatio', order: 'desc', getValue: (stats) => stats.victory.winLossRatio ?? 0 },
  { key: 'victory.longestTimeAlive', order: 'desc', getValue: (stats) => stats.victory.longestTimeAlive ?? 0 },
  {
    key: 'support.teammatesRevived',
    order: 'desc',
    getValue: (stats) => stats.support.teammatesRevived ?? 0,
  },
  { key: 'support.boostsUsed', order: 'desc', getValue: (stats) => stats.support.boostsUsed ?? 0 },
  { key: 'support.healed', order: 'desc', getValue: (stats) => stats.support.healed ?? 0 },
  {
    key: 'vehicle.vehiclesDestroyed',
    order: 'desc',
    getValue: (stats) => stats.vehicle.vehiclesDestroyed ?? 0,
  },
  { key: 'vehicle.roadkills', order: 'desc', getValue: (stats) => stats.vehicle.roadkills ?? 0 },
  {
    key: 'movement.drivenDistance',
    order: 'desc',
    getValue: (stats) => stats.movement.drivenDistance ?? 0,
  },
  {
    key: 'movement.walkedDistance',
    order: 'desc',
    getValue: (stats) => stats.movement.walkedDistance ?? 0,
  },
  {
    key: 'movement.swamDistance',
    order: 'desc',
    getValue: (stats) => stats.movement.swamDistance ?? 0,
  },
  { key: 'other.weaponsPicked', order: 'desc', getValue: (stats) => stats.other.weaponsPicked ?? 0 },
  { key: 'other.damageGiven', order: 'desc', getValue: (stats) => stats.other.damageGiven ?? 0 },
]

/**
 * Schéma de validation pour ajouter un membre
 */
const AddMemberSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
  pubgPlayerName: z.string().min(1, 'PUBG player name is required'),
  platformShard: z.string().default('steam'),
  clanId: z.number().int().positive().optional(),
})

/**
 * POST /api/members
 * Ajoute un nouveau membre du clan
 */
export async function POST(request: NextRequest) {
  try {
    const permissionError = await requirePermission('manage_members')(request)
    if (permissionError) {
      return permissionError
    }

    const body = await request.json()

    // Valider l'entrée
    const validated = AddMemberSchema.parse(body)

    // Chercher le joueur sur PUBG
    const pubgPlayer = await searchPlayerByName(
      validated.pubgPlayerName,
      validated.platformShard
    )

    if (!pubgPlayer) {
      return NextResponse.json(
        { error: 'PUBG player not found' },
        { status: 404 }
      )
    }

    const detectedClan = await ensureTrackedClanForPlayer(
      pubgPlayer.accountId,
      validated.platformShard
    )

    console.info('[Members API] Clan detection result', {
      pubgPlayerName: pubgPlayer.playerName,
      platformShard: validated.platformShard,
      detectedClanId: detectedClan?.clan.id ?? null,
      detectedPubgClanId: detectedClan?.pubgClan.id ?? null,
    })

    const resolvedClanId =
      detectedClan?.clan.id ??
      validated.clanId ??
      (await getOrCreateUngroupedClan(validated.platformShard)).id

    console.info('[Members API] Final clan resolution', {
      pubgPlayerName: pubgPlayer.playerName,
      platformShard: validated.platformShard,
      resolvedClanId,
      usedFallbackUngrouped: !detectedClan?.clan.id && !validated.clanId,
    })

    // Créer le membre du clan en base
    const member = await prisma.clanMember.create({
      data: {
        displayName: validated.displayName,
        pubgPlayerName: pubgPlayer.playerName,
        pubgAccountId: pubgPlayer.accountId,
        platformShard: validated.platformShard,
        clanId: resolvedClanId,
      },
      include: {
        clan: {
          select: {
            id: true,
            name: true,
            tag: true,
            pubgClanId: true,
            platformShard: true,
          },
        },
      },
    })

    await initializeDefaultRoles(resolvedClanId)
    await assignDefaultMemberRole(member.id, resolvedClanId)

    try {
      await syncTrackedClanStats(resolvedClanId)
    } catch (syncError) {
      console.warn('Unable to synchronize clan stats after member creation:', syncError)
    }

    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Member already exists for this PUBG name and platform' },
        { status: 409 }
      )
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error adding member:', error)
    return NextResponse.json(
      { error: 'Failed to add member' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/members
 * Récupère tous les membres du clan
 * Query param: clanId (optional) — filtre par clan
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const clanIdParam = searchParams.get('clanId')
    const clanId = clanIdParam ? Number(clanIdParam) : undefined

    const members = await prisma.clanMember.findMany({
      where: {
        isActive: true,
        ...(clanId !== undefined && Number.isInteger(clanId) && clanId > 0
          ? { clanId }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayName: true,
        pubgPlayerName: true,
        pubgAccountId: true,
        platformShard: true,
        createdAt: true,
        identities: {
          select: {
            user: {
              select: {
                avatarUrl: true,
              },
            },
          },
          take: 1,
        },
        clan: {
          select: {
            id: true,
            name: true,
            tag: true,
            pubgClanId: true,
          },
        },
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    })

    const membersWithAvatar = members.map((member) => ({
      ...member,
      avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
      identities: undefined,
      isOwner: member.roles.some((entry) => entry.role.name === 'Owner'),
      roles: undefined,
    }))

    const clanIds = Array.from(
      new Set(membersWithAvatar.map((member) => member.clan?.id).filter((value): value is number => !!value))
    )

    const statsRows = await prisma.memberLifetimeStats.findMany({
      where: {
        member: {
          isActive: true,
          clanId: { in: clanIds },
        },
      },
      select: {
        memberId: true,
        member: {
          select: {
            clanId: true,
          },
        },
        combat: true,
        victory: true,
        support: true,
        vehicle: true,
        movement: true,
        other: true,
      },
    })

    const medalCountsByMemberId = new Map<number, { gold: number; silver: number; bronze: number }>()

    for (const metric of RANKED_METRICS) {
      for (const clanIdValue of clanIds) {
        const entries = statsRows
          .filter((row) => row.member.clanId === clanIdValue)
          .map((row) => ({
            memberId: row.memberId,
            value: metric.getValue({
              combat: row.combat as Record<string, number>,
              victory: row.victory as Record<string, number>,
              support: row.support as Record<string, number>,
              vehicle: row.vehicle as Record<string, number>,
              movement: row.movement as Record<string, number>,
              other: row.other as Record<string, number>,
            }),
          }))

        const sorted = entries.sort((left, right) =>
          metric.order === 'asc' ? left.value - right.value : right.value - left.value
        )

        sorted.slice(0, 3).forEach((entry, index) => {
          const current = medalCountsByMemberId.get(entry.memberId) ?? {
            gold: 0,
            silver: 0,
            bronze: 0,
          }

          if (index === 0) {
            current.gold += 1
          } else if (index === 1) {
            current.silver += 1
          } else if (index === 2) {
            current.bronze += 1
          }

          medalCountsByMemberId.set(entry.memberId, current)
        })
      }
    }

    const membersWithMedals = membersWithAvatar.map((member) => ({
      ...member,
      medalCounts: medalCountsByMemberId.get(member.id) ?? { gold: 0, silver: 0, bronze: 0 },
    }))

    return NextResponse.json(membersWithMedals)
  } catch (error) {
    console.error('Error fetching members:', error)
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    )
  }
}
