import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { readCoachToolsReport } from '@/lib/coach/coach-admin-service'

/** Onglet Outils de /settings/coach (2026-10-30) : usage de chaque outil sur 30 jours, échecs, lacunes signalées. */
export async function GET(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  try {
    return Response.json(await readCoachToolsReport())
  } catch (error) {
    console.error('Coach tools GET failed:', error)
    return Response.json({ error: 'Lecture des outils impossible' }, { status: 500 })
  }
}
