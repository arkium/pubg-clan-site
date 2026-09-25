import { listPlayersDirectory, parsePlayersDirectoryQuery } from '@/lib/players-directory'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * Annuaire transverse des joueurs — onglet « Joueurs » de `/settings/opponents`.
 *
 * Paramètres : `q`, `status` (`all` | `tracked` | `untracked` | `noclan` | `favorites`),
 * `seenByClanId`, `page`, `pageSize`, `sortBy`, `sortOrder`, et `counters=1` pour recevoir
 * les compteurs — calculés à la demande seulement, deux d'entre eux coûtent 1,3 s en
 * production. Spécification : docs/TODO/players.md.
 */
export async function GET(request: Request) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) return permissionError

  try {
    const url = new URL(request.url)
    const query = parsePlayersDirectoryQuery(url.searchParams)
    const result = await listPlayersDirectory(query, {
      includeCounters: url.searchParams.get('counters') === '1',
    })
    return Response.json(result)
  } catch (error) {
    console.error('Failed to list players directory:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
