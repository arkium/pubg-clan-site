import { getSessionFromRequest } from '@/lib/auth-session'
import { getResourceQueue } from '@/lib/resources/resource-service-admin'
import { resourceErrorResponse } from '@/lib/resources/resource-service'

/** File de validation de la Carte des ressources (SuperUser) → `ResourceQueueResponse`. */
export async function GET(request: Request) {
  try {
    return Response.json(await getResourceQueue(await getSessionFromRequest(request)))
  } catch (error) {
    return resourceErrorResponse(error, 'admin/queue')
  }
}
