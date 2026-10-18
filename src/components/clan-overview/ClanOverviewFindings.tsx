import Link from 'next/link'

import { isAuthDisabled } from '@/lib/auth-mode'
import { getClanDirectory } from '@/lib/clan-directory-service'
import { listClansWithQuickStats } from '@/lib/clan-list-service'
import { clanOverviewFindings } from '@/lib/clan-overview-findings'

/**
 * Vue d'ensemble d'un clan — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : chiffres du
 * clan et lien vers chacune de ses pages, dans le HTML. Clan actif hors clan système seulement (comme son indexation),
 * en mode visiteur. Mêmes lectures que l'annuaire (`GET /api/clans`, `GET /api/clans/directory`, cache de 5 minutes),
 * dans un `Suspense`.
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
    <section aria-labelledby="clan-overview-findings-title" className="app-panel flex flex-col gap-3 p-4 sm:p-5" data-testid="clan-overview-findings">
      <h2 id="clan-overview-findings-title" className="t-section-title">
        {findings.title}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {findings.facts.map((fact) => (
          <li key={fact} className="t-body text-gray-700">
            {fact}
          </li>
        ))}
      </ul>
      <nav aria-label="Pages du clan" className="flex flex-col gap-1.5 border-t border-gray-200 pt-3">
        <h3 className="t-card-title">Toutes les pages du clan</h3>
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
          {findings.links.map((link) => (
            <li key={link.href} className="t-body">
              <Link href={link.href} className="text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}
