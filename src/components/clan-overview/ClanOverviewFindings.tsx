import { BarChart3, Compass } from 'lucide-react'
import Link from 'next/link'

import { isAuthDisabled } from '@/lib/auth-mode'
import { getClanDirectory } from '@/lib/clan-directory-service'
import { listClansWithQuickStats } from '@/lib/clan-list-service'
import { clanOverviewFindings } from '@/lib/clan-overview-findings'

const ICON = 'h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]'

/**
 * Vue d'ensemble d'un clan — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : chiffres du
 * clan et lien vers chacune de ses pages, dans le HTML. Clan actif hors clan système seulement (comme son indexation),
 * en mode visiteur. Mêmes lectures que l'annuaire (`GET /api/clans`, `GET /api/clans/directory`, cache de 5 minutes),
 * dans un `Suspense`. Rangé depuis le 2026-10-27 dans la barre « D'où viennent ces chiffres ? » de la page, repliée
 * mais dans le HTML (docs/TODO/aide-des-pages.md, D6) : plus de panneau propre.
 */
export default async function ClanOverviewFindings({ clanId }: { clanId: number }) {
  if (!isAuthDisabled() || !Number.isInteger(clanId) || clanId <= 0) return null
  let findings = null
  try {
    const [[clan], directory] = await Promise.all([listClansWithQuickStats({ ids: [clanId] }), getClanDirectory().catch(() => null)])
    if (clan && !clan.isSystem && !clan.archivedAt) {
      const activity = directory?.activity.find((row) => row.clanId === clanId) ?? null
      findings = clanOverviewFindings(clan, activity, directory?.leagueSize ?? 0, new Date())
    }
  } catch (error) {
    console.error('[clan-overview] Résumé illisible :', error instanceof Error ? error.name : 'UnknownError')
  }
  if (!findings) return null

  return (
    <section aria-labelledby="clan-overview-findings-title" className="app-help-bar-rows" data-testid="clan-overview-findings">
      <div className="app-panel-muted app-help-bar-row">
        <h2 id="clan-overview-findings-title" className="app-help-bar-card-title">
          <BarChart3 className={ICON} aria-hidden="true" />
          <span>{findings.title}</span>
        </h2>
        <div className="app-help-bar-card-body">
          <ul>
            {findings.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
      </div>
      <nav aria-label="Pages du clan" className="app-panel-muted app-help-bar-row">
        <h3 className="app-help-bar-card-title">
          <Compass className={ICON} aria-hidden="true" />
          <span>Toutes les pages du clan</span>
        </h3>
        <ul className="app-help-bar-chips">
          {findings.links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="app-help-bar-chip">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}
