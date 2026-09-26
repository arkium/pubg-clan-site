import { getClanDirectory } from '@/lib/clan-directory-service'

/**
 * GET /api/clans/directory — activité de l'annuaire des clans (docs/features/clans.md §Annuaire) : agrégats par clan
 * (parties, top 1, joueurs de la soirée), rang en Ligue, clan du moment. Aucune donnée nominative : même exposition
 * que `GET /api/clans`. Réponse gardée 5 minutes.
 */
export async function GET() {
  try {
    return Response.json(await getClanDirectory())
  } catch (error) {
    console.error('[api/clans/directory] Lecture impossible', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
