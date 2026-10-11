'use client'

import { Activity, AlertTriangle, CheckCircle2, Timer, TrendingUp, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { dataFailuresHref } from '@/lib/clan-data-section'
import {
  formatMilliseconds,
  formatPercent,
  OBSERVABILITY_ALERT_LABELS,
  pickObservability,
  TELEMETRY_WINDOW_OPTIONS,
  type TelemetryObservability,
  type TelemetryWindow,
} from '@/lib/clan-telemetry-view'

/**
 * Santé du pipeline de récupération PUBG d'un clan (« Santé des données », docs/TODO/administration.md §8) : jobs de la
 * file `telemetry_live_sync` sur une période, taux hors parties expirées, durée p95 et alertes de seuil. La liste des
 * jobs en échec, avec leur relance, est dans « Récupérations ».
 */

function pipelineKpis(clanId: number, { summary, health, latency }: TelemetryObservability): Kpi[] {
  const rated = health.ratedRuns > 0
  return [
    {
      label: 'Jobs',
      value: String(summary.runs),
      detail: `${summary.success} réussi(s) · ${summary.expired} expiré(s) chez PUBG`,
      icon: Activity,
      color: 'var(--game-sky)',
    },
    {
      label: 'Taux de succès',
      value: rated ? formatPercent(health.successRate) : '—',
      detail: `sur ${health.ratedRuns} job(s) hors expirées`,
      icon: TrendingUp,
      color: 'var(--game-pos)',
    },
    {
      label: 'Taux d’échec',
      value: rated ? formatPercent(health.failedRate) : '—',
      detail: `${summary.failed} échec(s)`,
      icon: XCircle,
      color: 'var(--game-neg)',
      link: summary.failed > 0 ? { href: dataFailuresHref(clanId), label: 'Voir les échecs' } : undefined,
    },
    {
      label: 'Durée p95',
      value: formatMilliseconds(latency.p95DurationMs),
      detail: 'par job : téléchargement et analyse',
      icon: Timer,
      color: 'var(--game-gold)',
    },
  ]
}

export default function PipelineHealthSection({ clanId, token }: { clanId: number; token: number }) {
  const [range, setRange] = useState<TelemetryWindow>('7d')
  const { data, error, loading } = useLifecycleResource<unknown>(
    `/api/clans/${clanId}/telemetry/observability?window=${range}&limit=200`,
    token
  )
  const observability = useMemo(() => pickObservability(data), [data])
  const message = error || (data !== null && observability === null ? 'Réponse de la route inattendue.' : '')

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="pipeline-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pipeline-title" className="t-section-title m-0">
          Pipeline de récupération
        </h2>
        <SegmentedControl<TelemetryWindow> size="sm" value={range} onChange={setRange} options={TELEMETRY_WINDOW_OPTIONS} />
      </div>
      <p className="t-meta m-0">
        Jobs de la file de récupération PUBG du clan sur la période (200 derniers au plus). Les parties expirées chez PUBG
        ne comptent pas dans les taux.
      </p>

      {message ? <p className="t-body t-neg m-0">{message}</p> : null}

      {observability === null ? (
        message ? null : (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )
      ) : (
        // Rechargement : les chiffres précédents restent affichés, estompés.
        <div aria-busy={loading} className={`flex flex-col gap-2.5 ${loading ? 'opacity-60' : ''}`}>
          <KpiGrid items={pipelineKpis(clanId, observability)} className="grid-cols-2 lg:grid-cols-4" />
          {observability.health.ratedRuns > 0 ? (
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
              {observability.health.alerts.map((alert) => {
                const ok = alert.status === 'ok'
                const format = alert.key === 'duration_p95_ms' ? formatMilliseconds : formatPercent
                const Icon = ok ? CheckCircle2 : AlertTriangle
                return (
                  <li key={alert.key} className="app-panel-muted flex items-start gap-2.5 px-3 py-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: `var(--game-${ok ? 'pos' : 'warn'})` }} aria-hidden="true" />
                    <span className="flex min-w-0 flex-col">
                      <span className="t-body font-semibold text-gray-900">{OBSERVABILITY_ALERT_LABELS[alert.key] ?? alert.label}</span>
                      <span className="t-meta">
                        Valeur : {format(alert.value)} · seuil : {format(alert.threshold)}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  )
}
