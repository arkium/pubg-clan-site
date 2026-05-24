import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { normalizeEmail } from '@/lib/auth-crypto'
import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'

const UpdateProfileSchema = z
  .object({
    email: z.string().email('Invalid email address').optional(),
    displayName: z.string().trim().min(1).max(60).optional(),
    avatarUrl: z.string().trim().url('Invalid avatar URL').max(500).optional(),
  })
  .refine((value) => value.email !== undefined || value.displayName !== undefined || value.avatarUrl !== undefined, {
    message: 'No profile field provided',
  })

function sanitizeOptionalText(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const account = await prisma.userAccount.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      identities: {
        include: {
          member: {
            select: {
              id: true,
              displayName: true,
              pubgPlayerName: true,
              platformShard: true,
              isActive: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  })

  if (!account) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    profile: {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      members: account.identities.map((identity) => ({
        memberId: identity.member.id,
        displayName: identity.member.displayName,
        pubgPlayerName: identity.member.pubgPlayerName,
        platformShard: identity.member.platformShard,
        isActive: identity.member.isActive,
      })),
    },
  })
}

export async function PATCH(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => null)) as unknown
    const validated = UpdateProfileSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const updateData: {
      email?: string
      displayName?: string | null
      avatarUrl?: string | null
    } = {}

    if (validated.data.email !== undefined) {
      updateData.email = normalizeEmail(validated.data.email)
    }

    if (validated.data.displayName !== undefined) {
      updateData.displayName = sanitizeOptionalText(validated.data.displayName)
    }

    if (validated.data.avatarUrl !== undefined) {
      updateData.avatarUrl = sanitizeOptionalText(validated.data.avatarUrl)
    }

    const updated = await prisma.userAccount.update({
      where: { id: session.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
    })

    return NextResponse.json({
      success: true,
      profile: updated,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Profile update error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
