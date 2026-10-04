import { getSessionFromRequest } from '@/lib/auth-session'
import { undoResourceAction } from '@/lib/resources/resource-service-admin'
import { requireResourceId, requireResourceSuperUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/** Annule une décision (SuperUser) si rien n'a changé depuis (`409` sinon) → `{ ok: true }`. */
export async function POST(request: Request, { params }: { params: Promise<{ actionId: string }> }) {
  try {
    const { actionId } = await params
    const session = requireResourceSuperUser(await getSessionFromRequest(request))
    return Response.json(await undoResourceAction(session, requireResourceId(actionId, 'Action')))
  } catch (error) {
    return resourceErrorResponse(error, 'admin/history/undo')
  }
}
