import { parseLeagueMatchType } from '@/lib/clan-league'
import { loadLeagueClans, loadLeagueRows } from '@/lib/clan-league-service'
import { leaguePreview, validateLeagueSettings } from '@/lib/league-settings'
import { getLeagueSettings } from '@/lib/league-settings-service'
import { getPeriodRange, type StandardPeriod } from '@/lib/period'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * Aperçu des réglages de la ligue (/settings/league) — SuperUser seulement, lecture seule. POST `{ settings, period,
 * matchType }` : le classement de la période avec les réglages en vigueur et avec le brouillon, sans rien enregistrer.
 */

function parsePeriod(value: unknown): StandardPeriod {
  return value === 'month' || value === 'all' ? value : 'week'
}

export async function POST(request: Request) {
  const forbidden = await requireSuperUser(request)
  if (forbidden) return forbidden
  const body = (await request.json().catch(() => null)) as { settings?: unknown; period?: unknown; matchType?: unknown } | null
  const validated = validateLeagueSettings(body?.settings)
  if (!validated.ok) {
    return Response.json({ error: 'Réglages invalides', errors: validated.errors }, { status: 400 })
  }
  try {
    const period = parsePeriod(body?.period)
    const matchType = parseLeagueMatchType(typeof body?.matchType === 'string' ? body.matchType : null)
    const range = getPeriodRange(period, new Date())
    const [current, clans, rows] = await Promise.all([getLeagueSettings(), loadLeagueClans(), loadLeagueRows(range?.start ?? null, matchType)])
    return Response.json({ period, matchType, ...leaguePreview(rows, clans, range?.start ?? null, matchType, period, current, validated.settings) })
  } catch (error) {
    console.error('League settings preview failed:', error)
    return Response.json({ error: 'Aperçu impossible' }, { status: 500 })
  }
}
