import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

const preferenceFields = [
  'squadDetected',
  'topPerformance',
  'challengeStarted',
  'reportReady',
  'inviteReminder',
  'emailNotifications',
  'pushNotifications',
  'inAppNotifications',
] as const

type PreferenceField = (typeof preferenceFields)[number]

function parseMemberId(memberId: string) {
  const parsed = Number(memberId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function ensureMemberExists(memberId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { id: true },
  })

  return !!member
}

function getDefaultPreferences(memberId: number) {
  return {
    memberId,
    squadDetected: true,
    topPerformance: true,
    challengeStarted: true,
    reportReady: true,
    inviteReminder: false,
    emailNotifications: false,
    pushNotifications: true,
    inAppNotifications: true,
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsedMemberId = parseMemberId(id)

    if (!parsedMemberId) {
      return NextResponse.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(parsedMemberId, request)
    if (authError) return authError

    if (!(await ensureMemberExists(parsedMemberId))) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const preferences = await prisma.notificationPreference.upsert({
      where: { memberId: parsedMemberId },
      update: {},
      create: getDefaultPreferences(parsedMemberId),
    })

    return NextResponse.json({ preferences })
  } catch (error) {
    console.error('Error fetching notification preferences:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notification preferences' },
      { status: 500 }
    )
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
      return NextResponse.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(parsedMemberId, request)
    if (authError) return authError

    if (!(await ensureMemberExists(parsedMemberId))) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const updateData: Partial<Record<PreferenceField, boolean>> = {}

    for (const field of preferenceFields) {
      if (typeof body[field] === 'boolean') {
        updateData[field] = body[field] as boolean
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid preference fields provided' }, { status: 400 })
    }

    const preferences = await prisma.notificationPreference.upsert({
      where: { memberId: parsedMemberId },
      update: updateData,
      create: {
        ...getDefaultPreferences(parsedMemberId),
        ...updateData,
      },
    })

    return NextResponse.json({ preferences })
  } catch (error) {
    console.error('Error updating notification preferences:', error)
    return NextResponse.json(
      { error: 'Failed to update notification preferences' },
      { status: 500 }
    )
  }
}
