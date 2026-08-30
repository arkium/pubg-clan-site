import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import {
  createTournament,
  listClanTournaments,
  type TournamentCreateInput,
} from '@/lib/tournament-service'
import { requireNavPermission, requirePermission } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseTournamentPayload(body: unknown): TournamentCreateInput {
  const value = (body ?? {}) as Record<string, unknown>
  const rules = value.rules && typeof value.rules === 'object'
    ? value.rules as {
        placementPoints?: Record<string, number>
        killPoints?: number | string | null
        winBonus?: number | string | null
        bestOfRounds?: number | null
      }
    : null

  const legacyKillPoints = typeof value.killPoints === 'number' || typeof value.killPoints === 'string'
    ? value.killPoints
    : 0
  const legacyWinBonus = typeof value.winBonus === 'number' || typeof value.winBonus === 'string'
    ? value.winBonus
    : 0
  const legacyBestOfRounds = typeof value.bestOfRounds === 'number' ? value.bestOfRounds : null

  return {
    title: typeof value.title === 'string' ? value.title : '',
    description: typeof value.description === 'string' ? value.description : null,
    startDate: typeof value.startDate === 'string' ? value.startDate : new Date().toISOString(),
    endDate: typeof value.endDate === 'string' ? value.endDate : new Date().toISOString(),
    gameMode: typeof value.gameMode === 'string' ? value.gameMode : null,
    mapName: typeof value.mapName === 'string' ? value.mapName : null,
    status: value.status === 'draft' || value.status === 'active' || value.status === 'finished'
      ? value.status
      : 'draft',
    rules: {
      placementPoints: rules?.placementPoints ?? null,
      killPoints: rules?.killPoints ?? legacyKillPoints,
      winBonus: rules?.winBonus ?? legacyWinBonus,
      bestOfRounds: rules?.bestOfRounds ?? legacyBestOfRounds,
    },
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ clanId: string }> }) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_settings')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const clan = await prisma.clan.findUnique({ where: { id: parsedClanId }, select: { id: true } })
    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const tournaments = await listClanTournaments(parsedClanId)
    return NextResponse.json({ tournaments })
  } catch (error) {
    console.error('Error fetching tournaments:', error)
    return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ clanId: string }> }) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_settings')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const clan = await prisma.clan.findUnique({ where: { id: parsedClanId }, select: { id: true } })
    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const payload = parseTournamentPayload(body)

    if (!payload.title || !payload.title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    if (!payload.startDate || !payload.endDate) {
      return NextResponse.json({ error: 'Dates are required' }, { status: 400 })
    }

    const tournament = await createTournament(parsedClanId, payload)
    return NextResponse.json({ tournament }, { status: 201 })
  } catch (error) {
    console.error('Error creating tournament:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create tournament' },
      { status: 500 }
    )
  }
}
