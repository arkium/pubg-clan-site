import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { listPrivacyRequests } from '@/lib/legal/privacy-request-service'

/**
 * Demandes « Retirer mes données » pour leur traitement par le SuperUser (/settings/privacy-requests,
 * docs/features/pages-legales.md). `?status=all` pour l'historique, sinon les demandes en attente.
 */
export async function GET(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  try {
    const filter = new URL(request.url).searchParams.get('status') === 'all' ? 'all' : 'pending'
    return Response.json(await listPrivacyRequests(filter))
  } catch (error) {
    console.error('[api/settings/privacy-requests] Listing failed:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
