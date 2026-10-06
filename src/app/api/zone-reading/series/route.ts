import { getSessionFromRequest } from '@/lib/auth-session'
import { ROLLING_PERIODS, parsePeriod } from '@/lib/period'
import { parseZoneReadingMode } from '@/lib/zone-reading/zone-reading-api'
import { ZoneReadingSeriesError, startZoneReadingSeries } from '@/lib/zone-reading/zone-reading-service'

/**
 * Départ d'une série « Où finit la zone ? » (docs/features/lecture-de-zone.md) : `{ map, mode, period, clanId }` →
 * `ZoneReadingSeriesStart`. Ouvert à tous : un membre connecté obtient une série enregistrée (201) dont les cercles
 * se dévoilent étape par étape ; un visiteur reçoit les dix parties complètes, sans écriture (200).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { map?: unknown; mode?: unknown; period?: unknown; clanId?: unknown } | null
  const mapName = typeof body?.map === 'string' ? body.map.trim() : ''
  if (!mapName || mapName.length > 64) return Response.json({ error: 'Carte inconnue.' }, { status: 400 })
  const clanId = Number(body?.clanId)

  try {
    const session = await getSessionFromRequest(request)
    const start = await startZoneReadingSeries(session, {
      mapName,
      mode: parseZoneReadingMode(body?.mode),
      period: parsePeriod(typeof body?.period === 'string' ? body.period : null, ROLLING_PERIODS, 'all'),
      clanId: Number.isInteger(clanId) && clanId > 0 ? clanId : null,
    })
    return Response.json(start, { status: start.recorded ? 201 : 200 })
  } catch (error) {
    if (error instanceof ZoneReadingSeriesError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[zone-reading/series] Départ de série impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
