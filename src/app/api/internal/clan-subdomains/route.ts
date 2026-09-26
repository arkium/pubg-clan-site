import { listActiveClanSubdomains } from '@/lib/clan-subdomain-service'

export const dynamic = 'force-dynamic'

/**
 * Table `sous-domaine → clan` lue par le proxy (docs/TODO/chickendinnerfr.md §4.C) : le proxy
 * n'interroge jamais la base lui-même. Rien d'autre que des sous-domaines publics et des identifiants
 * de clan déjà visibles dans les adresses du site.
 */
export async function GET() {
  try {
    return Response.json(
      { targets: await listActiveClanSubdomains() },
      { headers: { 'cache-control': 'no-store' } }
    )
  } catch (error) {
    console.error('[internal/clan-subdomains] Lecture impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
