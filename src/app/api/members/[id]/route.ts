import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/middleware/auth-permission'

function parseMemberId(id: string) {
  const parsed = Number(id)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return NextResponse.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const existingMember = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        displayName: true,
        isActive: true,
        clanId: true,
      },
    })

    if (!existingMember || !existingMember.isActive) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    if (!existingMember.clanId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const permissionError = await requirePermission('manage_members')(request, {
      clanId: existingMember.clanId,
    })
    if (permissionError) {
      return permissionError
    }

    const hardDelete = request.nextUrl.searchParams.get('hard') === 'true'

    if (hardDelete) {
      await prisma.clanMember.delete({
        where: { id: memberId },
      })

      return NextResponse.json({
        success: true,
        memberId,
        deleted: 'hard',
      })
    }

    await prisma.clanMember.update({
      where: { id: memberId },
      data: { isActive: false },
    })

    return NextResponse.json({
      success: true,
      memberId,
      deleted: 'soft',
    })
  } catch (error) {
    console.error('Error deleting member:', error)
    return NextResponse.json(
      { error: 'Failed to delete member' },
      { status: 500 }
    )
  }
}
