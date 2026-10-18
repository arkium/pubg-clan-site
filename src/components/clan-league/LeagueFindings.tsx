import Link from 'next/link'

import { leagueFindings } from '@/lib/clan-league-findings'
import { getClanLeague } from '@/lib/clan-league-service'

/**
 * Ligue des clans — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : podium de la semaine en
 * parties normales (la vue par défaut de la page), clans classés et formule du Power score, dans le HTML. Même calcul
 * et même cache que `GET /api/clans-leaderboard`. Rendu dans un `Suspense` par la page.
 */
export default async function LeagueFindings() {
  let findings = null
  try {
    findings = leagueFindings(await getClanLeague('week', 'official'), new Date())
  } catch (error) {
    // Le classement interactif reste disponible : ce bloc n'est qu'un résumé.
    console.error('[clans-leaderboard] Résumé illisible :', error instanceof Error ? error.name : 'UnknownError')
  }
  if (!findings) return null

  return (
    <section aria-labelledby="league-findings-title" className="app-panel flex flex-col gap-3 p-4 sm:p-5" data-testid="league-findings">
      <div className="flex flex-col gap-1">
        <h2 id="league-findings-title" className="t-section-title">
          {findings.title}
        </h2>
        <p className="t-meta">{findings.scope}</p>
      </div>
      {findings.podium.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {findings.podium.map((line) => (
            <li key={line.clanId} className="t-body text-gray-700">
              <b className="text-gray-900">{line.rank === 1 ? '1er' : `${line.rank}e`}</b>{' '}
              <Link href={`/clans/${line.clanId}/overview`} className="font-semibold text-gray-900 underline-offset-2 hover:underline">
                {line.label}
              </Link>{' '}
              — Power score <span className="t-num">{line.powerScore}</span>, {line.matches} parties
            </li>
          ))}
        </ol>
      ) : null}
      <p className="t-body text-gray-700">{findings.summary}</p>
      <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-3">
        <h3 className="t-card-title">Comment est calculé le Power score</h3>
        {findings.formula.map((sentence) => (
          <p key={sentence} className="t-body text-gray-700">
            {sentence}
          </p>
        ))}
      </div>
    </section>
  )
}
