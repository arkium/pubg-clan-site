import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { markCoachMessageReviewed } from '@/lib/coach/coach-admin-service'

/** Bouton « Relu » d'un vote « Inexact » (docs/TODO/chatbot-ia.md §9) : la réponse sort de la file à relire. */
async function handlePost(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const { id } = await params
  const messageId = Number(id)
  if (!Number.isInteger(messageId) || messageId <= 0) return Response.json({ error: 'Identifiant invalide' }, { status: 400 })
  try {
    const reviewed = await markCoachMessageReviewed(messageId)
    if (!reviewed) return Response.json({ error: 'Aucun vote « Inexact » à relire pour ce message' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('Coach review POST failed:', error)
    return Response.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }
}

export const POST = withAdminActionLog('settings/coach/questions/[id]/reviewed', handlePost)
