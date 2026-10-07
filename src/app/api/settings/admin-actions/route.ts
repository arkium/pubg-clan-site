import { isMissingAdminActionTable, listAdminActions, parseAdminActionFilters } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'

/**
 * Journal des actions d'administration (docs/TODO/administration.md Q10), lu par la page /settings/journal.
 * Filtres : `clanId`, `userId`, `outcome` (`success` | `error`), `page`. SuperUser seulement.
 */
export async function GET(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  try {
    return Response.json(await listAdminActions(parseAdminActionFilters(new URL(request.url).searchParams)))
  } catch (error) {
    if (isMissingAdminActionTable(error)) {
      return Response.json(
        { error: 'Journal indisponible : la migration add_admin_action_log n’est pas encore appliquée.' },
        { status: 503 }
      )
    }
    console.error('[api/settings/admin-actions] Listing failed:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
