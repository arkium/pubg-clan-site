import Link from 'next/link'
import { cache } from 'react'

import JsonLd from '@/components/seo/JsonLd'
import { leagueFindings } from '@/lib/clan-league-findings'
import { getClanLeague } from '@/lib/clan-league-service'
import { siteUrl } from '@/lib/seo/page-seo'
import { itemListJsonLd, toJsonLd } from '@/lib/seo/structured-data'

/** Une seule lecture par requête pour le résumé et la formule (`cache`). Même calcul et même cache que l'API. */
const loadLeagueFindings = cache(async () => {
  try {
    return leagueFindings(await getClanLeague('week', 'official'), new Date())
  } catch (error) {
    // Le classement interactif reste disponible : ce bloc n'est qu'un résumé.
    console.error('[clans-leaderboard] Résumé illisible :', error instanceof Error ? error.name : 'UnknownError')
    return null
  }
})

/**
 * Ligue des clans — « En bref », composant serveur (docs/TODO/geo-seo-propositions.md, lot 2) : podium de la semaine en
 * parties normales (la vue par défaut de la page) et clans classés, dans le HTML. Rangé depuis le 2026-10-28 dans la
 * barre « Comment c'est calculé ? » de la page (`CalculationHelp`), repliée mais dans le HTML : plus de panneau propre.
 * Rendu dans un `Suspense` par la page.
 */
export default async function LeagueFindings() {
  const findings = await loadLeagueFindings()
  if (!findings) return null
  // Données structurées : le podium, tel que ce bloc le montre (src/lib/seo/structured-data.ts).
  const structuredData =
    findings.podium.length > 0
      ? toJsonLd(
          itemListJsonLd(
            siteUrl(),
            'Podium de la semaine de la Ligue des clans PUBG',
            findings.podium.map((line) => ({ name: line.label, path: `/clans/${line.clanId}/overview` }))
          )
        )
      : null

  return (
    <section aria-labelledby="league-findings-title" className="flex flex-col gap-3" data-testid="league-findings">
      <JsonLd json={structuredData} />
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
    </section>
  )
}

/**
 * Formule du Power score en phrases, avec les réglages en vigueur (semaine, parties normales) : méthode de la barre
 * « Comment c'est calculé ? » tant que le classement n'est pas chargé — c'est elle que lisent les robots qui n'exécutent
 * pas le JavaScript. Une fois le classement là, la page la remplace par l'explication de la période et du type choisis
 * (`PowerScoreExplanation`) : jamais les deux à la fois.
 */
export async function LeagueFormula() {
  const findings = await loadLeagueFindings()
  if (!findings) return null
  return (
    <div className="flex flex-col gap-2" data-testid="league-formula">
      {findings.formula.map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
    </div>
  )
}
