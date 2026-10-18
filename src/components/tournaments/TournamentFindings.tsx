import { isAuthDisabled } from '@/lib/auth-mode'
import { tournamentFindings } from '@/lib/tournament-findings'
import { getTournamentOverview } from '@/lib/tournament-overview'

/**
 * Page d'un tournoi — résumé, composant serveur (docs/TODO/geo-seo-propositions.md, lot 2). Seul texte du HTML avant le
 * chargement du classement (160 Ko, par l'API) : il porte le H1, que l'en-tête du tournoi reprend une fois chargé (le
 * résumé disparaît alors). Mode visiteur seulement, comme `GET /api/tournaments/[id]/standings`.
 */
export default async function TournamentFindings({ tournamentId }: { tournamentId: string }) {
  if (!isAuthDisabled()) return null
  let findings = null
  try {
    const overview = await getTournamentOverview(tournamentId)
    findings = overview ? tournamentFindings(overview) : null
  } catch (error) {
    console.error('[tournament] Résumé illisible :', error instanceof Error ? error.name : 'UnknownError')
  }
  if (!findings) return null

  return (
    <section aria-labelledby="tournament-findings-title" className="app-panel flex flex-col gap-2.5 p-4 sm:p-5" data-testid="tournament-findings">
      <div className="flex flex-col gap-1">
        <h1 id="tournament-findings-title" className="t-section-title">
          {findings.title}
        </h1>
        <p className="t-meta">{findings.scope}</p>
      </div>
      <p className="t-body text-gray-900">
        <b>{findings.status}</b> {findings.attendance}
      </p>
      {findings.podium.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {findings.podium.map((line) => (
            <li key={line.label} className="t-body text-gray-700">
              <b className="text-gray-900">{line.rank === 1 ? '1er' : `${line.rank}e`}</b> {line.label} — <span className="t-num">{line.points}</span> points,{' '}
              {line.kills} kills
            </li>
          ))}
        </ol>
      ) : null}
      <p className="t-meta">{findings.rule}</p>
    </section>
  )
}
