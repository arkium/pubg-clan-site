'use client'

import { EyeOff, Plane, RotateCcw, Trophy } from 'lucide-react'
import Link from 'next/link'
import type { Ref } from 'react'

import type { ZoneReadingSeriesFinish } from '@/lib/zone-reading/zone-reading-api'
import { ZONE_READING_ROUNDS, formatDistance, type ZoneReadingSeriesScore } from '@/lib/zone-reading/zone-reading-game'

import type { ZoneReadingOrigin } from './useZoneReadingSeries'

/**
 * Fin de série : écart moyen, parties mieux que chaque repère, record perso (membre), les trois écarts moyens en
 * barres (toi, en visant le centre, en visant la ligne) et l'écart avec puis sans la ligne de vol.
 */
export default function ZoneReadingSummary({
  score,
  finish,
  origin,
  authenticated,
  onReplay,
  replayRef,
}: {
  score: ZoneReadingSeriesScore
  finish: ZoneReadingSeriesFinish | null
  origin: ZoneReadingOrigin
  authenticated: boolean
  onReplay: () => void
  replayRef?: Ref<HTMLButtonElement>
}) {
  const record = finish?.isRecord ?? false
  const scale = Math.max(1, score.meanError, score.center, score.line)
  const bars = [
    { key: 'you', label: 'Toi', value: score.meanError, accent: true },
    { key: 'center', label: 'En visant le centre', value: score.center, accent: false },
    { key: 'line', label: 'En visant la ligne', value: score.line, accent: false },
  ]

  return (
    <div className="flex flex-col gap-4" data-testid="zone-summary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="t-section-title">Série terminée</h3>
            {record ? (
              <span className="app-stamp" data-testid="zone-record-stamp">
                <Trophy className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                Nouveau record
              </span>
            ) : null}
          </div>
          <p className="t-meta">
            Où finit la zone ? · {ZONE_READING_ROUNDS} parties rejouées{finish ? ` · série ${finish.seriesCount}` : ''}
          </p>
        </div>
        <button ref={replayRef} type="button" onClick={onReplay} className="app-btn app-btn--md app-btn--primary gap-2">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Rejouer
        </button>
      </div>

      <dl className={`grid grid-cols-2 gap-2 ${finish ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <div className="app-panel-muted app-kpi">
          <dt className="t-label">Écart moyen</dt>
          <dd className="t-hero t-hero--md text-gray-900" data-testid="zone-summary-mean">
            {formatDistance(score.meanError)}
          </dd>
        </div>
        <div className="app-panel-muted app-kpi">
          <dt className="t-label">Mieux que le centre</dt>
          <dd className={`t-hero t-hero--md ${score.betterThanCenter * 2 >= score.rounds.length ? 't-pos' : 'text-gray-900'}`} data-testid="zone-summary-center">
            {score.betterThanCenter} / {score.rounds.length}
          </dd>
          <dd className="app-kpi__foot">parties</dd>
        </div>
        <div className={`app-panel-muted app-kpi ${finish ? '' : 'max-sm:col-span-2'}`}>
          <dt className="t-label">Mieux que la ligne</dt>
          <dd className={`t-hero t-hero--md ${score.betterThanLine * 2 >= score.rounds.length ? 't-pos' : 'text-gray-900'}`} data-testid="zone-summary-line">
            {score.betterThanLine} / {score.rounds.length}
          </dd>
          <dd className="app-kpi__foot">parties</dd>
        </div>
        {finish ? (
          <div className="app-panel-muted app-kpi" data-testid="zone-record-kpi">
            <dt className="t-label">Record perso</dt>
            <dd className={`t-hero t-hero--md ${record ? 't-gold' : 'text-gray-900'}`}>
              {formatDistance(record || finish.previousBest === null ? score.meanError : finish.previousBest)}
            </dd>
            <dd className="app-kpi__foot">
              {record ? (finish.previousBest === null ? 'première série' : `ancien : ${formatDistance(finish.previousBest)}`) : 'à battre'}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="app-panel-muted flex flex-col gap-2 p-3">
        <h4 className="t-label">Écart moyen à la zone finale</h4>
        {bars.map((bar) => (
          <div key={bar.key} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_auto] items-center gap-3">
            <span className={`t-body ${bar.accent ? 't-strong text-gray-900' : 'text-gray-700'}`}>{bar.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-[var(--theme-ui-border)]" aria-hidden="true">
              <span
                className={`block h-full rounded-full ${bar.accent ? 'bg-[var(--theme-ui-accent)]' : 'bg-[var(--theme-ui-text-muted)]'}`}
                style={{ width: `${(bar.value / scale) * 100}%` }}
              />
            </span>
            <b className="t-num text-[13px] text-gray-900">{formatDistance(bar.value)}</b>
          </div>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <div className="app-panel-muted app-kpi" data-testid="zone-summary-with-plane">
          <dt className="t-label flex items-center gap-1.5">
            <Plane className="h-3.5 w-3.5" aria-hidden="true" />
            Avec avion
          </dt>
          <dd className="t-hero t-hero--md text-gray-900">{score.withPlane.meanError === null ? '—' : formatDistance(score.withPlane.meanError)}</dd>
          <dd className="app-kpi__foot">
            {score.withPlane.rounds} partie{score.withPlane.rounds > 1 ? 's' : ''}
          </dd>
        </div>
        <div className="app-panel-muted app-kpi" data-testid="zone-summary-without-plane">
          <dt className="t-label flex items-center gap-1.5">
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            Sans avion
          </dt>
          <dd className="t-hero t-hero--md text-gray-900">
            {score.withoutPlane.meanError === null ? '—' : formatDistance(score.withoutPlane.meanError)}
          </dd>
          <dd className="app-kpi__foot">
            {score.withoutPlane.rounds} partie{score.withoutPlane.rounds > 1 ? 's' : ''}
          </dd>
        </div>
      </dl>

      {origin === 'visitor' && !authenticated ? (
        <p className="t-body text-gray-600" data-testid="zone-login-hint">
          <Link href="/login?redirect=/lecture-de-zone%3Ftab%3Dtraining" className="app-link">
            Connecte-toi
          </Link>{' '}
          pour enregistrer tes séries et entrer au classement du clan.
        </p>
      ) : origin === 'visitor' ? (
        <p className="t-body text-gray-600">Seuls les membres d’un clan enregistrent leurs séries.</p>
      ) : null}
    </div>
  )
}
