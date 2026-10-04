import { getSessionFromRequest } from '@/lib/auth-session'
import { confirmResourcePoint, requireResourceId, requireResourceUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/** « Toujours là » sur un point validé → `{ point }`. Idempotent par joueur et par période de revérification. */
export async function POST(request: Request, { params }: { params: Promise<{ pointId: string }> }) {
  try {
    const { pointId } = await params
    const session = requireResourceUser(await getSessionFromRequest(request))
    return Response.json(await confirmResourcePoint(session, requireResourceId(pointId, 'Point')))
  } catch (error) {
    return resourceErrorResponse(error, 'points/confirm')
  }
}
