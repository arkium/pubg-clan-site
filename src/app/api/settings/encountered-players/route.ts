import type { EncounteredPlayerResolutionStatus } from '@/lib/encountered-player-status'
import { loadEncounteredPlayersTriage } from '@/lib/encountered-players-triage'
import { requireSuperUser } from '@/middleware/auth-permission'

const VALID_STATUSES: EncounteredPlayerResolutionStatus[] = [
  'below_threshold',
  'never_attempted',
  'retry_pending',
  'failed',
  'resolved_with_clan',
  'resolved_without_clan',
]

function parseStatuses(values: string[]): EncounteredPlayerResolutionStatus[] {
  return values.filter((value): value is EncounteredPlayerResolutionStatus =>
    VALID_STATUSES.includes(value as EncounteredPlayerResolutionStatus)
  )
}

function parsePage(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function parseMinAttempts(value: string | null) {
  const parsed = Number(value)
  return value !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

function parseClanId(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

// Une ligne par identité `Player` (fin d'EncounteredPlayer, étape 3) : voir src/lib/encountered-players-triage.ts.
export async function GET(request: Request) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const url = new URL(request.url)

  try {
    const result = await loadEncounteredPlayersTriage({
      statuses: parseStatuses(url.searchParams.getAll('status')),
      minAttempts: parseMinAttempts(url.searchParams.get('minAttempts')),
      clanId: parseClanId(url.searchParams.get('clanId')),
      q: (url.searchParams.get('q') ?? '').trim(),
      sortBy: url.searchParams.get('sortBy'),
      sortOrder: url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
      page: parsePage(url.searchParams.get('page')),
    })

    const payload = { ...result, players: result.rows }
    return Response.json({ ...payload, data: payload })
  } catch (error) {
    console.error('[Triage] Lecture des joueurs croisés impossible', error)
    return Response.json({ error: 'Lecture du triage impossible' }, { status: 500 })
  }
}
