import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { getCoachAdminState } from '@/lib/coach/coach-admin-service'
import { sanitizeCoachSettingsPatch, setCoachSettings, type CoachSettingsPatch } from '@/lib/coach/coach-config'

/**
 * Réglages du Coach IA (page SuperUser /settings/coach, docs/TODO/chatbot-ia.md §9). GET : réglages en vigueur,
 * présence de la clé (jamais sa valeur), valeurs par défaut et bornes. PUT `{ settings }` : patch partiel, nettoyé par
 * `sanitizeCoachSettingsPatch` (nombres bornés, modèle vérifié au catalogue) ; un modèle inconnu est refusé.
 */

export async function GET(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  try {
    return Response.json(await getCoachAdminState())
  } catch (error) {
    console.error('Coach settings GET failed:', error)
    return Response.json({ error: 'Lecture des réglages impossible' }, { status: 500 })
  }
}

async function handlePut(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  const body = (await request.json().catch(() => null)) as { settings?: CoachSettingsPatch } | null
  if (!body?.settings || typeof body.settings !== 'object') {
    return Response.json({ error: 'Réglages manquants' }, { status: 400 })
  }
  const { accepted, errors } = sanitizeCoachSettingsPatch(body.settings)
  if (errors.length > 0) return Response.json({ error: 'Réglages invalides', errors }, { status: 400 })
  if (Object.keys(accepted).length === 0) return Response.json({ error: 'Aucun réglage reconnu' }, { status: 400 })
  try {
    await setCoachSettings(accepted)
    return Response.json(await getCoachAdminState())
  } catch (error) {
    console.error('Coach settings PUT failed:', error)
    return Response.json({ error: 'Enregistrement des réglages impossible' }, { status: 500 })
  }
}

export const PUT = withAdminActionLog('settings/coach', handlePut)
