import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { getSessionFromRequest } from '@/lib/auth-session'
import { deleteCoachConversationsOf, listCoachOwnConversations } from '@/lib/coach/coach-admin-service'

/**
 * Onglet Fils de /settings/coach (2026-10-30) : les fils du SuperUser connecté — ses essais —, jamais ceux des membres
 * (/confidentialite : seules les réponses relues sont lues par le SuperUser). GET les liste, DELETE les supprime tous
 * (« Supprimer mes fils de test ») ; le coût dépensé reste compté (`CoachUsage`).
 */

async function sessionUserId(request: Request): Promise<number | Response> {
  const session = await getSessionFromRequest(request)
  if (!session) return Response.json({ error: 'Session requise' }, { status: 401 })
  return session.userId
}

export async function GET(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const userId = await sessionUserId(request)
  if (userId instanceof Response) return userId
  try {
    return Response.json({ conversations: await listCoachOwnConversations(userId) })
  } catch (error) {
    console.error('Coach conversations GET failed:', error)
    return Response.json({ error: 'Lecture des fils impossible' }, { status: 500 })
  }
}

async function handleDelete(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const userId = await sessionUserId(request)
  if (userId instanceof Response) return userId
  try {
    return Response.json({ deleted: await deleteCoachConversationsOf(userId) })
  } catch (error) {
    console.error('Coach conversations DELETE failed:', error)
    return Response.json({ error: 'Suppression impossible' }, { status: 500 })
  }
}

export const DELETE = withAdminActionLog('settings/coach/conversations', handleDelete)
