import { z } from 'zod'

import {
  broadcastTournamentRound,
  DiscordTournamentError,
  listTournamentRounds,
  prepareTournamentRoundBroadcast,
} from '@/lib/discord/discord-tournament-service'
import { requirePermission } from '@/middleware/auth-permission'

const BroadcastSchema = z.object({
  matchId: z.string().trim().min(1).max(191),
})

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof DiscordTournamentError) {
    return Response.json({ error: error.message }, { status: error.status })
  }

  console.error(`[discord] ${fallback}:`, error)
  return Response.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  const { clanId: clanIdParam, tournamentId } = await params
  const clanId = parseClanId(clanIdParam)

  if (!clanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const permissionError = await requirePermission('manage_settings')(request, { clanId })
  if (permissionError) return permissionError

  const matchId = new URL(request.url).searchParams.get('matchId')

  try {
    if (!matchId) {
      return Response.json({ rounds: await listTournamentRounds(clanId, tournamentId) })
    }

    const prepared = await prepareTournamentRoundBroadcast(clanId, tournamentId, matchId)

    return Response.json({
      preview: prepared.payload,
      roundNumber: prepared.roundNumber,
      totalRounds: prepared.totalRounds,
      usesTournamentOverride: prepared.usesTournamentOverride,
      alreadySentAt: prepared.alreadySentAt,
    })
  } catch (error) {
    return toErrorResponse(error, 'Prévisualisation de la manche impossible')
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  const { clanId: clanIdParam, tournamentId } = await params
  const clanId = parseClanId(clanIdParam)

  if (!clanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const permissionError = await requirePermission('manage_settings')(request, { clanId })
  if (permissionError) return permissionError

  const body = (await request.json().catch(() => null)) as unknown
  const validated = BroadcastSchema.safeParse(body)

  if (!validated.success) {
    return Response.json({ error: 'Identifiant de manche manquant' }, { status: 400 })
  }

  try {
    const result = await broadcastTournamentRound(clanId, tournamentId, validated.data.matchId)

    return Response.json({
      success: true,
      message: `Manche #${result.roundNumber} publiée sur Discord.`,
    })
  } catch (error) {
    return toErrorResponse(error, 'Diffusion de la manche impossible')
  }
}
