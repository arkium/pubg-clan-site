import { getSessionFromRequest } from '@/lib/auth-session'
import { ZoneReadingSeriesError, submitZoneReadingGuess } from '@/lib/zone-reading/zone-reading-service'

/**
 * Une étape d'une série enregistrée (docs/features/lecture-de-zone.md) : `{ round, step, x, y }` →
 * `ZoneReadingGuessResult` — le cercle suivant, ou la révélation de la partie (et le bilan après la dixième). Les
 * écarts sont calculés par le serveur, à partir de la géométrie gardée avec la série.
 */
export async function POST(request: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params

  try {
    const session = await getSessionFromRequest(request)
    if (!session?.activeMemberId) {
      return Response.json({ error: 'Connecte-toi avec un membre actif pour enregistrer une série.' }, { status: 401 })
    }
    if (!seriesId || seriesId.length > 64) return Response.json({ error: 'Identifiant de série invalide.' }, { status: 400 })

    const body = (await request.json().catch(() => null)) as unknown
    if (!body || typeof body !== 'object') return Response.json({ error: 'Requête invalide.' }, { status: 400 })

    return Response.json(await submitZoneReadingGuess(session, seriesId, body))
  } catch (error) {
    if (error instanceof ZoneReadingSeriesError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[zone-reading/series/guess] Étape impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
