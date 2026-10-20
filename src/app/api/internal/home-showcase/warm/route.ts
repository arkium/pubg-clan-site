import { refreshHomeShowcase } from '@/lib/home-showcase-service'
import { isInternalCronRequest } from '@/lib/internal-api'

/**
 * Préchauffage de la vitrine de l'accueil par le cron `home_showcase_warm` (docs/ops/cron.md) : le cache vit dans ce
 * process web, seul un appel HTTP peut le remplir. Réservé au cron (`CRON_BOOTSTRAP_SECRET`) ; `/api/internal/` est
 * fermé aux robots (robots.txt).
 */
export async function POST(request: Request) {
  if (!isInternalCronRequest(request)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const startedAt = Date.now()
  try {
    await refreshHomeShowcase(startedAt)
    return Response.json({ ok: true, durationMs: Date.now() - startedAt })
  } catch (error) {
    console.error('[home-showcase] Préchauffage échoué', error)
    return Response.json({ error: 'Showcase refresh failed' }, { status: 500 })
  }
}
