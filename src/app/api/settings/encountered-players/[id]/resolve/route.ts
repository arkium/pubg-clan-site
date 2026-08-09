import { getSessionFromRequest } from '@/lib/auth-session'
import {
  ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
} from '@/lib/encountered-player-resolution-constants'
import { resolveOneEncounteredPlayerCandidate } from '@/lib/encountered-player-resolution'
import { deriveEncounteredPlayerStatus } from '@/lib/encountered-player-status'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

// Verrou en mémoire par identité (pubgAccountId+platformShard), même style que
// globalForCron.encounteredPlayerResolutionInProgress — un seul process web,
// pas de scaling horizontal dans ce déploiement (cf. cron-jobs.ts).
const globalForManualResolve = globalThis as typeof globalThis & {
  encounteredPlayerManualResolveInFlight?: Set<string>
  encounteredPlayerManualResolveLastAttempt?: Map<string, number>
  encounteredPlayerManualResolveUserAttempts?: Map<number, number[]>
}

globalForManualResolve.encounteredPlayerManualResolveInFlight ??= new Set()
globalForManualResolve.encounteredPlayerManualResolveLastAttempt ??= new Map()
globalForManualResolve.encounteredPlayerManualResolveUserAttempts ??= new Map()

const COOLDOWN_MS = 60_000
const USER_RATE_WINDOW_MS = 10 * 60 * 1000
const USER_RATE_MAX_ATTEMPTS = 20

function identityKey(pubgAccountId: string, platformShard: string) {
  return `${platformShard}:${pubgAccountId}`
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const url = new URL(request.url)
  const forceRetry = url.searchParams.get('force') === 'retry'

  const candidate = await prisma.encounteredPlayer.findUnique({ where: { id } })
  if (!candidate) {
    return Response.json({ error: 'Joueur introuvable' }, { status: 404 })
  }

  const thresholds = {
    minEncounters: ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
    maxAttempts: ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  }
  const status = deriveEncounteredPlayerStatus(candidate, thresholds)

  const isAlreadyResolved = status === 'resolved_with_clan' || status === 'resolved_without_clan'
  if (isAlreadyResolved) {
    return Response.json({ error: 'Ce joueur est déjà résolu' }, { status: 400 })
  }

  if (status === 'failed' && !forceRetry) {
    return Response.json(
      { error: 'Échec définitif — utiliser "Réessayer" pour relancer une résolution' },
      { status: 400 }
    )
  }

  const key = identityKey(candidate.pubgAccountId, candidate.platformShard)
  const inFlight = globalForManualResolve.encounteredPlayerManualResolveInFlight!
  const lastAttempt = globalForManualResolve.encounteredPlayerManualResolveLastAttempt!
  const userAttempts = globalForManualResolve.encounteredPlayerManualResolveUserAttempts!

  if (inFlight.has(key)) {
    return Response.json({ error: 'Une résolution est déjà en cours pour ce joueur' }, { status: 409 })
  }

  const now = Date.now()
  const last = lastAttempt.get(key)
  if (last !== undefined && now - last < COOLDOWN_MS) {
    return Response.json(
      { error: `Merci de patienter avant de réessayer (${Math.ceil((COOLDOWN_MS - (now - last)) / 1000)}s)` },
      { status: 429 }
    )
  }

  const recentUserAttempts = (userAttempts.get(session.userId) ?? []).filter(
    (timestamp) => now - timestamp < USER_RATE_WINDOW_MS
  )
  if (recentUserAttempts.length >= USER_RATE_MAX_ATTEMPTS) {
    return Response.json(
      { error: 'Trop de résolutions manuelles récentes — merci de patienter quelques minutes' },
      { status: 429 }
    )
  }

  inFlight.add(key)
  lastAttempt.set(key, now)
  userAttempts.set(session.userId, [...recentUserAttempts, now])

  const run = await prisma.encounteredPlayerResolutionRun.create({
    data: {
      source: 'manual',
      status: 'running',
      candidatesSelected: 1,
      triggeredByUserId: session.userId,
    },
  })

  try {
    if (forceRetry) {
      await prisma.encounteredPlayer.updateMany({
        where: { pubgAccountId: candidate.pubgAccountId, platformShard: candidate.platformShard },
        data: { resolveAttempts: 0 },
      })
    }

    const result = await resolveOneEncounteredPlayerCandidate(candidate, { source: 'manual' })
    const finishedAt = new Date()

    await prisma.encounteredPlayerResolutionRun.update({
      where: { id: run.id },
      data: {
        status: result.outcome === 'failed' ? 'failed' : 'success',
        finishedAt,
        durationMs: finishedAt.getTime() - run.startedAt.getTime(),
        uniqueCandidatesSelected: 1,
        resolvedFromCache: result.outcome === 'cache_hit' ? 1 : 0,
        pubgApiCalls: result.outcome === 'cache_hit' ? 0 : 1,
        resolvedWithClan: result.outcome === 'resolved_with_clan' ? 1 : 0,
        resolvedWithoutClan: result.outcome === 'resolved_without_clan' ? 1 : 0,
        failed: result.outcome === 'failed' ? 1 : 0,
        encounterRowsUpdated: result.updatedRowCount,
        crossClanCandidatesSelected: result.updatedRowCount > 1 ? 1 : 0,
        rowsResolvedPerApiCall: result.outcome === 'cache_hit' ? null : result.updatedRowCount,
        // Pas de détail technique renvoyé au client — message générique côté
        // réponse, mais conservé ici pour l'audit interne.
        errorMessage:
          result.outcome === 'failed'
            ? result.error instanceof Error
              ? result.error.message
              : String(result.error)
            : null,
      },
    })

    if (result.outcome === 'failed') {
      return Response.json({ data: { outcome: 'failed' } })
    }

    if (result.outcome === 'cache_hit') {
      return Response.json({
        data: {
          outcome: result.pubgClanTag ? 'resolved_with_clan' : 'resolved_without_clan',
          viaCache: true,
          clanTag: result.pubgClanTag,
          clanName: result.pubgClanName,
        },
      })
    }

    return Response.json({
      data: {
        outcome: result.outcome,
        viaCache: false,
        clanTag: result.outcome === 'resolved_with_clan' ? result.pubgClanTag : null,
        clanName: result.outcome === 'resolved_with_clan' ? result.pubgClanName : null,
      },
    })
  } finally {
    inFlight.delete(key)
  }
}
