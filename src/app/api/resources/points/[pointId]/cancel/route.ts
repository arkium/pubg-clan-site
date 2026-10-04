import { getSessionFromRequest } from '@/lib/auth-session'
import { cancelResourcePoint, requireResourceId, requireResourceUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/** L'auteur retire sa proposition encore en attente (la ligne est supprimée) → `{ ok: true }`. */
export async function POST(request: Request, { params }: { params: Promise<{ pointId: string }> }) {
  try {
    const { pointId } = await params
    const session = requireResourceUser(await getSessionFromRequest(request))
    return Response.json(await cancelResourcePoint(session, requireResourceId(pointId, 'Proposition')))
  } catch (error) {
    return resourceErrorResponse(error, 'points/cancel')
  }
}
