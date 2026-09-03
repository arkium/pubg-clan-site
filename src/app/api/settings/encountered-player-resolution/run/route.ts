import { requireSuperUser } from '@/middleware/auth-permission'
import { getSessionFromRequest } from '@/lib/auth-session'
import {
  ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
} from '@/lib/encountered-player-resolution-constants'
import {
  selectPrioritizedEncounteredPlayerIdentities,
  resolveOneEncounteredPlayerCandidate,
} from '@/lib/encountered-player-resolution'
import { getEncounteredPlayerResolutionBatchSize } from '@/lib/encountered-player-resolution-config-service'
import { getLatestPubgRateLimitSnapshot } from '@/lib/pubg-api-call-log-service'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const session = await getSessionFromRequest(request)
  const t0 = Date.now()
  const startedAt = new Date()

  try {
    const body = (await request.json().catch(() => ({}))) as { batchSize?: number }
    const configuredBatchSize = await getEncounteredPlayerResolutionBatchSize()
    const batchSize = Math.min(Math.max(body.batchSize || configuredBatchSize || 20, 1), 50)

    const rateLimitBefore = await getLatestPubgRateLimitSnapshot().catch(() => null)

    const run = await prisma.encounteredPlayerResolutionRun.create({
      data: {
        source: 'manual',
        status: 'running',
        startedAt,
        triggeredByUserId: session?.userId ?? null,
        rateLimitRemainingBefore: rateLimitBefore?.remaining ?? null,
      },
    })

    const thresholds = {
      minEncounters: ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
      maxAttempts: ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
    }

    const candidates = await selectPrioritizedEncounteredPlayerIdentities(batchSize, thresholds)
    let candidatesSelected = candidates.reduce((sum, candidate) => sum + candidate.distinctClanCount, 0)
    let uniqueCandidatesSelected = candidates.length
    let crossClanCandidatesSelected = candidates.filter((candidate) => candidate.distinctClanCount > 1).length
    let resolvedFromCache = 0
    let resolvedWithClan = 0
    let resolvedWithoutClan = 0
    let failed = 0
    let encounterRowsUpdated = 0

    for (const candidate of candidates) {
      try {
        const result = await resolveOneEncounteredPlayerCandidate(candidate, { source: 'manual' })
        encounterRowsUpdated += result.updatedRowCount

        if (result.outcome === 'cache_hit') {
          resolvedFromCache += 1
        } else if (result.outcome === 'resolved_with_clan') {
          resolvedWithClan += 1
        } else if (result.outcome === 'resolved_without_clan') {
          resolvedWithoutClan += 1
        } else if (result.outcome === 'failed') {
          failed += 1
        }
      } catch {
        failed += 1
      }
    }

    const durationMs = Date.now() - t0
    const rateLimitAfter = await getLatestPubgRateLimitSnapshot().catch(() => null)
    const pubgApiCalls = resolvedWithClan + resolvedWithoutClan + failed
    const rowsResolvedPerApiCall =
      pubgApiCalls > 0 ? encounterRowsUpdated / pubgApiCalls : null

    const finishedRun = await prisma.encounteredPlayerResolutionRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        durationMs,
        candidatesSelected,
        uniqueCandidatesSelected,
        crossClanCandidatesSelected,
        resolvedFromCache,
        pubgApiCalls,
        resolvedWithClan,
        resolvedWithoutClan,
        failed,
        encounterRowsUpdated,
        rowsResolvedPerApiCall,
        rateLimitRemainingAfter: rateLimitAfter?.remaining ?? null,
      },
    })

    return Response.json({
      success: true,
      run: finishedRun,
      durationMs,
      summary: {
        uniqueCandidatesSelected,
        resolvedWithClan,
        resolvedWithoutClan,
        resolvedFromCache,
        failed,
        encounterRowsUpdated,
      },
    })
  } catch (err: any) {
    return Response.json(
      { error: err?.message || 'Erreur lors de l’exécution manuelle' },
      { status: 500 }
    )
  }
}
