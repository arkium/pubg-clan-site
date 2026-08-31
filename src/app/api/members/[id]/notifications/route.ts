import { NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'
import { NOTIFICATION_TYPES, type NotificationType } from '@/types/notifications'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

function parseMemberId(memberId: string) {
  const parsed = Number(memberId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseBooleanFilter(value: string | null) {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return fallback
  return parsed
}

function parseType(value: string | null): NotificationType | null {
  if (!value) {
    return null
  }

  return NOTIFICATION_TYPES.includes(value as NotificationType)
    ? (value as NotificationType)
    : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsedMemberId = parseMemberId(id)

    if (!parsedMemberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(parsedMemberId, request)
    if (authError) return authError

    const limit = Math.min(parseIntParam(request.nextUrl.searchParams.get('limit'), 10), 50)
    const offset = parseIntParam(request.nextUrl.searchParams.get('offset'), 0)
    const read = parseBooleanFilter(request.nextUrl.searchParams.get('read'))
    const type = parseType(request.nextUrl.searchParams.get('type'))

    const where = {
      memberId: parsedMemberId,
      ...(read === null ? {} : { read }),
      ...(type ? { type } : {}),
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.notification.count({
        where: {
          memberId: parsedMemberId,
          read: false,
        },
      }),
    ])

    return Response.json({
      notifications,
      unreadCount,
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return Response.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsedMemberId = parseMemberId(id)

    if (!parsedMemberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(parsedMemberId, request)
    if (authError) return authError

    const body = (await request.json().catch(() => null)) as
      | { read?: boolean; all?: boolean; ids?: string[] }
      | null

    if (body?.read !== true) {
      return Response.json({ error: 'Only read=true is supported' }, { status: 400 })
    }

    const updateAll = body?.all === true
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []

    if (!updateAll && ids.length === 0) {
      return Response.json({ error: 'Provide all=true or notification ids' }, { status: 400 })
    }

    const result = await prisma.notification.updateMany({
      where: {
        memberId: parsedMemberId,
        read: false,
        ...(updateAll ? {} : { id: { in: ids } }),
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    })

    return Response.json({
      success: true,
      updatedCount: result.count,
    })
  } catch (error) {
    console.error('Error updating notifications:', error)
    return Response.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
