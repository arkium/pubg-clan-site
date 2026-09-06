import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth-session'
import { searchPlayerByName, fetchPlayerClan } from '@/lib/pubg'
import { initializeDefaultRoles } from '@/lib/role-service'
import { notifyJoinRequest, notifyClanCreationRequest } from '@/lib/notification-service'

const JoinRequestSchema = z.object({
  pubgPlayerName: z.string().trim().min(1, 'Le pseudo PUBG est requis').max(32),
  platformShard: z.string().default('steam'),
  mode: z.enum(['preview', 'join']).default('join'),
})

type JoinRequestPayload = z.infer<typeof JoinRequestSchema>

interface JoinResponse {
  status: 'pending' | 'created'
  clanId: number
  clanName: string
  memberId: number
  message: string
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request)

    const body = (await request.json().catch(() => null)) as unknown
    const validated = JoinRequestSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const { pubgPlayerName, platformShard, mode } = validated.data

    // 1. Resolve player account ID from PUBG API
    let pubgAccountId: string
    try {
      const player = await searchPlayerByName(pubgPlayerName, platformShard)
      if (!player) {
        return Response.json({ error: `Joueur "${pubgPlayerName}" introuvable sur l'API PUBG (${platformShard}).` }, { status: 404 })
      }
      pubgAccountId = player.accountId
    } catch (error) {
      console.error('Error searching player:', error)
      return Response.json({ error: 'Impossible de joindre les serveurs de l\'API PUBG.' }, { status: 500 })
    }

    // 1b. Check if this PUBG account is already a member in our DB
    const existingMember = await prisma.clanMember.findFirst({
      where: {
        OR: [
          { pubgAccountId },
          { pubgPlayerName, platformShard },
        ],
      },
      include: { clan: { select: { id: true, name: true, tag: true } } },
    })
    if (existingMember) {
      if (existingMember.isActive && existingMember.joinStatus === 'active') {
        return Response.json(
          {
            error: `Le joueur "${pubgPlayerName}" est déjà enregistré dans le clan "${existingMember.clan?.name ?? 'un clan'}". Veuillez vous connecter à votre compte pour accéder à votre espace clan.`,
            code: 'PLAYER_ALREADY_MEMBER',
            clanId: existingMember.clan?.id,
            clanName: existingMember.clan?.name,
            clanTag: existingMember.clan?.tag,
          },
          { status: 409 }
        )
      }

      if (existingMember.joinStatus === 'pending') {
        return Response.json(
          {
            error: `Une demande d'adhésion pour le joueur "${pubgPlayerName}" est déjà en attente de validation par l'administrateur du clan "${existingMember.clan?.name ?? 'ce clan'}".`,
            code: 'JOIN_REQUEST_PENDING',
            clanId: existingMember.clan?.id,
            clanName: existingMember.clan?.name,
            clanTag: existingMember.clan?.tag,
          },
          { status: 409 }
        )
      }
      // If existingMember was rejected or inactive: allow re-application below!
    }

    // 2. Resolve player's PUBG clan ID
    let pubgClanId: string | null = null
    let pubgClanInfo: { id: string; name: string; tag: string } | null = null
    try {
      const clanInfo = await fetchPlayerClan(pubgAccountId, platformShard)
      if (clanInfo) {
        pubgClanId = clanInfo.id
        pubgClanInfo = {
          id: clanInfo.id,
          name: clanInfo.name,
          tag: clanInfo.tag,
        }
      }
    } catch (error) {
      console.error('Error fetching player clan:', error)
      // Continue without clan info - player might not be in a PUBG clan
    }

    // 3. Check if clan exists in our database
    let clan = null
    if (pubgClanId) {
      clan = await prisma.clan.findFirst({
        where: {
          platformShard,
          pubgClanId,
        },
      })
    }

    // Mode Preview : renvoie les données pour la modale de confirmation sans mutation DB
    if (mode === 'preview') {
      const targetClanName = clan?.name || pubgClanInfo?.name || pubgPlayerName
      const targetClanTag = clan?.tag || pubgClanInfo?.tag || pubgPlayerName.substring(0, 4).toUpperCase()

      return Response.json({
        mode: 'preview',
        authenticated: Boolean(session),
        player: {
          pubgPlayerName,
          platformShard,
          pubgAccountId,
        },
        clan: pubgClanId
          ? {
              pubgClanId,
              name: targetClanName,
              tag: targetClanTag,
              existsOnSite: Boolean(clan),
              isActive: clan ? clan.isActive : false,
            }
          : null,
        actionType: clan ? 'join_existing' : 'create_clan',
        targetClanName,
        targetClanTag,
      })
    }

    // Mode Join : nécessite une session connectée avec message adapté
    if (!session) {
      const actionDesc = clan
        ? `envoyer votre demande d'adhésion au clan "${clan.name}"`
        : `soumettre la création d'un nouveau clan`
      return Response.json(
        {
          error: `Vous devez être connecté avec votre compte utilisateur pour ${actionDesc}.`,
          code: 'AUTH_REQUIRED',
          actionType: clan ? 'join_existing' : 'create_clan',
        },
        { status: 401 }
      )
    }

    // 0. Block users who already have an active member identity
    const existingUserIdentity = await prisma.memberIdentity.findFirst({
      where: {
        userId: session.userId,
        member: {
          isActive: true,
          joinStatus: 'active',
        },
      },
      include: { member: { include: { clan: { select: { name: true } } } } },
    })
    if (existingUserIdentity) {
      return Response.json(
        {
          error: `Votre compte utilisateur est déjà associé au joueur "${existingUserIdentity.member.displayName}" du clan "${existingUserIdentity.member.clan?.name ?? 'un clan'}".`,
        },
        { status: 409 }
      )
    }

    let clanMember: any
    let response: JoinResponse

    if (clan) {
      // CASE 1: Clan already exists in our DB
      // If a rejected/inactive record exists, update it to pending; otherwise create a new one
      if (existingMember) {
        clanMember = await prisma.clanMember.update({
          where: { id: existingMember.id },
          data: {
            clanId: clan.id,
            displayName: pubgPlayerName,
            pubgPlayerName,
            pubgAccountId,
            platformShard,
            isActive: false,
            joinStatus: 'pending',
          },
        })
      } else {
        clanMember = await prisma.clanMember.create({
          data: {
            clanId: clan.id,
            displayName: pubgPlayerName,
            pubgPlayerName,
            pubgAccountId,
            platformShard,
            isActive: false,
            joinStatus: 'pending',
          },
        })
      }

      // Link this member to the user account
      const existingIdentity = await prisma.memberIdentity.findUnique({
        where: { memberId: clanMember.id },
      })
      if (existingIdentity) {
        if (existingIdentity.userId !== session.userId) {
          await prisma.memberIdentity.update({
            where: { id: existingIdentity.id },
            data: { userId: session.userId },
          })
        }
      } else {
        await prisma.memberIdentity.create({
          data: {
            userId: session.userId,
            memberId: clanMember.id,
            isPrimary: !session.activeMemberId,
          },
        })
      }

      // Notify Owner/Admin of the clan (fire-and-forget — non bloquant)
      notifyJoinRequest(clan.id, pubgPlayerName, clanMember.id).catch((err) =>
        console.error('[join] Failed to send join request notification:', err)
      )

      response = {
        status: 'pending',
        clanId: clan.id,
        clanName: clan.name,
        memberId: clanMember.id,
        message: `Votre demande d'adhésion au clan "${clan.name}" a été soumise avec succès. Elle est en attente d'approbation par les administrateurs.`,
      }
    } else {
      // CASE 2: Clan doesn't exist - create new clan and member
      const newClanName = pubgClanInfo?.name || pubgPlayerName
      const newClanTag = pubgClanInfo?.tag || pubgPlayerName.substring(0, 4).toUpperCase()

      const newClan = await prisma.clan.create({
        data: {
          name: newClanName,
          tag: newClanTag,
          platformShard,
          pubgClanId: pubgClanId ?? undefined,
          isActive: false,
        },
      })

      // Initialize default roles for the new clan
      await initializeDefaultRoles(newClan.id)

      // Create or reactivate the clan member (en attente de validation SuperUser)
      if (existingMember) {
        clanMember = await prisma.clanMember.update({
          where: { id: existingMember.id },
          data: {
            clanId: newClan.id,
            displayName: pubgPlayerName,
            pubgPlayerName,
            pubgAccountId,
            platformShard,
            isActive: false,
            joinStatus: 'pending',
          },
        })
      } else {
        clanMember = await prisma.clanMember.create({
          data: {
            clanId: newClan.id,
            displayName: pubgPlayerName,
            pubgPlayerName,
            pubgAccountId,
            platformShard,
            isActive: false,
            joinStatus: 'pending',
          },
        })
      }

      // Link creator as Owner of this clan
      const ownerRole = await prisma.clanRole.findFirst({
        where: {
          clanId: newClan.id,
          name: 'Owner',
        },
      })

      if (ownerRole) {
        await prisma.clanMemberRole.create({
          data: {
            memberId: clanMember.id,
            roleId: ownerRole.id,
            assignedBy: null, // System assignment
          },
        })
      }

      // Link this member to the user account
      const existingIdentity = await prisma.memberIdentity.findUnique({
        where: { memberId: clanMember.id },
      })
      if (existingIdentity) {
        if (existingIdentity.userId !== session.userId) {
          await prisma.memberIdentity.update({
            where: { id: existingIdentity.id },
            data: { userId: session.userId },
          })
        }
      } else {
        await prisma.memberIdentity.create({
          data: {
            userId: session.userId,
            memberId: clanMember.id,
            isPrimary: true,
          },
        })
      }

      // Notify SuperUsers of the new clan pending approval (fire-and-forget)
      notifyClanCreationRequest(newClan.id, newClan.name, newClan.tag, pubgPlayerName).catch((err) =>
        console.error('[join] Failed to notify superusers:', err)
      )

      response = {
        status: 'pending',
        clanId: newClan.id,
        clanName: newClan.name,
        memberId: clanMember.id,
        message: `Votre demande de création du clan "${newClan.name}" a été soumise avec succès. Elle est en attente de validation par le SuperUser avant son activation dans la ligue.`,
      }
    }

    return Response.json(response)
  } catch (error) {
    console.error('Join request error:', error)
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ error: 'Failed to process join request' }, { status: 500 })
  }
}
