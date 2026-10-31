import { Calculator, ShieldCheck, Sparkles, TrendingUp, Trophy, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cache } from 'react'

import JsonLd from '@/components/seo/JsonLd'
import RankCell from '@/components/ui/RankCell'
import { leagueFindings, type LeagueFormulaStep } from '@/lib/clan-league-findings'
import { getClanLeague } from '@/lib/clan-league-service'
import { siteUrl } from '@/lib/seo/page-seo'
import { itemListJsonLd, toJsonLd } from '@/lib/seo/structured-data'

const ICON = 'h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]'
/** Mêmes icônes que `PowerScoreExplanation` ; le score brut, qui porte la formule, prend toute la largeur. */
const FORMULA_STEP_ICONS: Record<LeagueFormulaStep['id'], LucideIcon> = {
  raw: Calculator,
  volume: TrendingUp,
  qualification: ShieldCheck,
}

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
      <div className="flex flex-col gap-0.5">
        <h2 id="league-findings-title" className="app-help-bar-card-title">
          <Trophy className={ICON} aria-hidden="true" />
          <span>{findings.title}</span>
        </h2>
        <p className="t-meta">{findings.scope}</p>
      </div>

      <div className="app-help-bar-rows">
        {findings.podium.length > 0 ? (
          <div className="app-panel-muted app-help-bar-row">
            <h3 className="app-help-bar-card-title">
              <Trophy className={ICON} aria-hidden="true" />
              <span>Podium de la semaine</span>
            </h3>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {findings.podium.map((line) => (
                <li key={line.clanId} className="flex items-center gap-2 text-[13px] text-gray-700">
                  <RankCell rank={line.rank} size="sm" />
                  <Link href={`/clans/${line.clanId}/overview`} className="font-semibold text-gray-900 underline-offset-2 hover:underline">
                    {line.label}
                  </Link>
                  <span className="ml-auto text-xs text-gray-500">
                    Power score <b className="t-num text-gray-900">{line.powerScore}</b> · {line.matches} parties
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className={`app-panel-muted app-help-bar-row ${findings.podium.length > 0 ? '' : 'app-help-bar-row--wide'}`.trim()}>
          <h3 className="app-help-bar-card-title">
            <Sparkles className={ICON} aria-hidden="true" />
            <span>Participation</span>
          </h3>
          <div className="app-help-bar-card-body">
            <p>{findings.summary}</p>
          </div>
        </div>
      </div>
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
    <div className="app-help-bar-rows" data-testid="league-formula">
      {findings.formula.map((step) => {
        const Icon = FORMULA_STEP_ICONS[step.id]
        return (
          <div key={step.id} className={`app-panel-muted app-help-bar-row ${step.id === 'raw' ? 'app-help-bar-row--wide' : ''}`.trim()}>
            <h3 className="app-help-bar-card-title">
              <Icon className={ICON} aria-hidden="true" />
              <span>{step.title}</span>
            </h3>
            <div className="app-help-bar-card-body">
              {step.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
