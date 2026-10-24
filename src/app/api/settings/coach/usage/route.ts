import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { readCoachUsageReport } from '@/lib/coach/coach-admin-service'

/** Onglet Consommation de /settings/coach (docs/TODO/chatbot-ia.md §9) : le mois de Paris en cours. */
export async function GET(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  try {
    return Response.json(await readCoachUsageReport())
  } catch (error) {
    console.error('Coach usage GET failed:', error)
    return Response.json({ error: 'Lecture de la consommation impossible' }, { status: 500 })
  }
}
