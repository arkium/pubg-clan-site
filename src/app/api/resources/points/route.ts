import { getSessionFromRequest } from '@/lib/auth-session'
import { proposeResourcePoint, readResourceBody, requireResourceUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/**
 * Proposition d'un point (docs/features/carte-ressources.md §4) : `{ map, kind, x, y, comment? }` →
 * `ResourceProposalResponse` (201). Connecté ; le point reste en attente jusqu'à la validation d'un SuperUser.
 */
export async function POST(request: Request) {
  try {
    const session = requireResourceUser(await getSessionFromRequest(request))
    const body = await readResourceBody(request)
    return Response.json(await proposeResourcePoint(session, body), { status: 201 })
  } catch (error) {
    return resourceErrorResponse(error, 'points')
  }
}
