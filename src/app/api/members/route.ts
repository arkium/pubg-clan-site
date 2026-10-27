import { Prisma } from '@prisma/client'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { getActiveMemberClanId, requireClanFeature } from '@/lib/auth/admin-guards'
import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'
import { searchPlayerByName } from '@/lib/pubg'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'
import {
  ensureTrackedClanForPlayer,
  findTrackedClanForPlayer,
  getOrCreateUngroupedClan,
  syncTrackedClanStats,
} from '@/lib/clan-service'
import { calculateLifetimeMedalCounts } from '@/lib/lifetime-medals'
import { ensurePlayerLinkForMember } from '@/lib/member-player-link'
import { PLAYER_CLAN_CHANGE_SOURCES, PLAYER_CLAN_CHANGE_STATUSES, recordPlayerClanChange } from '@/lib/player-clan-change'
import { syncOpponentIdentityForMemberId } from '@/lib/player-clan-identity'
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
async function handlePost(request: Request) {
  try {
    const body = await request.json()

    // Valider l'entrée
    const validated = AddMemberSchema.parse(body)

    // Autorisation AVANT tout effet (appel PUBG, création d'un clan suivi) : un Owner n'ajoute que
    // dans le clan qu'il désigne et dont il est Owner ; le SuperUser ajoute partout (M6, Q15).
    const session = await getSessionFromRequest(request)
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!session.isSuperUser) {
      if (!validated.clanId) {
        return Response.json({ error: 'Clan cible requis' }, { status: 400 })
      }
      const denied = await requireClanFeature(request, validated.clanId, 'clan-members')
      if (denied) {
        return denied
      }
    }

    // Chercher le joueur sur PUBG
    const pubgPlayer = await searchPlayerByName(
      validated.pubgPlayerName,
      validated.platformShard,
      validated.clanId ? { clanId: validated.clanId } : undefined
    )

    if (!pubgPlayer) {
      return Response.json(
        { error: 'Joueur introuvable sur les serveurs PUBG. Vérifie l’orthographe exacte et la plateforme choisie.' },
        { status: 404 }
      )
    }

    // Seul le SuperUser peut faire suivre (créer ou réactiver) le clan PUBG du joueur ; pour un Owner,
    // on se contente de le retrouver, et un joueur d'un autre clan PUBG est refusé.
    const detectedClan = session.isSuperUser
      ? await ensureTrackedClanForPlayer(pubgPlayer.accountId, validated.platformShard)
      : await findTrackedClanForPlayer(pubgPlayer.accountId, validated.platformShard)

    if (!session.isSuperUser && detectedClan && detectedClan.clan?.id !== validated.clanId) {
      return Response.json(
        {
          error: `Ce joueur appartient au clan PUBG « ${detectedClan.pubgClan.name} » : tu ne peux ajouter des joueurs qu’à ton propre clan.`,
        },
        { status: 403 }
      )
    }

    console.info('[Members API] Clan detection result', {
      pubgPlayerName: pubgPlayer.playerName,
      platformShard: validated.platformShard,
      detectedClanId: detectedClan?.clan?.id ?? null,
      detectedPubgClanId: detectedClan?.pubgClan.id ?? null,
    })

    const usedFallbackUngrouped = !detectedClan?.clan?.id && !validated.clanId
    const resolvedClanId =
      detectedClan?.clan?.id ??
      validated.clanId ??
      (await getOrCreateUngroupedClan(validated.platformShard)).id

    console.info('[Members API] Final clan resolution', {
      pubgPlayerName: pubgPlayer.playerName,
      platformShard: validated.platformShard,
      resolvedClanId,
      usedFallbackUngrouped,
    })

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
          select: { id: true, name: true, tag: true, isSystem: true },
        },
      },
    })

    const existingIsActive = Boolean(existingMember?.isActive && existingMember.joinStatus === 'active')
    // Un joueur suivi sans clan est rangé dans le clan technique (« non groupé ») : ce n'est pas un vrai clan, il
    // rejoint celui qui l'ajoute — même règle de clan PUBG qu'un nouveau joueur, vérifiée plus haut (demande du
    // 2026-10-27 : « il me marque qu'il est toujours dans son ancien clan »).
    const fromUngrouped =
      existingIsActive && Boolean(existingMember?.clan?.isSystem) && existingMember?.clanId !== resolvedClanId && !usedFallbackUngrouped

    if (existingMember && existingIsActive && !fromUngrouped) {
      return Response.json(
        {
          error: existingMember.clan?.isSystem
            ? 'Ce joueur est déjà suivi sans clan (« non groupé ») : choisis le clan où l’ajouter.'
            : `Ce joueur est déjà membre actif du clan ${existingMember.clan?.name ? `"${existingMember.clan.name}"` : 'sur cette plateforme'}.`,
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
        fromUngrouped,
      })
    }

    const memberData = {
      displayName: validated.displayName,
      pubgPlayerName: pubgPlayer.playerName,
      pubgAccountId: pubgPlayer.accountId,
      platformShard: validated.platformShard,
      clanId: resolvedClanId,
      isActive: true,
      joinStatus: 'active',
    }
    const memberInclude = {
      clan: { select: { id: true, name: true, tag: true, pubgClanId: true, platformShard: true } },
    } as const

    // Créer, réactiver, ou sortir du clan technique : ce dernier mouvement et sa trace s'écrivent ensemble, comme
    // la promotion automatique (`pending-promotions.ts`, source `ungrouped_promotion`).
    const member = existingMember && fromUngrouped
      ? await prisma.$transaction(async (tx) => {
          const moved = await tx.clanMember.update({ where: { id: existingMember.id }, data: memberData, include: memberInclude })
          await recordPlayerClanChange(tx, {
            clanMemberId: existingMember.id,
            pubgAccountId: pubgPlayer.accountId,
            platformShard: validated.platformShard,
            previousClanId: existingMember.clanId,
            previousPubgClanTag: existingMember.clan?.tag ?? null,
            newClanId: resolvedClanId,
            newPubgClanId: detectedClan?.pubgClan.id ?? null,
            newPubgClanTag: moved.clan?.tag ?? null,
            source: PLAYER_CLAN_CHANGE_SOURCES.ungroupedPromotion,
            status: PLAYER_CLAN_CHANGE_STATUSES.applied,
            triggeredByUserId: session.userId,
          })
          return moved
        })
      : existingMember
      ? await prisma.clanMember.update({
          where: { id: existingMember.id },
          data: memberData,
          include: memberInclude,
        })
      : await prisma.clanMember.create({ data: memberData, include: memberInclude })

    await ensurePlayerLinkForMember(member.id)
    // Sorti du clan technique : son identité d'adversaire suit son nouveau clan (sinon il resterait candidat ailleurs).
    if (fromUngrouped) await syncOpponentIdentityForMemberId(member.id)
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
      { error: 'Impossible d’ajouter le joueur. Réessaie un peu plus tard.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/members
 * Membres actifs : tous clans pour le SuperUser (page d'import de matchs), sinon ceux du clan du membre actif
 * seulement — jamais ouvert par le mode visiteur (docs/TODO/administration.md Q16).
 * Query param: clanId (optional) — filtre par clan
 */
export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const clanIdParam = searchParams.get('clanId')
    let clanId = clanIdParam ? Number(clanIdParam) : undefined

    if (!session.isSuperUser) {
      const activeClanId = await getActiveMemberClanId(session)
      if (!activeClanId || (clanId !== undefined && clanId !== activeClanId)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
      clanId = activeClanId
    }

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

export const POST = withAdminActionLog('members', handlePost)
