import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { deleteCoachRule, updateCoachRule } from '@/lib/coach/coach-rules-service'

/**
 * Une règle apprise du Coach IA (lot 10) : PATCH `{ text?, enabled? }` (réactiver au-delà de 20 actives répond 409),
 * DELETE. SuperUser seul, journalisé.
 */

type Context = { params: Promise<{ id: string }> }

function parseId(value: string): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function handlePatch(request: Request, { params }: Context) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const id = parseId((await params).id)
  if (!id) return Response.json({ error: 'Identifiant invalide' }, { status: 400 })
  const body = (await request.json().catch(() => null)) as { text?: unknown; enabled?: unknown } | null
  if (!body || typeof body !== 'object') return Response.json({ error: 'Corps JSON attendu' }, { status: 400 })
  try {
    const result = await updateCoachRule(id, { text: body.text, enabled: body.enabled })
    if ('error' in result) {
      const status = result.error === 'limit' ? 409 : result.error === 'not_found' ? 404 : 400
      return Response.json({ error: result.message }, { status })
    }
    return Response.json({ rule: result.rule })
  } catch (error) {
    console.error('Coach rule PATCH failed:', error)
    return Response.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }
}

async function handleDelete(request: Request, { params }: Context) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const id = parseId((await params).id)
  if (!id) return Response.json({ error: 'Identifiant invalide' }, { status: 400 })
  try {
    const deleted = await deleteCoachRule(id)
    if (!deleted) return Response.json({ error: 'Règle introuvable' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('Coach rule DELETE failed:', error)
    return Response.json({ error: 'Suppression impossible' }, { status: 500 })
  }
}

export const PATCH = withAdminActionLog('settings/coach/rules/[id]', handlePatch)
export const DELETE = withAdminActionLog('settings/coach/rules/[id]', handleDelete)
