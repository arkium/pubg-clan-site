import { getSessionFromRequest } from '@/lib/auth-session'
import { updateResourceMapState } from '@/lib/resources/resource-service-admin'
import { readResourceBody, requireResourceSuperUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/**
 * État d'une carte (SuperUser) : `{ action: 'recheck' }` (à revérifier après une mise à jour PUBG) ou
 * `{ action: 'verify' }` (vérifiée) → `{ map: ResourceMapSummary }`. Annulable depuis l'historique.
 */
export async function POST(request: Request, { params }: { params: Promise<{ map: string }> }) {
  try {
    const { map } = await params
    const session = requireResourceSuperUser(await getSessionFromRequest(request))
    const body = await readResourceBody(request)
    return Response.json(await updateResourceMapState(session, map, body))
  } catch (error) {
    return resourceErrorResponse(error, 'admin/maps')
  }
}
