import { withAdminActionLog } from '@/lib/admin-action-log'
import { getSessionFromRequest } from '@/lib/auth-session'
import { rememberAdminActor } from '@/lib/auth/admin-actor'
import { applyResourceDecisions } from '@/lib/resources/resource-service-admin'
import { readResourceBody, requireResourceSuperUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/**
 * Décisions par lot (SuperUser) : `{ decisions: ResourceDecisionInput[] }` → `ResourceDecisionsResponse`. Chaque ligne
 * est traitée indépendamment, avec son résultat ; chaque décision écrit une entrée d'historique annulable.
 */
async function handlePost(request: Request) {
  try {
    const session = requireResourceSuperUser(await getSessionFromRequest(request))
    rememberAdminActor(request, { userId: session.userId, memberId: null, isSuperUser: true })
    const body = await readResourceBody(request)
    return Response.json(await applyResourceDecisions(session, body))
  } catch (error) {
    return resourceErrorResponse(error, 'admin/decisions')
  }
}

export const POST = withAdminActionLog('resources/admin/decisions', handlePost)
