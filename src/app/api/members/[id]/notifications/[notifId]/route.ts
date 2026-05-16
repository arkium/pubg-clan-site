import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

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
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as { read?: boolean } | null

    if (typeof body?.read !== 'boolean') {
      return NextResponse.json({ error: 'read boolean is required' }, { status: 400 })
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
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating notification status:', error)
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; notifId: string }> }
) {
  try {
    const { id, notifId } = await params
    const parsedMemberId = parseMemberId(id)

    if (!parsedMemberId || !notifId) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const deleteResult = await prisma.notification.deleteMany({
      where: {
        id: notifId,
        memberId: parsedMemberId,
      },
    })

    if (deleteResult.count === 0) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting notification:', error)
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 })
  }
}
