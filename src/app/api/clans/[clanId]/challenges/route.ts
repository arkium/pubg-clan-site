import { NextRequest, NextResponse } from 'next/server'

import {
  createChallenge,
  type CreateChallengeInput,
} from '@/lib/challenge-service'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseStatus(value: string | null) {
  if (value === 'active') return 'active'
  if (value === 'ended') return 'ended'
  if (value === 'pending') return 'pending'
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const status = parseStatus(request.nextUrl.searchParams.get('status'))

    const challenges = await prisma.challenge.findMany({
      where: {
        clanId: parsedClanId,
        ...(status ? { status } : {}),
      },
      include: {
        participants: {
          orderBy: { progress: 'desc' },
          take: 3,
          include: { member: { select: { id: true, displayName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ challenges })
  } catch (error) {
    console.error('Error fetching challenges:', error)
    return NextResponse.json({ error: 'Failed to fetch challenges' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('edit_clan')(request, {
      clanId: parsedClanId,
    })
    if (permissionError) {
      return permissionError
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const body = (await request.json()) as CreateChallengeInput

    if (!body.title || !body.type || !body.duration) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const challenge = await createChallenge(parsedClanId, body)

    return NextResponse.json({ challenge }, { status: 201 })
  } catch (error) {
    console.error('Error creating challenge:', error)
    return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 })
  }
}
