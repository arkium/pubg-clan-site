import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth-session'
import { searchPlayerByName, fetchPlayerClan } from '@/lib/pubg'
import { initializeDefaultRoles } from '@/lib/role-service'
import { notifyJoinRequest } from '@/lib/notification-service'

const JoinRequestSchema = z.object({
  pubgPlayerName: z.string().min(1).max(32),
  platformShard: z.string().default('steam'),
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
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as unknown
    const validated = JoinRequestSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const { pubgPlayerName, platformShard } = validated.data

    // 0. Block users who already have an active member identity
    const existingIdentity = await prisma.memberIdentity.findFirst({
      where: { userId: session.userId },
      include: { member: { include: { clan: { select: { name: true } } } } },
    })
    if (existingIdentity) {
      return Response.json(
        {
          error: `Your account is already linked to a member of "${existingIdentity.member.clan?.name ?? 'a clan'}". Use the clan dashboard instead.`,
        },
        { status: 409 }
      )
    }

    // 1. Resolve player account ID from PUBG API
    let pubgAccountId: string
    try {
      const player = await searchPlayerByName(pubgPlayerName, platformShard)
      if (!player) {
        return Response.json({ error: 'Player not found on PUBG API' }, { status: 404 })
      }
      pubgAccountId = player.accountId
    } catch (error) {
      console.error('Error searching player:', error)
      return Response.json({ error: 'Failed to search player' }, { status: 500 })
    }

    // 1b. Check if this PUBG account is already a member in our DB
    const existingMember = await prisma.clanMember.findFirst({
      where: { pubgAccountId },
      include: { clan: { select: { name: true } } },
    })
    if (existingMember) {
      return Response.json(
        {
          error: `This PUBG account is already registered as a member of "${existingMember.clan?.name ?? 'a clan'}" (status: ${existingMember.joinStatus}).`,
        },
        { status: 409 }
      )
    }

    // 2. Resolve player's PUBG clan ID
    let pubgClanId: string | null = null
    try {
      const clanInfo = await fetchPlayerClan(pubgAccountId, platformShard)
      pubgClanId = clanInfo?.id ?? null
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

    let clanMember: typeof clan extends null
      ? Awaited<ReturnType<typeof prisma.clanMember.create>>
      : any
    let response: JoinResponse

    if (clan) {
      // CASE 1: Clan already exists in our DB
      // Create pending member (isActive = false) waiting for Owner/Admin approval
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

      // Link this member to the user account
      await prisma.memberIdentity.create({
        data: {
          userId: session.userId,
          memberId: clanMember.id,
          isPrimary: !session.activeMemberId, // Mark as primary if no active member yet
        },
      })

      // Notify Owner/Admin of the clan (fire-and-forget — non bloquant)
      notifyJoinRequest(clan.id, pubgPlayerName, clanMember.id).catch((err) =>
        console.error('[join] Failed to send join request notification:', err)
      )

      response = {
        status: 'pending',
        clanId: clan.id,
        clanName: clan.name,
        memberId: clanMember.id,
        message: `You have requested to join ${clan.name}. Awaiting approval from clan Owner/Admin.`,
      }
    } else {
      // CASE 2: Clan doesn't exist - create new clan and member
      // The player becomes the Owner of the new clan automatically
      const newClan = await prisma.clan.create({
        data: {
          name: pubgPlayerName, // Temporary name, can be updated by Owner later
          tag: pubgPlayerName.substring(0, 4).toUpperCase(),
          platformShard,
          pubgClanId: pubgClanId ?? undefined,
        },
      })

      // Initialize default roles for the new clan
      await initializeDefaultRoles(newClan.id)

      // Create the clan member (active as Owner)
      clanMember = await prisma.clanMember.create({
        data: {
          clanId: newClan.id,
          displayName: pubgPlayerName,
          pubgPlayerName,
          pubgAccountId,
          platformShard,
          isActive: true,
          joinStatus: 'active',
        },
      })

      // Link this member to the user account as primary
      await prisma.memberIdentity.create({
        data: {
          userId: session.userId,
          memberId: clanMember.id,
          isPrimary: true,
        },
      })

      // Assign Owner role to the new member
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

      response = {
        status: 'created',
        clanId: newClan.id,
        clanName: newClan.name,
        memberId: clanMember.id,
        message: `You have created and are now Owner of a new clan: ${newClan.name}`,
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
