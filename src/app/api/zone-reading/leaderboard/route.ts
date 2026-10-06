import { getSessionFromRequest } from '@/lib/auth-session'
import { getZoneReadingLeaderboard } from '@/lib/zone-reading/zone-reading-service'

/**
 * « Le clan » (docs/features/lecture-de-zone.md) : `?clanId=&map=` → `ZoneReadingLeaderboard`. Lecture publique ; un
 * lecteur connecté reçoit en plus sa propre ligne (`viewer`), même hors des dix premiers.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const clanId = Number(url.searchParams.get('clanId'))
  if (!Number.isInteger(clanId) || clanId <= 0) return Response.json({ error: 'ID de clan invalide.' }, { status: 400 })
  const mapName = url.searchParams.get('map')?.trim() ?? ''
  if (!mapName || mapName.length > 64) return Response.json({ error: 'Carte inconnue.' }, { status: 400 })

  try {
    const session = await getSessionFromRequest(request)
    return Response.json(await getZoneReadingLeaderboard(clanId, mapName, session?.activeMemberId ?? null))
  } catch (error) {
    console.error('[zone-reading/leaderboard] Classement illisible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
