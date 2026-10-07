import { withAdminActionLog } from '@/lib/admin-action-log'
import { getSessionFromRequest } from '@/lib/auth-session'
import { rememberAdminActor } from '@/lib/auth/admin-actor'
import { updateResourceMapState } from '@/lib/resources/resource-service-admin'
import { readResourceBody, requireResourceSuperUser, resourceErrorResponse } from '@/lib/resources/resource-service'

/**
 * État d'une carte (SuperUser) : `{ action: 'recheck' }` (à revérifier après une mise à jour PUBG) ou
 * `{ action: 'verify' }` (vérifiée) → `{ map: ResourceMapSummary }`. Annulable depuis l'historique.
 */
async function handlePost(request: Request, { params }: { params: Promise<{ map: string }> }) {
  try {
    const { map } = await params
    const session = requireResourceSuperUser(await getSessionFromRequest(request))
    rememberAdminActor(request, { userId: session.userId, memberId: null, isSuperUser: true })
    const body = await readResourceBody(request)
    return Response.json(await updateResourceMapState(session, map, body))
  } catch (error) {
    return resourceErrorResponse(error, 'admin/maps')
  }
}

export const POST = withAdminActionLog('resources/admin/maps/[map]', handlePost)
