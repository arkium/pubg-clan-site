import { Prisma } from '@prisma/client'

import { isAuthDisabled } from '@/lib/auth-mode'
import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'
import { searchPlayerByName } from '@/lib/pubg'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'
import { ensureTrackedClanForPlayer, getOrCreateUngroupedClan, syncTrackedClanStats } from '@/lib/clan-service'
import { calculateLifetimeMedalCounts } from '@/lib/lifetime-medals'
import { getActorMemberId, isSuperUserSession, requirePermission } from '@/middleware/auth-permission'
import { z } from 'zod'

/**
 * Schéma de validation pour ajouter un membre
 */
const AddMemberSchema = z
  .object({
    displayName: z.string().trim().optional().default(''),
    pubgPlayerName: z.string().trim().min(1, 'Le pseudo PUBG est requis'),
    platformShard: z.string().default('steam'),
    clanId: z.number().int().positive().optional(),
    mode: z.enum(['preview', 'create']).default('create'),
  })
  .transform((data) => ({
    ...data,
    displayName: data.displayName && data.displayName.length > 0 ? data.displayName : data.pubgPlayerName,
  }))

/**
 * POST /api/members
 * Ajoute un nouveau membre du clan
 */
export async function POST(request: Request) {
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
      validated.platformShard,
      validated.clanId ? { clanId: validated.clanId } : undefined
    )

    if (!pubgPlayer) {
      return Response.json(
        { error: 'Joueur introuvable sur les serveurs PUBG. Vérifiez l’orthographe exacte et la plateforme choisie.' },
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

    // Vérifier que l'acteur est dans le clan cible (ou est SuperUser)
    const actorMemberId = await getActorMemberId(request)
    if (actorMemberId) {
      const actorMember = await prisma.clanMember.findUnique({
        where: { id: actorMemberId },
        select: { clanId: true },
      })
      if (actorMember?.clanId !== resolvedClanId) {
        const superUser = await isSuperUserSession(request)
        if (!superUser) {
          return Response.json({ error: 'Non autorisé : vous ne pouvez ajouter des joueurs qu’à votre propre clan' }, { status: 403 })
        }
      }
    }

    // Vérifier si le joueur existe déjà en base
    const existingMember = await prisma.clanMember.findFirst({
      where: {
        OR: [
          { pubgPlayerName: pubgPlayer.playerName, platformShard: validated.platformShard },
          { pubgAccountId: pubgPlayer.accountId },
        ],
      },
      include: {
        clan: {
          select: { id: true, name: true, tag: true },
        },
      },
    })

    if (existingMember && existingMember.isActive && existingMember.joinStatus === 'active') {
      return Response.json(
        {
          error: `Ce joueur est déjà membre actif du clan ${existingMember.clan?.name ? `"${existingMember.clan.name}"` : 'sur cette plateforme'}.`,
        },
        { status: 409 }
      )
    }

    if (validated.mode === 'preview') {
      return Response.json({
        mode: 'preview',
        player: {
          displayName: validated.displayName,
          pubgPlayerName: pubgPlayer.playerName,
          platformShard: validated.platformShard,
        },
        clan: detectedClan?.clan
          ? {
              id: detectedClan.clan.id,
              name: detectedClan.clan.name,
              tag: detectedClan.clan.tag,
            }
          : null,
      })
    }

    // Créer ou réactiver le membre du clan en base
    const member = existingMember
      ? await prisma.clanMember.update({
          where: { id: existingMember.id },
          data: {
            displayName: validated.displayName,
            pubgPlayerName: pubgPlayer.playerName,
            pubgAccountId: pubgPlayer.accountId,
            platformShard: validated.platformShard,
            clanId: resolvedClanId,
            isActive: true,
            joinStatus: 'active',
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
      : await prisma.clanMember.create({
          data: {
            displayName: validated.displayName,
            pubgPlayerName: pubgPlayer.playerName,
            pubgAccountId: pubgPlayer.accountId,
            platformShard: validated.platformShard,
            clanId: resolvedClanId,
            isActive: true,
            joinStatus: 'active',
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

    return Response.json(member, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json(
        { error: 'Ce joueur est déjà enregistré dans le clan pour cette plateforme.' },
        { status: 409 }
      )
    }

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.issues[0]?.message ?? 'Erreur de validation', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error adding member:', error)
    return Response.json(
      { error: 'Impossible d’ajouter le joueur. Veuillez réessayer ultérieurement.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/members
 * Récupère tous les membres du clan
 * Query param: clanId (optional) — filtre par clan
 */
export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session && !isAuthDisabled()) {
      return Response.json(
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

    const medalCountsByMemberId = calculateLifetimeMedalCounts(
      statsRows.flatMap((row) =>
        row.member.clanId === null
          ? []
          : [{
              memberId: row.memberId,
              clanId: row.member.clanId,
              combat: row.combat as Record<string, number>,
              victory: row.victory as Record<string, number>,
              support: row.support as Record<string, number>,
              vehicle: row.vehicle as Record<string, number>,
              movement: row.movement as Record<string, number>,
              other: row.other as Record<string, number>,
            }]
      )
    )

    const membersWithMedals = membersWithAvatar.map((member) => ({
      ...member,
      medalCounts: medalCountsByMemberId.get(member.id) ?? { gold: 0, silver: 0, bronze: 0 },
    }))

    return Response.json(membersWithMedals)
  } catch (error) {
    console.error('Error fetching members:', error)
    return Response.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    )
  }
}
