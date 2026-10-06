import { ROLLING_PERIODS, parsePeriod } from '@/lib/period'
import { parseZoneReadingMode } from '@/lib/zone-reading/zone-reading-api'
import { loadZoneReadingAnalysis } from '@/lib/zone-reading/zone-reading-service'

/**
 * Lecture de zone, onglet Analyse (docs/features/lecture-de-zone.md) : `?map=&mode=&period=` → `ZoneReadingAnalysis`.
 * Lecture publique : des lignes de vol et des cercles de toutes les parties du site, sans aucun nom de joueur.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const mapName = url.searchParams.get('map')?.trim() || null
  if (mapName && mapName.length > 64) return Response.json({ error: 'Carte inconnue.' }, { status: 400 })
  const mode = parseZoneReadingMode(url.searchParams.get('mode'))
  const period = parsePeriod(url.searchParams.get('period'), ROLLING_PERIODS, 'all')

  try {
    return Response.json(await loadZoneReadingAnalysis({ mapName, mode, period }))
  } catch (error) {
    console.error('[zone-reading] Analyse illisible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
