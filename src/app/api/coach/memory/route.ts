import { getSessionFromRequest, getSessionTokenFromRequest } from '@/lib/auth-session'
import { getCoachSettings } from '@/lib/coach/coach-config'
import { COACH_MEMORY_MAX, COACH_MEMORY_RETENTION_DAYS } from '@/lib/coach/coach-memory'
import { clearCoachMemories, listCoachMemories } from '@/lib/coach/coach-memory-service'

/**
 * « Ce que le Coach sait de toi » (docs/TODO/coach-ia-pistes.md §6.2, lot 11) : la mémoire personnelle du compte
 * connecté — jamais celle d'un autre compte, jamais lue par le SuperUser depuis l'administration. GET : les lignes
 * vivantes ; DELETE : « Tout oublier ». Visiteur sans cookie : `{ authenticated: false }` en 200 ; jeton périmé : 401.
 */

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ authenticated: false, memories: [] }, { status: getSessionTokenFromRequest(request) ? 401 : 200 })
  }
  try {
    const settings = await getCoachSettings()
    const memories = await listCoachMemories(session.userId)
    return Response.json(
      { authenticated: true, enabled: settings.memoryEnabled, memories, max: COACH_MEMORY_MAX, retentionDays: COACH_MEMORY_RETENTION_DAYS },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[coach/memory] Lecture impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const deleted = await clearCoachMemories(session.userId)
    return Response.json({ ok: true, deleted })
  } catch (error) {
    console.error('[coach/memory] Effacement impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
