import { NextRequest } from 'next/server'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { requireClanFeature } from '@/lib/auth/admin-guards'
import { getSessionFromRequest } from '@/lib/auth-session'
import { sendMemberApprovedEmail, type ClanDecisionEmailResult } from '@/lib/clan-lifecycle/clan-decision-email'
import { activationUrlOf, invitationNotice, inviteApprovedRequester } from '@/lib/join-request-access'
import { prisma } from '@/lib/prisma'
import { initializeDefaultRoles, PREDEFINED_ROLES } from '@/lib/role-service'

function parsePositiveInt(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function handlePost(
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

    // Only Owner/Admin can approve members
    const roleError = await requireClanFeature(request, parsedClanId, 'clan-members')
    if (roleError) {
      return roleError
    }

    // Fetch the pending member
    const member = await prisma.clanMember.findUnique({
      where: { id: parsedMemberId },
      include: {
        clan: true,
        roles: {
          include: { role: true },
        },
      },
    })

    if (!member || member.clanId !== parsedClanId) {
      return Response.json({ error: 'Member not found in clan' }, { status: 404 })
    }

    if (member.isActive) {
      return Response.json({ error: 'Member is already active' }, { status: 400 })
    }

    // Initialize default roles if needed
    await initializeDefaultRoles(parsedClanId)

    // Activate the member
    const activatedMember = await prisma.clanMember.update({
      where: { id: parsedMemberId },
      data: {
        isActive: true,
        joinStatus: 'active',
      },
      include: {
        clan: true,
        roles: {
          include: { role: true },
        },
      },
    })

    // If member has no roles yet, assign default Member role
    if (activatedMember.roles.length === 0) {
      const memberRole = await prisma.clanRole.findFirst({
        where: {
          clanId: parsedClanId,
          name: PREDEFINED_ROLES.MEMBER.name,
        },
      })

      if (memberRole) {
        await prisma.clanMemberRole.create({
          data: {
            memberId: parsedMemberId,
            roleId: memberRole.id,
            assignedBy: null,
          },
        })
      }
    }

    // Demandeur sans compte (demande envoyée de /join sans session) : l'invitation à créer son compte part avec
    // l'email d'acceptation (src/lib/join-request-access.ts). Un échec ici ne défait pas l'acceptation.
    const session = await getSessionFromRequest(request)
    const invitation = await inviteApprovedRequester({
      clanId: parsedClanId,
      memberId: parsedMemberId,
      contactEmail: activatedMember.contactEmail,
      invitedByUserId: session?.userId ?? null,
      invitedByMemberId: session?.activeMemberId ?? null,
    })
    const emailResult: ClanDecisionEmailResult =
      invitation.status === 'failed'
        ? { sent: false, reason: 'failed' }
        : await sendMemberApprovedEmail({
            contactEmail: activatedMember.contactEmail,
            clanName: activatedMember.clan?.name ?? 'votre clan',
            clanTag: activatedMember.clan?.tag ?? '',
            playerName: activatedMember.pubgPlayerName || activatedMember.displayName,
            activationUrl: activationUrlOf(invitation),
          })

    return Response.json({
      message: `${activatedMember.displayName} est maintenant membre actif du clan ${activatedMember.clan?.name ?? ''}. ${invitationNotice(invitation, emailResult)}`,
      member: activatedMember,
      invitation: { status: invitation.status },
      emailSent: emailResult.sent,
    })
  } catch (error) {
    console.error('Member approval error:', error)
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ error: 'Failed to approve member' }, { status: 500 })
  }
}

export const POST = withAdminActionLog('clans/[clanId]/members/[memberId]/approve', handlePost)
