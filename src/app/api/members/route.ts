import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { searchPlayerByName } from '@/lib/pubg'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'
import { ensureTrackedClanForPlayer, syncTrackedClanStats } from '@/lib/clan-service'
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

    const resolvedClanId = detectedClan?.clan.id ?? validated.clanId

    // Créer le membre du clan en base
    const member = await prisma.clanMember.create({
      data: {
        displayName: validated.displayName,
        pubgPlayerName: pubgPlayer.playerName,
        pubgAccountId: pubgPlayer.accountId,
        platformShard: validated.platformShard,
        ...(resolvedClanId ? { clanId: resolvedClanId } : {}),
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

    if (resolvedClanId) {
      await initializeDefaultRoles(resolvedClanId)
      await assignDefaultMemberRole(member.id, resolvedClanId)

      try {
        await syncTrackedClanStats(resolvedClanId)
      } catch (syncError) {
        console.warn('Unable to synchronize clan stats after member creation:', syncError)
      }
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
      include: {
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

    return NextResponse.json(members)
  } catch (error) {
    console.error('Error fetching members:', error)
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    )
  }
}
