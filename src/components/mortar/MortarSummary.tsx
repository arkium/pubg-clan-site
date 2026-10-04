'use client'

import Link from 'next/link'
import { RotateCcw, Trophy } from 'lucide-react'
import type { Ref } from 'react'

import { Skeleton } from '@/components/ui/Skeleton'
import { MORTAR_DIFFICULTY_RULES, formatMeters, formatSeconds, type MortarDifficulty } from '@/lib/mortar/mortar-game'
import { deviationBar, deviationScale } from '@/lib/mortar/mortar-view'

import type { MortarSeriesOrigin, MortarSeriesSummary } from './useMortarSeries'

/**
 * Fin de série : tampon « Nouveau record », quatre indicateurs (écart moyen, tirs au but, temps moyen, record perso) et
 * les dix tirs en barres divergentes autour d'un axe (trop court à gauche, trop long à droite ; au but en positif).
 * Série non enregistrée : pas de record, invitation à se connecter (visiteur) ou mention de l'échec.
 */
export default function MortarSummary({
  difficulty,
  origin,
  summary,
  authenticated,
  onReplay,
  replayRef,
}: {
  difficulty: MortarDifficulty
  origin: MortarSeriesOrigin
  /** `null` : bilan en attente du serveur. */
  summary: MortarSeriesSummary | null
  authenticated: boolean
  onReplay: () => void
  replayRef?: Ref<HTMLButtonElement>
}) {
  const rules = MORTAR_DIFFICULTY_RULES[difficulty]

  if (!summary) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Calcul du bilan de la série">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const { score, finish } = summary
  const record = finish?.isRecord ?? false
  const scale = deviationScale(score.results.map((result) => result.error))
  const tolerance = Math.min(1, rules.tolerance / scale)

  return (
    <div className="flex flex-col gap-4" data-testid="mortar-summary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="t-section-title">Série terminée</h3>
            {record ? (
              <span className="app-stamp" data-testid="mortar-record-stamp">
                <Trophy className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                Nouveau record
              </span>
            ) : null}
          </div>
          <p className="t-meta">
            {rules.label} · {finish ? `série ${finish.seriesCount}` : 'série non enregistrée'}
          </p>
        </div>
        <button ref={replayRef} type="button" onClick={onReplay} className="app-btn app-btn--md app-btn--primary gap-2">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Rejouer
        </button>
      </div>

      {/* Série non enregistrée : pas de record, trois indicateurs (le troisième sur toute la largeur sur mobile). */}
      <dl className={`grid grid-cols-2 gap-2 ${finish ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <div className="app-panel-muted app-kpi">
          <dt className="t-label">Écart moyen</dt>
          <dd className="t-hero t-hero--md text-gray-900">{formatMeters(score.meanError, { decimals: true })}</dd>
          <dd className="app-kpi__foot">sur {score.results.length} tirs</dd>
        </div>
        <div className="app-panel-muted app-kpi">
          <dt className="t-label">Tirs au but</dt>
          <dd className="t-hero t-hero--md text-gray-900">
            {score.hits} / {score.results.length}
          </dd>
          <dd className="app-kpi__foot">à ±{rules.tolerance} m</dd>
        </div>
        <div className={`app-panel-muted app-kpi ${finish ? '' : 'max-sm:col-span-2'}`}>
          <dt className="t-label">Temps moyen</dt>
          <dd className="t-hero t-hero--md text-gray-900">{formatSeconds(score.avgTimeMs)}</dd>
          <dd className="app-kpi__foot">par cible</dd>
        </div>
        {finish ? (
          <div className="app-panel-muted app-kpi" data-testid="mortar-record-kpi">
            <dt className="t-label">Record perso</dt>
            <dd className={`t-hero t-hero--md ${record ? 't-gold' : 'text-gray-900'}`}>
              {formatMeters(record || finish.previousBest === null ? score.meanError : finish.previousBest, { decimals: true })}
            </dd>
            <dd className="app-kpi__foot">
              {record
                ? finish.previousBest === null
                  ? 'première série'
                  : `ancien : ${formatMeters(finish.previousBest, { decimals: true })}`
                : 'à battre'}
            </dd>
          </div>
        ) : null}
      </dl>

      {origin === 'visitor' && !authenticated ? (
        <p className="t-body text-gray-600" data-testid="mortar-login-hint">
          <Link href="/login?redirect=/mortier" className="app-link">
            Connecte-toi
          </Link>{' '}
          pour enregistrer tes séries et entrer au classement.
        </p>
      ) : origin === 'visitor' ? (
        <p className="t-body text-gray-600">Seuls les membres d’un clan enregistrent leurs séries.</p>
      ) : origin === 'offline' || summary.finishFailed ? (
        <p className="t-body text-gray-600">Le serveur n’a pas répondu : cette série n’est pas enregistrée.</p>
      ) : null}

      <div className="app-table-shell overflow-hidden">
        <table className="w-full table-auto text-[13px]">
          <caption className="sr-only">Les dix tirs de la série : écart à la cible, trop court à gauche, trop long à droite</caption>
          <thead className="app-table-head">
            <tr>
              <th scope="col" className="t-label w-10 py-2 pl-3 text-left">
                Tir
              </th>
              {/* Deux moitiés égales : l'axe central reste au milieu. */}
              <th scope="col" className="t-label w-[40%] py-2 pr-2 text-right">
                Trop court
              </th>
              <th scope="col" className="t-label w-[40%] py-2 pl-2 text-left">
                Trop long
              </th>
              <th scope="col" className="t-label w-16 py-2 pr-3 text-right">
                Écart
              </th>
            </tr>
          </thead>
          <tbody>
            {score.results.map((result) => {
              const bar = deviationBar(result.error, scale)
              const hit = result.verdict === 'hit'
              const fill = hit ? 'bg-[var(--game-pos)]' : 'bg-[var(--game-neg)]'
              return (
                <tr key={result.index} className="app-table-row last:border-b-0" data-testid="mortar-shot-row" data-verdict={result.verdict}>
                  <td className="t-num py-1.5 pl-3 font-semibold text-gray-500">{result.index + 1}</td>
                  {/* Moitié gauche de l'axe : la bande teintée est la zone « au but », la barre part de l'axe. */}
                  <td className="py-1.5 pl-2" aria-hidden="true">
                    <div className="relative h-3 border-r-2 border-gray-300">
                      <span className="absolute inset-y-0 right-0 bg-[var(--game-pos-soft)]" style={{ width: `${tolerance * 100}%` }} />
                      <span className={`absolute inset-y-0.5 right-0 rounded-l-[3px] ${fill}`} style={{ width: `${bar.short * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-1.5 pr-2" aria-hidden="true">
                    <div className="relative h-3">
                      <span className="absolute inset-y-0 left-0 bg-[var(--game-pos-soft)]" style={{ width: `${tolerance * 100}%` }} />
                      <span className={`absolute inset-y-0.5 left-0 rounded-r-[3px] ${fill}`} style={{ width: `${bar.long * 100}%` }} />
                    </div>
                  </td>
                  <td className={`t-num py-1.5 pr-3 text-right font-bold ${hit ? 't-pos' : 't-neg'}`}>
                    {formatMeters(result.error, { signed: true })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
