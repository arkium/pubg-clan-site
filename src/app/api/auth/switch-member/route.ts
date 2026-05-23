import { NextResponse } from 'next/server'
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as unknown
  const validated = SwitchMemberSchema.safeParse(body)

  if (!validated.success) {
    return NextResponse.json(
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
    select: { memberId: true },
  })

  if (!identity) {
    return NextResponse.json({ error: 'Member is not linked to this account' }, { status: 403 })
  }

  const token = getSessionTokenFromRequest(request)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  return NextResponse.json({
    success: true,
    activeMemberId: identity.memberId,
  })
}
