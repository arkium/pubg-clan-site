import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { getSessionFromRequest } from '@/lib/auth-session'
import { requestCappedResync } from '@/lib/clan-data-health'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Demande de resynchronisation rapide (Q17, SuperUser seul depuis le 2026-10-08) : met en file, à basse priorité, au
 * plus le quota restant (50 parties par 24 h et par clan). Aucun appel PUBG dans la requête ; 429 quand le quota est
 * épuisé.
 */
async function handlePost(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)
  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  try {
    const session = await getSessionFromRequest(request)
    const result = await requestCappedResync(parsedClanId, session?.userId ?? 0)
    if (result.reason === 'quota') {
      return Response.json({ error: 'Quota de resynchronisation atteint pour 24 h', ...result }, { status: 429 })
    }
    return Response.json(result)
  } catch (error) {
    console.error('[data-health] Resync request failed:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export const POST = withAdminActionLog('clans/[clanId]/settings/data-health/resync', handlePost)
