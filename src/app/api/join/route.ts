import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth-session'
import { reopenRejectedClan } from '@/lib/clan-archive'
import { decideJoinTarget } from '@/lib/clan-archive-state'
import { searchPlayerByName, fetchPlayerClan } from '@/lib/pubg'
import { initializeDefaultRoles } from '@/lib/role-service'
import { notifyJoinRequest, notifyClanCreationRequest } from '@/lib/notification-service'
import { JOIN_PENDING_PER_EMAIL_LIMIT } from '@/lib/join-request-access'

// Exporte pour que le test importe le VRAI schema au lieu d'en recopier une
// version qui divergerait en silence (voir « Tests de controle » du todo).
export const JoinRequestSchema = z.object({
  pubgPlayerName: z.string().trim().min(1, 'Le pseudo PUBG est requis').max(32),
  platformShard: z.string().default('steam'),
  mode: z.enum(['preview', 'join']).default('join'),
  // Chantier 4 : email de contact du demandeur. Optionnel en `preview` — la
  // previsualisation ne cree rien, inutile de le reclamer avant de savoir si le
  // joueur existe. Exige a l'execution sans compte (le lien de creation du compte
  // y part a l'acceptation, 2026-10-09) et, avec un compte, pour inscrire un clan.
  contactEmail: z
    .string()
    .trim()
    .email('Adresse email invalide')
    .max(190)
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

interface JoinResponse {
  status: 'pending' | 'created'
  clanId: number
  clanName: string
  memberId: number
  message: string
}

/** Rattache le membre au compte connecté, ou change de compte un rattachement existant. */
async function linkMemberToAccount(memberId: number, userId: number, isPrimary: boolean) {
  const existingIdentity = await prisma.memberIdentity.findUnique({ where: { memberId } })
  if (existingIdentity) {
    if (existingIdentity.userId !== userId) {
      await prisma.memberIdentity.update({ where: { id: existingIdentity.id }, data: { userId } })
    }
    return
  }
  await prisma.memberIdentity.create({ data: { userId, memberId, isPrimary } })
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

    const { pubgPlayerName, platformShard, mode, contactEmail } = validated.data

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
            error: `Le joueur "${pubgPlayerName}" est déjà enregistré dans le clan "${existingMember.clan?.name ?? 'un clan'}". Connectez-vous à votre compte ; pas encore de compte ? Demandez une invitation à l'Owner du clan.`,
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
            error: `Une demande d'accès du joueur "${pubgPlayerName}" est déjà en attente de validation par l'Owner du clan "${existingMember.clan?.name ?? 'ce clan'}".`,
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

    // 3b. Clan archivé (docs/TODO/clan-archive.md) : le SuperUser a arrêté de le suivre —
    // une demande de joueur ne défait pas cette décision. Refusé dès l'aperçu, avant toute
    // saisie. Un clan dont la demande a été REFUSÉE, lui, est rouvert plus bas.
    const joinTarget = clan ? decideJoinTarget(clan) : 'open'
    if (clan && joinTarget === 'unfollowed') {
      return Response.json(
        {
          error: `Le clan "${clan.name}" n'est plus suivi par la ligue : aucune demande ne peut être enregistrée. Contactez un administrateur du site pour qu'il le réactive.`,
          code: 'CLAN_NOT_FOLLOWED',
          clanId: clan.id,
          clanName: clan.name,
          clanTag: clan.tag,
        },
        { status: 409 }
      )
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
              // Clan refusé : la demande le soumettra de nouveau au SuperUser.
              reopensRejectedRequest: joinTarget === 'reopen_rejected',
            }
          : null,
        actionType: clan ? 'join_existing' : 'create_clan',
        targetClanName,
        targetClanTag,
      })
    }

    // Mode Join. Sans compte (le cas courant : un compte ne naît que d'une invitation), la demande part avec l'adresse
    // de contact ; son acceptation y enverra le lien de création du compte (src/lib/join-request-access.ts). Avec un
    // compte, la demande lui est rattachée tout de suite, comme avant.
    if (!session && !contactEmail) {
      return Response.json(
        {
          error:
            "Une adresse email de contact est requise : le lien pour créer votre compte y sera envoyé quand la demande sera acceptée.",
          code: 'CONTACT_EMAIL_REQUIRED',
        },
        { status: 400 }
      )
    }

    // Demandes anonymes répétées : quelques demandes en attente au plus par adresse.
    if (contactEmail) {
      const pendingForEmail = await prisma.clanMember.count({ where: { contactEmail, joinStatus: 'pending' } })
      if (pendingForEmail >= JOIN_PENDING_PER_EMAIL_LIMIT) {
        return Response.json(
          {
            error: `Cette adresse a déjà ${pendingForEmail} demandes en attente : attendez qu'elles soient traitées avant d'en envoyer une autre.`,
            code: 'TOO_MANY_PENDING_REQUESTS',
          },
          { status: 429 }
        )
      }
    }

    // 0. Block users who already have an active member identity
    if (session) {
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
    }

    let clanMember: { id: number }
    let response: JoinResponse

    if (clan) {
      // CASE 1: Clan already exists in our DB
      // Clan refusé : la demande le remet en attente de décision SuperUser. Sans cette
      // réouverture, elle viserait un clan archivé que personne ne regarde plus.
      const reopenedRejectedClan =
        joinTarget === 'reopen_rejected' ? await reopenRejectedClan(clan.id) : false

      // If a rejected/inactive record exists, update it to pending; otherwise create a new one.
      // L'adresse de contact sert à l'Owner pour vérifier la demande, puis à l'envoi du lien de création du compte.
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
            ...(contactEmail ? { contactEmail } : {}),
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
            ...(contactEmail ? { contactEmail } : {}),
          },
        })
      }

      // Link this member to the user account (sans compte : le lien se fera à l'activation de l'invitation)
      if (session) {
        await linkMemberToAccount(clanMember.id, session.userId, !session.activeMemberId)
      }

      // Notify Owner/Admin of the clan (fire-and-forget — non bloquant)
      notifyJoinRequest(clan.id, pubgPlayerName, clanMember.id).catch((err) =>
        console.error('[join] Failed to send join request notification:', err)
      )

      // Le clan rouvert revient dans la file du SuperUser : il doit le savoir.
      if (reopenedRejectedClan) {
        notifyClanCreationRequest(clan.id, clan.name, clan.tag, pubgPlayerName).catch((err) =>
          console.error('[join] Failed to notify superusers of a reopened clan:', err)
        )
      }

      response = {
        status: 'pending',
        clanId: clan.id,
        clanName: clan.name,
        memberId: clanMember.id,
        message: reopenedRejectedClan
          ? `Le clan "${clan.name}" avait été refusé : votre demande le soumet de nouveau à la validation du SuperUser.`
          : session
            ? `Votre demande d'accès au clan "${clan.name}" a été envoyée. Elle attend l'approbation de son Owner.`
            : `Votre demande d'accès au clan "${clan.name}" a été envoyée. Quand son Owner l'acceptera, vous recevrez à ${contactEmail} le lien pour créer votre compte.`,
      }
    } else {
      // CASE 2: Clan doesn't exist - create new clan and member

      // Chantier 4 : inscrire un clan engage la ligue, on veut pouvoir recontacter le
      // demandeur pour lui annoncer la decision. Sans compte, l'email est deja exige
      // plus haut ; avec un compte, il ne l'est que sur cette branche.
      if (!contactEmail) {
        return Response.json(
          {
            error:
              "Une adresse email de contact est requise pour demander l'inscription d'un clan : elle sert à vous notifier de la décision du SuperUser.",
            code: 'CONTACT_EMAIL_REQUIRED',
          },
          { status: 400 }
        )
      }

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
            contactEmail,
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
            contactEmail,
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

      // Link this member to the user account (sans compte : le lien se fera à l'activation de l'invitation)
      if (session) {
        await linkMemberToAccount(clanMember.id, session.userId, true)
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
        message: session
          ? `Votre demande d'inscription du clan "${newClan.name}" a été envoyée. Elle attend la validation du SuperUser avant que le clan soit suivi par la ligue.`
          : `Votre demande d'inscription du clan "${newClan.name}" a été envoyée. Quand le SuperUser la validera, vous recevrez à ${contactEmail} le lien pour créer votre compte d'Owner.`,
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
