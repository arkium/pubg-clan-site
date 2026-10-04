import { getSessionFromRequest } from '@/lib/auth-session'
import { MortarSeriesError, finishMortarSeries } from '@/lib/mortar/mortar-service'

/**
 * Fin d'une série enregistrée (docs/features/mortier.md) : `{ shots: [{ setting, timeMs }] × 10 }` →
 * `MortarSeriesFinish`. Le score est recalculé à partir de la graine gardée en base, jamais repris du client.
 */
export async function POST(request: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params

  try {
    const session = await getSessionFromRequest(request)
    if (!session?.activeMemberId) {
      return Response.json({ error: 'Connecte-toi avec un membre actif pour enregistrer une série.' }, { status: 401 })
    }
    if (!seriesId || seriesId.length > 64) return Response.json({ error: 'Identifiant de série invalide.' }, { status: 400 })

    const body = (await request.json().catch(() => null)) as { shots?: unknown } | null
    if (!body || typeof body !== 'object') return Response.json({ error: 'Requête invalide.' }, { status: 400 })

    const finish = await finishMortarSeries(session, seriesId, body.shots)
    return Response.json(finish)
  } catch (error) {
    if (error instanceof MortarSeriesError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[mortar/series/finish] Fin de série impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
