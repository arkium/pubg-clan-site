import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/clan-league'
import { getSessionFromRequest } from '@/lib/auth-session'
import { LEAGUE_SETTINGS_BOUNDS, validateLeagueSettings } from '@/lib/league-settings'
import { getLeagueSettingsState, saveLeagueSettings } from '@/lib/league-settings-service'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * Réglages de la Ligue Inter-Clans (page SuperUser /settings/league, docs/features/ligue-clans.md §5) — SuperUser
 * seulement. GET : réglages en vigueur, valeurs par défaut et bornes. PUT `{ settings }` : validation stricte, puis
 * enregistrement dans `AppConfig` ; la ligue publique est recalculée au prochain appel (réglages dans sa clé de cache).
 */

export async function GET(request: Request) {
  const forbidden = await requireSuperUser(request)
  if (forbidden) return forbidden
  try {
    const state = await getLeagueSettingsState()
    return Response.json({ ...state, defaults: DEFAULT_LEAGUE_SETTINGS, bounds: LEAGUE_SETTINGS_BOUNDS })
  } catch (error) {
    console.error('League settings GET failed:', error)
    return Response.json({ error: 'Lecture des réglages impossible' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const forbidden = await requireSuperUser(request)
  if (forbidden) return forbidden
  const body = (await request.json().catch(() => null)) as { settings?: unknown } | null
  const validated = validateLeagueSettings(body?.settings)
  if (!validated.ok) {
    return Response.json({ error: 'Réglages invalides', errors: validated.errors }, { status: 400 })
  }
  try {
    const session = await getSessionFromRequest(request)
    const state = await saveLeagueSettings(validated.settings, session?.email ?? null)
    return Response.json({ ...state, defaults: DEFAULT_LEAGUE_SETTINGS, bounds: LEAGUE_SETTINGS_BOUNDS })
  } catch (error) {
    console.error('League settings PUT failed:', error)
    return Response.json({ error: 'Enregistrement des réglages impossible' }, { status: 500 })
  }
}
