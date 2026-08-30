import { getInternalApiBaseUrl, getInternalCronAuthHeaders } from '@/lib/internal-api'
import {
  getTournamentForClan,
  getTournamentMatches,
  materializeTournamentCustomMatches,
} from '@/lib/tournament-service'
import { enqueueTelemetryForSelectedSquadMatches } from '@/lib/pubg-telemetry/manual-sync'
import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type MatchSyncResult = {
  clanId: number
  importedMatches: number
  error?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string; tournamentId: string }> }
) {
  try {
    const { clanId, tournamentId } = await params
    const organizerClanId = parseClanId(clanId)

    if (!organizerClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_settings')(request, {
      clanId: organizerClanId,
    })
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
    if (!actorMemberId) {
      return Response.json({ error: 'Active administrator member is required to synchronize a tournament' }, { status: 401 })
    }

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
