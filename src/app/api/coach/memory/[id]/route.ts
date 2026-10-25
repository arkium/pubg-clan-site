import { getSessionFromRequest } from '@/lib/auth-session'
import { deleteCoachMemory } from '@/lib/coach/coach-memory-service'

/** Une ligne de « Ce que le Coach sait de toi » (lot 11) : effacée par son compte seul ; une ligne d'un autre compte répond 404. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'Invalid memory id' }, { status: 400 })
  const session = await getSessionFromRequest(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const deleted = await deleteCoachMemory(id, session.userId)
    if (!deleted) return Response.json({ error: 'memory_not_found' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[coach/memory] Effacement impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
