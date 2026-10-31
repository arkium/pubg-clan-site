import { Flame, Sparkles, UserPlus, Users } from 'lucide-react'
import Link from 'next/link'

import JsonLd from '@/components/seo/JsonLd'
import { isAuthDisabled } from '@/lib/auth-mode'
import { clanDirectoryFindings } from '@/lib/clan-directory-findings'
import { getClanDirectory } from '@/lib/clan-directory-service'
import { listClansWithQuickStats } from '@/lib/clan-list-service'
import { siteUrl } from '@/lib/seo/page-seo'
import { itemListJsonLd, toJsonLd } from '@/lib/seo/structured-data'

const ICON = 'h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]'

/**
 * Annuaire des clans — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : totaux, clans les
 * plus actifs, styles de jeu et **lien vers chaque clan suivi**, dans le HTML. Mêmes lectures que `GET /api/clans` et
 * `GET /api/clans/directory` (cache de 5 minutes). Rendu dans un `Suspense` par la page : l'activité, 2 s à froid, ne
 * retarde pas le reste. Mode visiteur seulement, comme la page. Rangé depuis le 2026-10-28 dans la barre « Comment
 * c'est calculé ? » de l'annuaire (`CalculationHelp`), sous la méthode, liens compris : plus de panneau propre.
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
  // Données structurées : la liste des clans, telle que ce bloc la montre en liens (src/lib/seo/structured-data.ts).
  const structuredData = toJsonLd(
    itemListJsonLd(
      siteUrl(),
      'Clans PUBG suivis sur chickendinner.fr',
      findings.clans.map((entry) => ({ name: entry.label, path: `/clans/${entry.id}/overview` }))
    )
  )
  const hasActivityCard = Boolean(findings.active || findings.styles)

  return (
    <section aria-labelledby="clan-directory-findings-title" className="flex flex-col gap-3" data-testid="clan-directory-findings">
      <JsonLd json={structuredData} />
      <div className="flex flex-col gap-0.5">
        <h2 id="clan-directory-findings-title" className="app-help-bar-card-title">
          <Sparkles className={ICON} aria-hidden="true" />
          <span>{findings.title}</span>
        </h2>
        <p className="t-meta">{findings.scope}</p>
      </div>

      <div className="app-help-bar-rows">
        {hasActivityCard ? (
          <div className="app-panel-muted app-help-bar-row">
            <h3 className="app-help-bar-card-title">
              <Flame className={ICON} aria-hidden="true" />
              <span>Activité et styles de jeu</span>
            </h3>
            <div className="app-help-bar-card-body">
              {findings.active ? (
                <p>
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
              {findings.styles ? <p>{findings.styles}</p> : null}
            </div>
          </div>
        ) : null}

        <div className={`app-panel-muted app-help-bar-row ${hasActivityCard ? '' : 'app-help-bar-row--wide'}`.trim()}>
          <h3 className="app-help-bar-card-title">
            <UserPlus className={ICON} aria-hidden="true" />
            <span>Inscrire son clan</span>
          </h3>
          <div className="app-help-bar-card-body">
            <p>
              {findings.join}{' '}
              <Link href="/join" className="app-link font-semibold">
                Demander l’accès ou inscrire son clan
              </Link>
            </p>
          </div>
        </div>

        <div className="app-panel-muted app-help-bar-row app-help-bar-row--wide">
          <h3 className="app-help-bar-card-title">
            <Users className={ICON} aria-hidden="true" />
            <span>Tous les clans suivis</span>
          </h3>
          <ul className="app-help-bar-chips">
            {findings.clans.map((entry) => (
              <li key={entry.id}>
                <Link href={`/clans/${entry.id}/overview`} className="app-help-bar-chip">
                  {entry.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
