import { getAdminInbox } from '@/lib/admin-inbox/service'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'

/**
 * Boîte « À traiter » de l'accueil Plateforme (SuperUser) : les files et incidents de tout le site, chacun avec sa page
 * (`src/lib/admin-inbox/`). Lecture seule ; une source illisible est listée dans `unavailable`, jamais comptée à zéro.
 */
export async function GET(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  try {
    return Response.json(await getAdminInbox())
  } catch (error) {
    console.error('[api/settings/inbox] Lecture impossible', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
