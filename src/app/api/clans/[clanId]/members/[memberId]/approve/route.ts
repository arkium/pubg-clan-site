import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'
import { initializeDefaultRoles, PREDEFINED_ROLES } from '@/lib/role-service'

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

    // Only Owner/Admin can approve members
    const roleError = await requireRole(['Owner', 'Admin'])(request, {
      clanId: parsedClanId,
    })
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
      return NextResponse.json({ error: 'Member not found in clan' }, { status: 404 })
    }

    if (member.isActive) {
      return NextResponse.json({ error: 'Member is already active' }, { status: 400 })
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

    return NextResponse.json({
      message: `${activatedMember.displayName} has been approved and activated as a member of ${activatedMember.clan?.name}`,
      member: activatedMember,
    })
  } catch (error) {
    console.error('Member approval error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Failed to approve member' }, { status: 500 })
  }
}
