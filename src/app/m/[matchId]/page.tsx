import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Users } from 'lucide-react'

import ClanTag from '@/components/ui/ClanTag'
import { matchDebriefPath } from '@/lib/match-links'
import {
  resolveMatchShortLink,
  shortLinkContext,
  shortLinkSubdomainHint,
} from '@/lib/short-link-resolution'

/**
 * Lien court d'un match, `/m/<match>` (docs/TODO/url-masking.md §4.B) : redirige (307) vers le débriefing du clan qui
 * l'a joué — celui du sous-domaine d'origine (`?c=`, relayé par le proxy), sinon le seul clan suivi du match. Un match
 * partagé entre plusieurs clans affiche une page de choix plutôt qu'un clan pris au hasard.
 */
export default async function ShortMatchLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ matchId }, query] = await Promise.all([params, searchParams])
  const resolution = await resolveMatchShortLink(matchId, shortLinkSubdomainHint(query))
  const context = shortLinkContext(query)

  if (resolution.kind === 'not_found') notFound()
  if (resolution.kind === 'redirect') redirect(matchDebriefPath(resolution.clanId, matchId, context))

  return (
    <div className="app-container app-main flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="t-page-title m-0 flex items-center gap-2 text-gray-900">
          <Users className="h-5 w-5 shrink-0 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
          Ce match concerne plusieurs clans
        </h1>
        <p className="t-body m-0 text-gray-600">Choisis le clan dont tu veux voir le débriefing.</p>
      </header>
      <ul className="app-panel m-0 flex list-none flex-col divide-y divide-gray-200 p-0">
        {resolution.clans.map((clan) => (
          <li key={clan.id}>
            <Link
              href={matchDebriefPath(clan.id, matchId, context)}
              className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50"
            >
              <ClanTag tag={clan.tag} size="md" />
              <span className="t-body font-semibold text-gray-900">{clan.name}</span>
              <span className="t-meta ml-auto">Débriefing</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
