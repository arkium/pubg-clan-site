import { getSessionFromRequest } from '@/lib/auth-session'
import { COACH_FEEDBACK_NOTE_MAX, setCoachMessageFeedback } from '@/lib/coach/coach-conversation-service'

/**
 * Vote sur une réponse du Coach IA (docs/TODO/chatbot-ia.md §7.1) : `{ score: 1 | -1 | null, note? }` — Utile,
 * Inexact (avec précision facultative, relue par le SuperUser), ou retrait du vote. Propriétaire du fil seulement ;
 * une réponse qui n'est pas à lui répond 404.
 */

function parseId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id)
  if (!id) return Response.json({ error: 'Invalid message id' }, { status: 400 })
  const session = await getSessionFromRequest(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { score?: unknown; note?: unknown } | null
  const score = body?.score
  if (score !== 1 && score !== -1 && score !== null) {
    return Response.json({ error: 'invalid_body', message: 'Vote attendu : 1, -1 ou null.' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : null
  if (note && note.length > COACH_FEEDBACK_NOTE_MAX) {
    return Response.json({ error: 'invalid_body', message: `La précision dépasse ${COACH_FEEDBACK_NOTE_MAX} caractères.` }, { status: 400 })
  }

  try {
    const saved = await setCoachMessageFeedback(id, session.userId, score, note || null)
    if (!saved) return Response.json({ error: 'message_not_found' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[coach/feedback] Vote impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
