import { withAdminActionLog } from '@/lib/admin-action-log'
import { getSessionFromRequest } from '@/lib/auth-session'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { testCoachModel } from '@/lib/coach/coach-admin-service'
import { isCoachModelId } from '@/lib/coach/coach-models'

/**
 * Bouton « Tester » d'une tuile de modèle (docs/TODO/chatbot-ia.md §9) : une question minuscule avec un outil, facturée
 * au SuperUser. Répond 200 avec le résultat, réussi ou non (un échec du modèle est un résultat, pas une erreur HTTP) ;
 * journalisée, puisqu'elle coûte.
 */
async function handlePost(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const body = (await request.json().catch(() => null)) as { model?: unknown } | null
  if (!isCoachModelId(body?.model)) return Response.json({ error: 'Modèle inconnu du catalogue' }, { status: 400 })
  const session = await getSessionFromRequest(request)
  if (!session) return Response.json({ error: 'Session requise' }, { status: 401 })
  try {
    return Response.json(await testCoachModel({ modelId: body.model, userId: session.userId }))
  } catch (error) {
    console.error('Coach model test failed:', error)
    return Response.json({ error: 'Test impossible' }, { status: 500 })
  }
}

export const POST = withAdminActionLog('settings/coach/test-model', handlePost)
