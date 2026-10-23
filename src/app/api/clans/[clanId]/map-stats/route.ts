import { parseLeagueMatchType } from '@/lib/clan-league'
import { loadClanMapStats } from '@/lib/clan-map-stats-service'
import { parsePeriod, STANDARD_PERIODS } from '@/lib/period'
import { requireNavPermission } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Page « Cartes » d'un clan (`/clans/[clanId]/stats/maps`) : statistiques par carte des parties d'escouade du clan,
 * moyenne des clans suivis, tendance du Top 10 et joueur phare — src/lib/clan-map-stats-service.ts. Garde de l'entrée
 * de menu `clan.heatmap-kills` (clé gardée de l'ancienne page « Heatmap kills », qu'elle remplace).
 */
export async function GET(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const { clanId: rawClanId } = await params
  const clanId = parseClanId(rawClanId)
  if (!clanId) {
    return Response.json({ error: 'Clan invalide' }, { status: 400 })
  }

  const roleError = await requireNavPermission('clan.heatmap-kills')(request, { clanId })
  if (roleError) {
    return roleError
  }

  const url = new URL(request.url)
  try {
    const payload = await loadClanMapStats({
      clanId,
      period: parsePeriod(url.searchParams.get('period'), STANDARD_PERIODS, 'month'),
      matchType: parseLeagueMatchType(url.searchParams.get('matchType')),
    })
    if (!payload) {
      return Response.json({ error: 'Clan introuvable' }, { status: 404 })
    }
    return Response.json(payload)
  } catch (error) {
    console.error('[Cartes du clan] Lecture impossible', error)
    return Response.json({ error: 'Lecture des statistiques par carte impossible' }, { status: 500 })
  }
}
