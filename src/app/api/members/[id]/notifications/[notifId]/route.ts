import { NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

function parseMemberId(memberId: string) {
  const parsed = Number(memberId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; notifId: string }> }
) {
  try {
    const { id, notifId } = await params
    const parsedMemberId = parseMemberId(id)

    if (!parsedMemberId || !notifId) {
      return Response.json({ error: 'Invalid request' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(parsedMemberId, request)
    if (authError) return authError

    const body = (await request.json().catch(() => null)) as { read?: boolean } | null

    if (typeof body?.read !== 'boolean') {
      return Response.json({ error: 'read boolean is required' }, { status: 400 })
    }

    const updateResult = await prisma.notification.updateMany({
      where: {
        id: notifId,
        memberId: parsedMemberId,
      },
      data: {
        read: body.read,
        readAt: body.read ? new Date() : null,
      },
    })

    if (updateResult.count === 0) {
      return Response.json({ error: 'Notification not found' }, { status: 404 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error updating notification status:', error)
    return Response.json({ error: 'Failed to update notification' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; notifId: string }> }
) {
  try {
    const { id, notifId } = await params
    const parsedMemberId = parseMemberId(id)

    if (!parsedMemberId || !notifId) {
      return Response.json({ error: 'Invalid request' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(parsedMemberId, request)
    if (authError) return authError

    const deleteResult = await prisma.notification.deleteMany({
      where: {
        id: notifId,
        memberId: parsedMemberId,
      },
    })

    if (deleteResult.count === 0) {
      return Response.json({ error: 'Notification not found' }, { status: 404 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error deleting notification:', error)
    return Response.json({ error: 'Failed to delete notification' }, { status: 500 })
  }
}
