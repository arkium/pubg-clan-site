import { getSessionFromRequest, getSessionTokenFromRequest } from '@/lib/auth-session'
import { getCoachSettings } from '@/lib/coach/coach-config'
import { checkCoachQuota, coachQuotaPayload } from '@/lib/coach/coach-quota'

/**
 * Quota du Coach IA pour le compte connecté (docs/TODO/chatbot-ia.md §7.1) : questions restantes de l'heure, part du
 * budget du mois, état du Coach, mémoire personnelle ouverte ou non (lot 11). Un visiteur sans cookie reçoit
 * `{ authenticated: false }` en 200 (rien à purger), un jeton périmé un 401 — comme /api/auth/session.
 */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ authenticated: false }, { status: getSessionTokenFromRequest(request) ? 401 : 200 })
  }

  try {
    const settings = await getCoachSettings()
    const decision = await checkCoachQuota({ userId: session.userId, isSuperUser: session.isSuperUser, settings })
    return Response.json(coachQuotaPayload(decision, { memoryEnabled: settings.memoryEnabled }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[coach/quota] Lecture impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
