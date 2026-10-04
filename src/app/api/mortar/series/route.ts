import { getSessionFromRequest } from '@/lib/auth-session'
import { parseMortarDifficulty } from '@/lib/mortar/mortar-game'
import { startMortarSeries } from '@/lib/mortar/mortar-service'

/**
 * Départ d'une série d'entraînement au mortier (docs/features/mortier.md) : `{ difficulty }` → `MortarSeriesStart`.
 * Ouvert à tous : un membre connecté obtient une série enregistrée (201), un visiteur une graine sans écriture (200).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { difficulty?: unknown } | null
  const difficulty = parseMortarDifficulty(body?.difficulty)
  if (!difficulty) return Response.json({ error: 'Difficulté inconnue (easy, medium ou hard).' }, { status: 400 })

  try {
    const session = await getSessionFromRequest(request)
    const start = await startMortarSeries(session, difficulty)
    return Response.json(start, { status: start.recorded ? 201 : 200 })
  } catch (error) {
    console.error('[mortar/series] Départ de série impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
