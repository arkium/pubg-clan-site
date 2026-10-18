import { cache } from 'react'

import JsonLd from '@/components/seo/JsonLd'
import { isAuthDisabled } from '@/lib/auth-mode'
import { siteUrl } from '@/lib/seo/page-seo'
import { sportsEventJsonLd, toJsonLd } from '@/lib/seo/structured-data'
import { tournamentFindings } from '@/lib/tournament-findings'
import { getTournamentOverview } from '@/lib/tournament-overview'

/** Une seule lecture par requête pour le résumé et les données structurées (`cache`). Mode visiteur seulement. */
const loadTournamentSummary = cache(async (tournamentId: string) => {
  if (!isAuthDisabled()) return null
  try {
    const overview = await getTournamentOverview(tournamentId)
    const findings = overview ? tournamentFindings(overview) : null
    if (!overview || !findings) return null
    const organizer = overview.organizerClan
    // Le tournoi comme compétition en ligne (src/lib/seo/structured-data.ts). Participants nommés en inter-clans
    // seulement, comme le podium affiché.
    const structuredData = toJsonLd(
      sportsEventJsonLd(siteUrl(), {
        id: overview.id,
        title: overview.title,
        description: `${findings.status} ${findings.attendance}`,
        startDate: overview.startDate,
        endDate: overview.endDate,
        organizer: organizer ? { id: organizer.id, label: `${organizer.tag ? `[${organizer.tag}] ` : ''}${organizer.name}` } : null,
        competitors: findings.podium.map((line) => line.label),
      })
    )
    return { findings, structuredData }
  } catch (error) {
    console.error('[tournament] Résumé illisible :', error instanceof Error ? error.name : 'UnknownError')
    return null
  }
})

/**
 * Données structurées du tournoi, à côté de la page et non dans le résumé : celui-ci disparaît quand le classement
 * arrive, et Google lit la page rendue.
 */
export async function TournamentStructuredData({ tournamentId }: { tournamentId: string }) {
  return <JsonLd json={(await loadTournamentSummary(tournamentId))?.structuredData ?? null} />
}

/**
 * Page d'un tournoi — résumé, composant serveur (docs/TODO/geo-seo-propositions.md, lot 2). Seul texte du HTML avant le
 * chargement du classement (160 Ko, par l'API) : il porte le H1, que l'en-tête du tournoi reprend une fois chargé (le
 * résumé disparaît alors). Mode visiteur seulement, comme `GET /api/tournaments/[id]/standings`.
 */
export default async function TournamentFindings({ tournamentId }: { tournamentId: string }) {
  const findings = (await loadTournamentSummary(tournamentId))?.findings
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
