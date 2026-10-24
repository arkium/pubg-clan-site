import { getSessionFromRequest, getSessionTokenFromRequest } from '@/lib/auth-session'
import { listCoachConversations } from '@/lib/coach/coach-conversation-service'

/**
 * Fils du Coach IA du compte connecté (docs/TODO/chatbot-ia.md §7.1), du plus récent au plus ancien. Données
 * personnelles : jamais ceux d'un autre compte, même du même clan. Visiteur sans cookie : `{ authenticated: false }`
 * en 200 ; jeton périmé : 401 (comme /api/auth/session).
 */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ authenticated: false, conversations: [] }, { status: getSessionTokenFromRequest(request) ? 401 : 200 })
  }
  try {
    const conversations = await listCoachConversations(session.userId)
    return Response.json({ authenticated: true, conversations }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[coach/conversations] Lecture impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
