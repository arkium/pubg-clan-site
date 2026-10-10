import { z } from 'zod'

import { withAdminActionLog } from '@/lib/admin-action-log'
import {
  broadcastTournamentRound,
  broadcastTournamentSquadStandings,
  DiscordTournamentError,
  listTournamentRounds,
  prepareTournamentRoundBroadcast,
  prepareTournamentSquadStandingsBroadcast,
} from '@/lib/discord/discord-tournament-service'
import { requireClanFeature } from '@/lib/auth/admin-guards'

// Une manche (`matchId`), ou le classement par escouade du tournoi (`view: 'squads'`, demande du 2026-10-11).
const BroadcastSchema = z.union([
  z.object({ matchId: z.string().trim().min(1).max(191) }),
  z.object({ view: z.literal('squads') }),
])

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

  const permissionError = await requireClanFeature(request, clanId, 'clan-competition')
  if (permissionError) return permissionError

  const searchParams = new URL(request.url).searchParams
  const matchId = searchParams.get('matchId')

  try {
    if (searchParams.get('view') === 'squads') {
      const prepared = await prepareTournamentSquadStandingsBroadcast(clanId, tournamentId)
      return Response.json({
        preview: prepared.payload,
        totalRounds: prepared.totalRounds,
        usesTournamentOverride: prepared.usesTournamentOverride,
        alreadySentAt: prepared.alreadySentAt,
      })
    }

    if (!matchId) {
      return Response.json(await listTournamentRounds(clanId, tournamentId))
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

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  const { clanId: clanIdParam, tournamentId } = await params
  const clanId = parseClanId(clanIdParam)

  if (!clanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const permissionError = await requireClanFeature(request, clanId, 'clan-competition')
  if (permissionError) return permissionError

  const body = (await request.json().catch(() => null)) as unknown
  const validated = BroadcastSchema.safeParse(body)

  if (!validated.success) {
    return Response.json({ error: 'Identifiant de manche manquant' }, { status: 400 })
  }

  try {
    if ('view' in validated.data) {
      await broadcastTournamentSquadStandings(clanId, tournamentId)
      return Response.json({ success: true, message: 'Classement par squad publié sur Discord.' })
    }

    const result = await broadcastTournamentRound(clanId, tournamentId, validated.data.matchId)

    return Response.json({
      success: true,
      message: `Manche #${result.roundNumber} publiée sur Discord.`,
    })
  } catch (error) {
    return toErrorResponse(error, 'Diffusion de la manche impossible')
  }
}

export const POST = withAdminActionLog('clans/[clanId]/tournaments/[tournamentId]/discord', handlePost)
