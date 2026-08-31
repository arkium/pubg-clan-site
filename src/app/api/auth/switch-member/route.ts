import { z } from 'zod'

import { getSessionFromRequest, getSessionTokenFromRequest } from '@/lib/auth-session'
import { hashToken } from '@/lib/auth-crypto'
import { prisma } from '@/lib/prisma'

const SwitchMemberSchema = z.object({
  memberId: z.number().int().positive(),
})

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as unknown
  const validated = SwitchMemberSchema.safeParse(body)

  if (!validated.success) {
    return Response.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const identity = await prisma.memberIdentity.findFirst({
    where: {
      userId: session.userId,
      memberId: validated.data.memberId,
      member: {
        isActive: true,
      },
    },
    select: {
      memberId: true,
      member: { select: { clanId: true } },
    },
  })

  if (!identity) {
    return Response.json({ error: 'Member is not linked to this account' }, { status: 403 })
  }

  // Vérifier si c'est un changement de clan (cross-clan) — réservé au SuperUser
  if (session.activeMemberId && session.activeMemberId !== identity.memberId) {
    const currentMember = await prisma.clanMember.findUnique({
      where: { id: session.activeMemberId },
      select: { clanId: true },
    })

    const targetClanId = identity.member.clanId
    const currentClanId = currentMember?.clanId ?? null

    if (currentClanId !== targetClanId) {
      const user = await prisma.userAccount.findUnique({
        where: { id: session.userId },
        select: { isSuperUser: true },
      })
      if (!user?.isSuperUser) {
        return Response.json(
          { error: 'Forbidden: clan switching requires SuperUser privileges' },
          { status: 403 }
        )
      }
    }
  }

  const token = getSessionTokenFromRequest(request)
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.userSession.updateMany({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
    },
    data: {
      activeMemberId: identity.memberId,
    },
  })

  return Response.json({
    success: true,
    activeMemberId: identity.memberId,
  })
}
