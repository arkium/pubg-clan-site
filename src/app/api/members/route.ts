import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { searchPlayerByName } from '@/lib/pubg'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'
import { ensureTrackedClanForPlayer, getOrCreateUngroupedClan, syncTrackedClanStats } from '@/lib/clan-service'
import { z } from 'zod'

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
      },
    })

    const membersWithAvatar = members.map((member) => ({
      ...member,
      avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
      identities: undefined,
    }))

    return NextResponse.json(membersWithAvatar)
  } catch (error) {
    console.error('Error fetching members:', error)
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    )
  }
}
