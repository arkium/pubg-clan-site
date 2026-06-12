import { syncClanMembership } from '@/lib/clan-service'
import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_members')(request, {
      clanId: parsedClanId,
      allowMissingActor: true,
    })
    if (permissionError) {
      return permissionError
    }

    const actorMemberId = await getActorMemberId(request)
    if (!actorMemberId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const diff = await syncClanMembership(parsedClanId)
    return Response.json({ diff })
  } catch (error) {
    if (error instanceof Error && error.message.includes('no PUBG clan ID')) {
      return Response.json({ error: error.message }, { status: 422 })
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error('[pubg-diff] Error computing membership diff:', { message, error })
    return Response.json({ error: `Failed to compute diff: ${message}` }, { status: 500 })
  }
}
