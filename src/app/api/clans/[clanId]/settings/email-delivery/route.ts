import { requireClanFeature } from '@/lib/auth/admin-guards'
import { isEmailDeliveryReady } from '@/lib/email-delivery-config-service'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Statut en lecture seule pour la page des membres : « les invitations par email marchent-elles ? ».
 * La configuration SMTP elle-même (GET /api/settings/email-delivery) reste réservée au SuperUser.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)
  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const denied = await requireClanFeature(request, parsedClanId, 'clan-members')
  if (denied) return denied

  try {
    return Response.json({ ready: await isEmailDeliveryReady() })
  } catch (error) {
    console.error('Error reading email delivery status:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
