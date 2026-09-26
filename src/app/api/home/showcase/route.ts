import { getHomeShowcase } from '@/lib/home-showcase-service'

/**
 * Endpoint public (pas d'auth requise) — données de la vitrine de l'accueil, docs/features/accueil.md.
 *
 * Ne renvoie que des agrégats et les Top 1 récents des clans actifs : jamais le pseudo d'un joueur extérieur au
 * site (les victimes sont réduites au tag de leur clan). Réponse gardée 5 minutes en mémoire par le service.
 */
export async function GET() {
  try {
    const showcase = await getHomeShowcase()
    return Response.json(showcase)
  } catch (error) {
    console.error('[api/home/showcase] Lecture impossible', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
