import { listClansWithQuickStats } from '@/lib/clan-list-service'
import { isSuperUserSession } from '@/middleware/auth-permission'

/**
 * GET /api/clans
 * Récupère tous les clans actifs avec leurs statistiques précalculées depuis la DB (`listClansWithQuickStats`, partagé
 * avec le bloc « En bref » de l'annuaire). Pour les SuperUsers, `?all=true` renvoie aussi les clans inactifs : en
 * attente de validation ET archivés (docs/TODO/clan-archive.md) — `archivedAt` les distingue.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const wantsAll = searchParams.get('all') === 'true' || searchParams.get('status') === 'all'
    const isSU = wantsAll ? await isSuperUserSession(request) : false

    return Response.json(await listClansWithQuickStats({ includeInactive: isSU }))
  } catch (error) {
    console.error('Error fetching clans:', error)
    return Response.json({ error: 'Failed to fetch clans' }, { status: 500 })
  }
}
