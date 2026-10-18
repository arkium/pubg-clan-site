import Link from 'next/link'

import { isAuthDisabled } from '@/lib/auth-mode'
import { clanDirectoryFindings } from '@/lib/clan-directory-findings'
import { getClanDirectory } from '@/lib/clan-directory-service'
import { listClansWithQuickStats } from '@/lib/clan-list-service'

/**
 * Annuaire des clans — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : totaux, clans les
 * plus actifs, styles de jeu et **lien vers chaque clan suivi**, dans le HTML. Mêmes lectures que `GET /api/clans` et
 * `GET /api/clans/directory` (cache de 5 minutes). Rendu dans un `Suspense` par la page : l'activité, 2 s à froid, ne
 * retarde pas le reste. Mode visiteur seulement, comme la page.
 */
export default async function ClanDirectoryFindings() {
  if (!isAuthDisabled()) return null
  let findings = null
  try {
    const [clans, directory] = await Promise.all([listClansWithQuickStats(), getClanDirectory().catch(() => null)])
    findings = clanDirectoryFindings(clans, directory, new Date())
  } catch (error) {
    console.error('[clans] Résumé illisible :', error instanceof Error ? error.name : 'UnknownError')
  }
  if (!findings) return null

  return (
    <section aria-labelledby="clan-directory-findings-title" className="app-panel flex flex-col gap-3 p-4 sm:p-5" data-testid="clan-directory-findings">
      <div className="flex flex-col gap-1">
        <h2 id="clan-directory-findings-title" className="t-section-title">
          {findings.title}
        </h2>
        <p className="t-meta">{findings.scope}</p>
      </div>
      {findings.active ? (
        <p className="t-body text-gray-700">
          {findings.active.intro}{' '}
          {findings.active.clans.map((entry, index) => (
            <span key={entry.id}>
              {index > 0 ? ' ; ' : ''}
              <Link href={`/clans/${entry.id}/overview`} className="font-semibold text-gray-900 underline-offset-2 hover:underline">
                {entry.label}
              </Link>{' '}
              ({entry.detail})
            </span>
          ))}
          .
        </p>
      ) : null}
      {findings.styles ? <p className="t-body text-gray-700">{findings.styles}</p> : null}
      <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-3">
        <h3 className="t-card-title">Tous les clans suivis</h3>
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
          {findings.clans.map((entry) => (
            <li key={entry.id} className="t-body">
              <Link href={`/clans/${entry.id}/overview`} className="text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline">
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1 border-t border-gray-200 pt-3">
        <h3 className="t-card-title">Inscrire son clan</h3>
        <p className="t-body text-gray-700">
          {findings.join}{' '}
          <Link href="/join" className="app-link font-semibold">
            Demander l’accès ou inscrire son clan
          </Link>
        </p>
      </div>
    </section>
  )
}
