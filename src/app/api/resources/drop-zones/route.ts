import { getResourceDropZones, resourceErrorResponse } from '@/lib/resources/resource-service'
import { requireNavPermission } from '@/middleware/auth-permission'

/**
 * Filtre « Autour de nos drop zones » de la Carte des ressources : `?clanId=&map=` → `ResourceDropZonesResponse`
 * (les trois zones de drop les plus fréquentes du clan sur la carte). Même accès que la page « Zones de drop ».
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const clanId = Number(url.searchParams.get('clanId'))
    if (!Number.isInteger(clanId) || clanId <= 0) return Response.json({ error: 'ID de clan invalide.', code: 'invalid_clan' }, { status: 400 })

    const denied = await requireNavPermission('clan.drop-zones')(request, { clanId })
    if (denied) return denied

    return Response.json(await getResourceDropZones(clanId, url.searchParams.get('map')))
  } catch (error) {
    return resourceErrorResponse(error, 'drop-zones')
  }
}
