import { getCoachSettings } from '@/lib/coach/coach-config'
import { coachLimitsPayload } from '@/lib/coach/coach-help'

/**
 * Limites chiffrées du Coach IA pour l'aide (demande du 2026-10-25) : questions par heure, budget mensuel par compte,
 * longueur d'une question, délai, historique relu, bornes de la mémoire. Réglages du SuperUser, rien de personnel ni
 * de secret : route publique, cache de 5 minutes (comme le cache mémoire des réglages).
 */
export async function GET() {
  try {
    const settings = await getCoachSettings()
    return Response.json(coachLimitsPayload(settings), { headers: { 'Cache-Control': 'public, max-age=300' } })
  } catch (error) {
    console.error('[coach/limits] Lecture impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
