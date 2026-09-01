import { isInternalCronRequest } from '@/lib/internal-api'
import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'
import { syncClanMatches } from '@/lib/matches-sync-service'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)

  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  if (!isInternalCronRequest(request)) {
    const roleError = await requirePermission('manage_settings')(request, {
      clanId: parsedClanId,
    })

    if (roleError) {
      return roleError
    }
  }

  const body = (await request.json().catch(() => null)) as { memberId?: unknown } | null
  const requestedMemberId = typeof body?.memberId === 'number' && Number.isInteger(body.memberId) && body.memberId > 0
    ? body.memberId
    : null

  if (requestedMemberId && !isInternalCronRequest(request)) {
    const actorMemberId = await getActorMemberId(request)
    if (actorMemberId !== requestedMemberId) {
      return Response.json({ error: 'A member can only synchronize their own matches' }, { status: 403 })
    }
  }

  try {
    const payload = await syncClanMatches(parsedClanId, { requestedMemberId })
    return Response.json(payload)
  } catch (err) {
    console.error('Error syncing matches:', err)
    
    if (err instanceof Error && err.message === 'Clan not found') {
      return Response.json({ error: 'Clan not found' }, { status: 404 })
    }
    
    if (err instanceof Error && err.message === 'Active member not found in this clan') {
      return Response.json({ error: 'Active member not found in this clan' }, { status: 404 })
    }
    
    return Response.json(
      { error: 'Failed to synchronize clan matches' },
      { status: 500 }
    )
  }
}
