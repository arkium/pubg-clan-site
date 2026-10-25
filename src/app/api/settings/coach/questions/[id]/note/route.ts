import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { updateCoachFeedbackNote } from '@/lib/coach/coach-admin-service'
import { COACH_FEEDBACK_NOTE_MAX } from '@/lib/coach/coach-conversation-service'

/**
 * Précision d'un vote « Inexact » (onglet Questions de /settings/coach, 2026-10-25) : PATCH `{ note }` la réécrit en
 * place (280 caractères au plus, vide = retirée). SuperUser seul, journalisé ; 404 si le message n'est pas un vote
 * « Inexact ».
 */
async function handlePatch(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const { id } = await params
  const messageId = Number(id)
  if (!Number.isInteger(messageId) || messageId <= 0) return Response.json({ error: 'Identifiant invalide' }, { status: 400 })
  const body = (await request.json().catch(() => null)) as { note?: unknown } | null
  if (!body || typeof body !== 'object' || (body.note !== null && typeof body.note !== 'string')) {
    return Response.json({ error: 'Précision attendue (texte ou null)' }, { status: 400 })
  }
  const note = typeof body.note === 'string' ? body.note.replace(/\s+/g, ' ').trim() : ''
  if (note.length > COACH_FEEDBACK_NOTE_MAX) return Response.json({ error: `La précision dépasse ${COACH_FEEDBACK_NOTE_MAX} caractères` }, { status: 400 })
  try {
    const updated = await updateCoachFeedbackNote(messageId, note || null)
    if (!updated) return Response.json({ error: 'Aucun vote « Inexact » pour ce message' }, { status: 404 })
    return Response.json({ ok: true, note: note || null })
  } catch (error) {
    console.error('Coach note PATCH failed:', error)
    return Response.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }
}

export const PATCH = withAdminActionLog('settings/coach/questions/[id]/note', handlePatch)
