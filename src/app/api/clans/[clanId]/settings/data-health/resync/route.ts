import { requireClanFeature } from '@/lib/auth/admin-guards'
import { getSessionFromRequest } from '@/lib/auth-session'
import { requestOwnerResync } from '@/lib/clan-data-health'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Demande de resynchronisation de l'Owner (Q17) : met en file, à basse priorité, au plus le quota restant
 * (50 parties par 24 h et par clan). Aucun appel PUBG dans la requête ; 429 quand le quota est épuisé.
 */
export async function POST(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)
  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const denied = await requireClanFeature(request, parsedClanId, 'clan-data-health')
  if (denied) return denied

  try {
    const session = await getSessionFromRequest(request)
    const result = await requestOwnerResync(parsedClanId, session?.userId ?? 0)
    if (result.reason === 'quota') {
      return Response.json({ error: 'Quota de resynchronisation atteint pour 24 h', ...result }, { status: 429 })
    }
    return Response.json(result)
  } catch (error) {
    console.error('[data-health] Resync request failed:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
