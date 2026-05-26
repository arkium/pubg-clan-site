import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createMemberInvite, revokeActiveMemberInvite } from '@/lib/auth-service'
import { getSessionFromRequest } from '@/lib/auth-session'
import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'

const InviteSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  sendEmail: z.boolean().optional(),
})

function parsePositiveInt(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string; memberId: string }> }
) {
  try {
    const { clanId, memberId } = await params
    const parsedClanId = parsePositiveInt(clanId)
    const parsedMemberId = parsePositiveInt(memberId)

    if (!parsedClanId || !parsedMemberId) {
      return NextResponse.json({ error: 'Invalid clan or member id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_members')(request, {
      clanId: parsedClanId,
      allowMissingActor: true,
    })
    if (permissionError) {
      return permissionError
    }

    const body = (await request.json().catch(() => null)) as unknown
    const validated = InviteSchema.safeParse(body)
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const shouldSendEmail = validated.data.sendEmail !== false
    if (shouldSendEmail && !validated.data.email) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const [session, actorMemberId] = await Promise.all([
      getSessionFromRequest(request),
      getActorMemberId(request),
    ])

    if (!actorMemberId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invite = await createMemberInvite({
      clanId: parsedClanId,
      memberId: parsedMemberId,
      email: validated.data.email,
      invitedByUserId: session?.userId ?? null,
      invitedByMemberId: actorMemberId,
      sendEmail: validated.data.sendEmail,
    })

    return NextResponse.json(
      {
        success: true,
        inviteId: invite.inviteId,
        expiresAt: invite.expiresAt,
        activationUrl: invite.activationUrl,
        delivery: invite.delivery,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Member not found in clan') {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }

      if (error.message === 'This player already has an account') {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }

      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Error creating member invite:', error)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clanId: string; memberId: string }> }
) {
  try {
    const { clanId, memberId } = await params
    const parsedClanId = parsePositiveInt(clanId)
    const parsedMemberId = parsePositiveInt(memberId)

    if (!parsedClanId || !parsedMemberId) {
      return NextResponse.json({ error: 'Invalid clan or member id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_members')(request, {
      clanId: parsedClanId,
      allowMissingActor: true,
    })
    if (permissionError) {
      return permissionError
    }

    const { revokedCount } = await revokeActiveMemberInvite({
      clanId: parsedClanId,
      memberId: parsedMemberId,
    })

    return NextResponse.json({ success: true, revokedCount })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Member not found in clan') {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }

      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Error revoking member invite:', error)
    return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 })
  }
}
