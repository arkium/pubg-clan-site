import { z } from 'zod'

import { requireClanFeature } from '@/lib/auth/admin-guards'
import { createMemberInvite, revokeActiveMemberInvite } from '@/lib/auth-service'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth-session'

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
      return Response.json({ error: 'Invalid clan or member id' }, { status: 400 })
    }

    const permissionError = await requireClanFeature(request, parsedClanId, 'clan-members')
    if (permissionError) {
      return permissionError
    }

    const body = (await request.json().catch(() => null)) as unknown
    const validated = InviteSchema.safeParse(body)
    if (!validated.success) {
      return Response.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    // Chantier 4 : si le membre a laisse un email de contact sur /join, il sert de
    // valeur par defaut — inutile de lui redemander la meme information.
    const memberContact = await prisma.clanMember.findUnique({
      where: { id: parsedMemberId },
      select: { contactEmail: true },
    })

    const resolvedEmail = validated.data.email ?? memberContact?.contactEmail ?? undefined

    const shouldSendEmail = validated.data.sendEmail !== false
    if (shouldSendEmail && !resolvedEmail) {
      return Response.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Après la garde : session valide ; un SuperUser peut n'avoir aucun membre actif
    const session = await getSessionFromRequest(request)

    const invite = await createMemberInvite({
      clanId: parsedClanId,
      memberId: parsedMemberId,
      email: resolvedEmail,
      invitedByUserId: session?.userId ?? null,
      invitedByMemberId: session?.activeMemberId ?? null,
      sendEmail: validated.data.sendEmail,
    })

    return Response.json(
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
        return Response.json({ error: error.message }, { status: 404 })
      }

      if (error.message === 'This player already has an account') {
        return Response.json({ error: error.message }, { status: 409 })
      }

      return Response.json({ error: error.message }, { status: 400 })
    }

    console.error('Error creating member invite:', error)
    return Response.json({ error: 'Failed to create invite' }, { status: 500 })
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
      return Response.json({ error: 'Invalid clan or member id' }, { status: 400 })
    }

    // Session obligatoire : avec l'ancien allowMissingActor, la révocation était ouverte à tous (M1)
    const permissionError = await requireClanFeature(request, parsedClanId, 'clan-members')
    if (permissionError) {
      return permissionError
    }

    const { revokedCount } = await revokeActiveMemberInvite({
      clanId: parsedClanId,
      memberId: parsedMemberId,
    })

    return Response.json({ success: true, revokedCount })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Member not found in clan') {
        return Response.json({ error: error.message }, { status: 404 })
      }

      return Response.json({ error: error.message }, { status: 400 })
    }

    console.error('Error revoking member invite:', error)
    return Response.json({ error: 'Failed to revoke invite' }, { status: 500 })
  }
}
