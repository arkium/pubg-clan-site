import { getSessionFromRequest } from '@/lib/auth-session'
import {
  COACH_CONVERSATION_TITLE_MAX,
  deleteCoachConversation,
  getCoachConversation,
  renameCoachConversation,
} from '@/lib/coach/coach-conversation-service'

/**
 * Un fil du Coach IA (docs/TODO/chatbot-ia.md §7.1) : lecture (propriétaire ou SuperUser), renommage et suppression
 * (propriétaire seul). Un fil qui n'est pas au compte répond 404, pas 403 : son existence n'est pas révélée.
 */

function parseId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Context) {
  const id = parseId((await params).id)
  if (!id) return Response.json({ error: 'Invalid conversation id' }, { status: 400 })
  const session = await getSessionFromRequest(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const conversation = await getCoachConversation(id, { userId: session.userId, isSuperUser: session.isSuperUser })
    if (!conversation) return Response.json({ error: 'conversation_not_found' }, { status: 404 })
    return Response.json(conversation, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[coach/conversations] Lecture impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const id = parseId((await params).id)
  if (!id) return Response.json({ error: 'Invalid conversation id' }, { status: 400 })
  const session = await getSessionFromRequest(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { title?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return Response.json({ error: 'invalid_body', message: 'Donne un titre au fil.' }, { status: 400 })
  if (title.length > COACH_CONVERSATION_TITLE_MAX) {
    return Response.json({ error: 'invalid_body', message: `Le titre dépasse ${COACH_CONVERSATION_TITLE_MAX} caractères.` }, { status: 400 })
  }
  try {
    const renamed = await renameCoachConversation(id, session.userId, title)
    if (!renamed) return Response.json({ error: 'conversation_not_found' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[coach/conversations] Renommage impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const id = parseId((await params).id)
  if (!id) return Response.json({ error: 'Invalid conversation id' }, { status: 400 })
  const session = await getSessionFromRequest(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const deleted = await deleteCoachConversation(id, session.userId)
    if (!deleted) return Response.json({ error: 'conversation_not_found' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[coach/conversations] Suppression impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
