import { getSessionFromRequest } from '@/lib/auth-session'
import { getResourceMapView, resourceErrorResponse } from '@/lib/resources/resource-service'

/**
 * Carte des ressources (docs/features/carte-ressources.md) : `?map=Baltic_Main` → `ResourceMapResponse`.
 * Lecture publique : points validés pour tous ; le lecteur connecté voit en plus ses propositions, un SuperUser toutes.
 */
export async function GET(request: Request) {
  try {
    const map = new URL(request.url).searchParams.get('map')
    const session = await getSessionFromRequest(request)
    return Response.json(await getResourceMapView(session, map))
  } catch (error) {
    return resourceErrorResponse(error, 'map')
  }
}
