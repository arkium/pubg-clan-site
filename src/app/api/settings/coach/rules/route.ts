import { withAdminActionLog } from '@/lib/admin-action-log'
import { getSessionFromRequest } from '@/lib/auth-session'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { getCoachSettings } from '@/lib/coach/coach-config'
import { createCoachRule, readCoachRulesReport } from '@/lib/coach/coach-rules-service'

/**
 * Règles apprises du Coach IA (docs/TODO/coach-ia-pistes.md §6.3, lot 10 — section de /settings/coach/questions).
 * GET : toutes les règles, nombre d'actives sur 20, tokens du bloc. POST `{ text, fromMessageId? }` : nouvelle règle
 * écrite à la main par le SuperUser (jamais la note d'un joueur, jamais une phrase du modèle) ; 409 au-delà de 20
 * actives. Journalisée : une règle entre dans le prompt de tous les membres.
 */

export async function GET(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  try {
    return Response.json(await readCoachRulesReport(await getCoachSettings()))
  } catch (error) {
    console.error('Coach rules GET failed:', error)
    return Response.json({ error: 'Lecture des règles impossible' }, { status: 500 })
  }
}

async function handlePost(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const body = (await request.json().catch(() => null)) as { text?: unknown; fromMessageId?: unknown } | null
  if (!body || typeof body !== 'object') return Response.json({ error: 'Corps JSON attendu' }, { status: 400 })
  const fromMessageId = Number.isInteger(body.fromMessageId) && (body.fromMessageId as number) > 0 ? (body.fromMessageId as number) : null
  const session = await getSessionFromRequest(request)
  try {
    const result = await createCoachRule({ text: body.text, fromMessageId, createdById: session?.userId ?? null })
    if ('error' in result) return Response.json({ error: result.message }, { status: result.error === 'limit' ? 409 : 400 })
    return Response.json({ rule: result.rule }, { status: 201 })
  } catch (error) {
    console.error('Coach rules POST failed:', error)
    return Response.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }
}

export const POST = withAdminActionLog('settings/coach/rules', handlePost)
