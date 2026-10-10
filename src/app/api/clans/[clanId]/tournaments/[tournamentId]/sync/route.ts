import { withAdminActionLog } from '@/lib/admin-action-log'
import { getInternalApiBaseUrl, getInternalCronAuthHeaders } from '@/lib/internal-api'
import {
  getTournamentForClan,
  getTournamentMatches,
  materializeTournamentCustomMatches,
} from '@/lib/tournament-service'
import { enqueueTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
import { requireClanFeature } from '@/lib/auth/admin-guards'
import { prisma } from '@/lib/prisma'
import { getActorMemberId } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type MatchSyncResult = {
  clanId: number
  importedMatches: number
  error?: string
}

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  try {
    const { clanId, tournamentId } = await params
    const organizerClanId = parseClanId(clanId)

    if (!organizerClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requireClanFeature(request, organizerClanId, 'clan-competition')
    if (permissionError) return permissionError

    const tournament = await getTournamentForClan(organizerClanId, tournamentId)
    if (tournament.organizerClanId !== organizerClanId) {
      return Response.json({ error: 'Only the organizer can synchronize this tournament' }, { status: 403 })
    }

    const headers = {
      'content-type': 'application/json',
      ...getInternalCronAuthHeaders(),
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie')! } : {}),
    }
    const actorMemberId = await getActorMemberId(request)
    // La synchronisation part des propres parties PUBG du joueur actif (`sync-matches` avec son `memberId`) : hors du
    // clan organisateur, elle échouerait plus loin avec un message PUBG incompréhensible. 403, pas 401 : la session est
    // valide, le client ne doit pas déconnecter.
    const actor = actorMemberId
      ? await prisma.clanMember.findUnique({ where: { id: actorMemberId }, select: { clanId: true, isActive: true } })
      : null
    if (!actor || !actor.isActive || actor.clanId !== organizerClanId) {
      return Response.json(
        {
          error:
            'Seul un joueur du clan organisateur peut synchroniser : la synchronisation part de ses propres parties PUBG. Passez sur votre joueur de ce clan, ou demandez à l’Owner qui a joué la manche de cliquer.',
        },
        { status: 403 }
      )
    }

    // Manches déjà au classement : la réponse dit combien ce clic en a ajouté.
    const roundsBefore = (await getTournamentMatches(tournamentId)).length

    const matchSyncs: MatchSyncResult[] = []
    for (const participantClanId of [organizerClanId]) {
      const response = await fetch(`${getInternalApiBaseUrl()}/api/clans/${participantClanId}/sync-matches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ memberId: actorMemberId }),
      })
      const payload = (await response.json().catch(() => null)) as {
        importedMatches?: number
        importedCount?: number
        error?: string
      } | null

      matchSyncs.push({
        clanId: participantClanId,
        importedMatches: payload?.importedMatches ?? payload?.importedCount ?? 0,
        ...(response.ok ? {} : { error: payload?.error ?? 'Match synchronization failed' }),
      })
    }

    const syncErrors = matchSyncs.filter((result) => result.error)
    if (syncErrors.length > 0) {
      return Response.json(
        { error: `La récupération PUBG a échoué : ${syncErrors.map((result) => `clan ${result.clanId}: ${result.error}`).join('; ')}` },
        { status: 502 }
      )
    }

    const materialization = await materializeTournamentCustomMatches(tournamentId)
    const matches = await getTournamentMatches(tournamentId)
    const telemetry = []

    const enqueue = await enqueueTelemetryForSelectedSquadMatches(
      organizerClanId,
      matches.map((match) => match.id),
      actorMemberId
    )
    telemetry.push({ clanId: organizerClanId, ...enqueue })

    const importedMatches = matchSyncs.reduce((total, item) => total + item.importedMatches, 0)
    const telemetryQueued = telemetry.reduce((total, item) => total + item.queuedCount, 0)

    return Response.json({
      ok: true,
      tournamentId,
      importedMatches,
      materializedMatches: materialization.materializedCount,
      sourceCustomRows: materialization.sourceRowCount,
      sourceCustomMatches: materialization.sourceMatchCount,
      materializationErrors: materialization.errors.slice(0, 3),
      eligibleMatches: matches.length,
      newRounds: Math.max(0, matches.length - roundsBefore),
      telemetryQueued,
      matchSyncs,
      telemetry,
      message: `Synchronisation terminée : ${importedMatches} match(s) importé(s), ${materialization.materializedCount} match(s) projeté(s), ${telemetryQueued} télémétrie(s) en file. Les agrégats seront recalculés par le worker après chaque import.`,
    })
  } catch (error) {
    console.error('Tournament manual sync failed:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to synchronize tournament' },
      { status: 500 }
    )
  }
}

export const POST = withAdminActionLog('clans/[clanId]/tournaments/[tournamentId]/sync', handlePost)
