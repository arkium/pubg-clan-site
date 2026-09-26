import { NextRequest } from 'next/server'

import { getClanShowcase } from '@/lib/clan-showcase-service'
import { requireNavPermission } from '@/middleware/auth-permission'

/**
 * Vitrine de la vue d'ensemble d'un clan : palmarès, briefing de la semaine, indices de navigation
 * (docs/features/clans.md). Même permission que la vue d'ensemble ; réponse gardée 5 minutes par clan.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ clanId: string }> }) {
  try {
    const { clanId } = await params
    const parsedClanId = Number(clanId)
    if (!Number.isInteger(parsedClanId) || parsedClanId <= 0) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requireNavPermission('clan.overview')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const showcase = await getClanShowcase(parsedClanId)
    if (!showcase) return Response.json({ error: 'Clan not found' }, { status: 404 })
    return Response.json(showcase)
  } catch (error) {
    console.error('[api/clans/overview/showcase] Lecture impossible', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
