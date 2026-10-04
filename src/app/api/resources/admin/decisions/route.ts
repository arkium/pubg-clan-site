import { getSessionFromRequest } from '@/lib/auth-session'
import { applyResourceDecisions } from '@/lib/resources/resource-service-admin'
import { readResourceBody, requireResourceSuperUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/**
 * Décisions par lot (SuperUser) : `{ decisions: ResourceDecisionInput[] }` → `ResourceDecisionsResponse`. Chaque ligne
 * est traitée indépendamment, avec son résultat ; chaque décision écrit une entrée d'historique annulable.
 */
export async function POST(request: Request) {
  try {
    const session = requireResourceSuperUser(await getSessionFromRequest(request))
    const body = await readResourceBody(request)
    return Response.json(await applyResourceDecisions(session, body))
  } catch (error) {
    return resourceErrorResponse(error, 'admin/decisions')
  }
}
