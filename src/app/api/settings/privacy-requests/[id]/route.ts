import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { isPrivacyRequestStatus } from '@/lib/legal/privacy-request'
import { setPrivacyRequestStatus } from '@/lib/legal/privacy-request-service'

/** Clôt (`done`, `rejected`) ou rouvre (`pending`) une demande ; `handledAt` suit le statut. */
async function handlePatch(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  const { id } = await params
  const parsedId = Number(id)
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return Response.json({ error: 'Invalid request id' }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as { status?: unknown } | null
  if (!isPrivacyRequestStatus(body?.status)) {
    return Response.json({ error: 'status must be pending, done or rejected' }, { status: 400 })
  }

  try {
    const updated = await setPrivacyRequestStatus(parsedId, body.status)
    if (!updated) return Response.json({ error: 'Request not found' }, { status: 404 })
    return Response.json({ request: updated })
  } catch (error) {
    console.error('[api/settings/privacy-requests] Update failed:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export const PATCH = withAdminActionLog('settings/privacy-requests/[id]', handlePatch)
