import { getSessionFromRequest } from '@/lib/auth-session'
import { readResourceBody, reportResourcePoint, requireResourceId, requireResourceUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/**
 * Signalement d'un point validé : `{ kind: 'missing' | 'misplaced' | 'wrong_kind', x?, y?, proposedKind?, comment? }` →
 * `ResourceReportResponse` (201). Un seul signalement en attente par joueur et par point.
 */
export async function POST(request: Request, { params }: { params: Promise<{ pointId: string }> }) {
  try {
    const { pointId } = await params
    const session = requireResourceUser(await getSessionFromRequest(request))
    const id = requireResourceId(pointId, 'Point')
    const body = await readResourceBody(request)
    return Response.json(await reportResourcePoint(session, id, body), { status: 201 })
  } catch (error) {
    return resourceErrorResponse(error, 'points/reports')
  }
}
