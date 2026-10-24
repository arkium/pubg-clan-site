import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { readCoachQuestionsReport } from '@/lib/coach/coach-admin-service'

/** Onglet Questions de /settings/coach (docs/TODO/chatbot-ia.md §9) : fréquences sur 30 jours, votes « Inexact » à relire. */
export async function GET(request: Request) {
  const forbidden = await requirePlatformAdmin(request)
  if (forbidden) return forbidden
  try {
    return Response.json(await readCoachQuestionsReport())
  } catch (error) {
    console.error('Coach questions GET failed:', error)
    return Response.json({ error: 'Lecture des questions impossible' }, { status: 500 })
  }
}
