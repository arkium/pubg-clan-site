import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { getSiteConfiguration } from '@/lib/site-config'

/**
 * Configuration du site (/settings/configuration, SuperUser) : chaque réglage du .env contrôlé et expliqué
 * (`src/lib/site-config.ts`). Lecture seule — un .env se modifie sur le serveur, puis on redémarre. Aucun secret ni
 * adresse de base de données n'est renvoyé en clair.
 */
export async function GET(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  try {
    return Response.json(await getSiteConfiguration())
  } catch (error) {
    console.error('[api/settings/site-config] Lecture impossible', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
