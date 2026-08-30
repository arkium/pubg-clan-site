import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import {
  getTournamentForClan,
  updateTournament,
  type TournamentUpdateInput,
} from '@/lib/tournament-service'
import { requireNavPermission, requirePermission } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseTournamentPayload(body: unknown): TournamentUpdateInput {
  const value = (body ?? {}) as Record<string, unknown>

  const nextRules = value.rules && typeof value.rules === 'object'
    ? {
        placementPoints:
          'placementPoints' in (value.rules as Record<string, unknown>)
            ? ((value.rules as { placementPoints?: Record<string, number> }).placementPoints ?? null)
            : null,
        killPoints: (value.rules as { killPoints?: number | string | null }).killPoints ?? 0,
        winBonus: (value.rules as { winBonus?: number | string | null }).winBonus ?? 0,
        bestOfRounds: (value.rules as { bestOfRounds?: number | null }).bestOfRounds ?? null,
      }
    : undefined

  return {
    title: typeof value.title === 'string' ? value.title : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    startDate: typeof value.startDate === 'string' ? value.startDate : undefined,
    endDate: typeof value.endDate === 'string' ? value.endDate : undefined,
    gameMode: typeof value.gameMode === 'string' || value.gameMode === null ? value.gameMode : undefined,
    mapName: typeof value.mapName === 'string' || value.mapName === null ? value.mapName : undefined,
    status: value.status === 'draft' || value.status === 'active' || value.status === 'finished'
      ? value.status
      : undefined,
    rules: nextRules,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  try {
    const { clanId, tournamentId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requireNavPermission('clan.overview')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const tournament = await getTournamentForClan(parsedClanId, tournamentId)
    return NextResponse.json({ tournament })
  } catch (error) {
    console.error('Error fetching tournament:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tournament' },
      { status: 404 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  try {
    const { clanId, tournamentId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_settings')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const body = await request.json().catch(() => null)
    const payload = parseTournamentPayload(body)

    const tournament = await updateTournament(parsedClanId, tournamentId, payload)
    return NextResponse.json({ tournament })
  } catch (error) {
    console.error('Error updating tournament:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update tournament' },
      { status: 400 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  try {
    const { clanId, tournamentId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_settings')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, organizerClanId: true },
    })

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    if (tournament.organizerClanId !== parsedClanId) {
      return NextResponse.json({ error: 'Only organizer can delete this tournament' }, { status: 403 })
    }

    await prisma.tournament.delete({ where: { id: tournamentId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting tournament:', error)
    return NextResponse.json({ error: 'Failed to delete tournament' }, { status: 500 })
  }
}
