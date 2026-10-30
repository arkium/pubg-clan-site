import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { deleteCoachConversationById } from '@/lib/coach/coach-admin-service'

/**
 * Supprime un fil du Coach IA depuis /settings/coach (2026-10-30) : un de ses essais (onglet Fils) ou le fil d'une
 * réponse relue (vote « Inexact », question difficile). Questions, réponses et votes partent ; le coût reste compté.
 * SuperUser seul, journalisé.
 */

type Context = { params: Promise<{ id: string }> }

function parseId(value: string): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function handleDelete(request: Request, { params }: Context) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const id = parseId((await params).id)
  if (!id) return Response.json({ error: 'Identifiant invalide' }, { status: 400 })
  try {
    const deleted = await deleteCoachConversationById(id)
    if (!deleted) return Response.json({ error: 'Fil introuvable' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('Coach conversation DELETE failed:', error)
    return Response.json({ error: 'Suppression impossible' }, { status: 500 })
  }
}

export const DELETE = withAdminActionLog('settings/coach/conversations/[id]', handleDelete)
