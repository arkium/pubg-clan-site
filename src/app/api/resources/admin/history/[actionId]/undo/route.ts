import { withAdminActionLog } from '@/lib/admin-action-log'
import { getSessionFromRequest } from '@/lib/auth-session'
import { rememberAdminActor } from '@/lib/auth/admin-actor'
import { undoResourceAction } from '@/lib/resources/resource-service-admin'
import { requireResourceId, requireResourceSuperUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/** Annule une décision (SuperUser) si rien n'a changé depuis (`409` sinon) → `{ ok: true }`. */
async function handlePost(request: Request, { params }: { params: Promise<{ actionId: string }> }) {
  try {
    const { actionId } = await params
    const session = requireResourceSuperUser(await getSessionFromRequest(request))
    rememberAdminActor(request, { userId: session.userId, memberId: null, isSuperUser: true })
    return Response.json(await undoResourceAction(session, requireResourceId(actionId, 'Action')))
  } catch (error) {
    return resourceErrorResponse(error, 'admin/history/undo')
  }
}

export const POST = withAdminActionLog('resources/admin/history/[actionId]/undo', handlePost)
