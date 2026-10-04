'use client'

import { ArrowRight, CircleCheckBig, Crosshair, Mountain, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

import SegmentedControl from '@/components/ui/SegmentedControl'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import {
  MORTAR_DIFFICULTIES,
  MORTAR_DIFFICULTY_RULES,
  MORTAR_RANGE,
  MORTAR_STEP,
  MORTAR_TARGETS_PER_SERIES,
  formatClock,
  formatMeters,
  impactPoint,
  landingDistance,
  requiredSetting,
  shotError,
  shotVerdict,
  type MortarDifficulty,
  type MortarTarget,
  type MortarVerdict,
} from '@/lib/mortar/mortar-game'
import {
  MORTAR_SLIDER_TICKS,
  elevationLabel,
  formatElevation,
  impactLabelPlacement,
  labelPlacement,
  seriesDots,
  sliderPercent,
  verdictLabel,
} from '@/lib/mortar/mortar-view'

import MortarLeaderboard from './MortarLeaderboard'
import MortarMap, { type MortarMapLine, type MortarMapMarker, type MortarMapTag } from './MortarMap'
import MortarSummary from './MortarSummary'
import { useMortarSeries, type MortarSeriesState } from './useMortarSeries'

/**
 * Onglet « Entraînement » de `/mortier` (maquette « Mortier : entraînement et guide ») : panneau de jeu à gauche
 * (difficulté, série, carte, réglage puis verdict, bilan), « Artilleurs du clan » à droite — empilés sur mobile.
 */

export const MORTAR_DIFFICULTY_OPTIONS = MORTAR_DIFFICULTIES.map((value) => ({ value, label: MORTAR_DIFFICULTY_RULES[value].label }))

const MAP_SIZES = '(min-width: 1024px) 680px, 100vw'

const VERDICT_TILE: Record<MortarVerdict, string> = {
  hit: 'bg-[var(--game-pos-soft)] text-[var(--game-pos)]',
  short: 'bg-[var(--game-neg-soft)] text-[var(--game-neg)]',
  long: 'bg-[var(--game-neg-soft)] text-[var(--game-neg)]',
}

/** Tuile du verdict : au but, trop court (l'obus retombe avant), trop long. */
function VerdictIcon({ verdict }: { verdict: MortarVerdict }) {
  if (verdict === 'hit') return <CircleCheckBig className="h-5 w-5" aria-hidden="true" />
  if (verdict === 'short') return <TrendingDown className="h-5 w-5" aria-hidden="true" />
  return <TrendingUp className="h-5 w-5" aria-hidden="true" />
}

const DOT_CLASS = {
  hit: 'bg-[var(--game-pos)]',
  miss: 'bg-[var(--game-neg)]',
  current: 'bg-[var(--theme-ui-accent)] shadow-[0_0_0_3px_var(--theme-ui-accent-soft)]',
  pending: 'bg-[var(--game-track)] shadow-[inset_0_0_0_1px_var(--theme-ui-border)]',
} as const

const DOT_LABEL = { hit: 'au but', miss: 'raté', current: 'en cours', pending: 'à venir' } as const

function targetLabel(target: MortarTarget) {
  return target.elevation === 0 ? 'Cible' : `Cible ${formatElevation(target.elevation)}`
}

/** Repères, ligne et cote de la carte : avant le tir (toi et la cible), après (trajectoire, distance, impact). */
function mapLayers(target: MortarTarget, setting: number | null, verdict: MortarVerdict | null) {
  const shooterPlacement = labelPlacement(target.shooter, target.target)
  const targetPlacement = labelPlacement(target.target, target.shooter)
  const markers: MortarMapMarker[] = [
    { key: 'shooter', kind: 'shooter', point: target.shooter, label: 'Toi', placement: shooterPlacement },
    { key: 'target', kind: 'target', point: target.target, label: targetLabel(target), placement: targetPlacement },
  ]
  const lines: MortarMapLine[] = []
  const tags: MortarMapTag[] = []
  if (setting !== null && verdict) {
    const impact = impactPoint(target, setting)
    // La ligne va jusqu'au plus loin des deux points : l'impact (trop long) ou la cible (trop court).
    const end = landingDistance(setting, target) > target.distance ? impact : target.target
    lines.push({ key: 'shot', from: target.shooter, to: end, variant: 'shot' })
    tags.push({
      key: 'distance',
      point: { x: (target.shooter.x + target.target.x) / 2, y: (target.shooter.y + target.target.y) / 2 },
      text: formatMeters(target.distance),
    })
    markers.push({
      key: 'impact',
      kind: verdict === 'hit' ? 'impact-hit' : 'impact-miss',
      point: impact,
      label: 'Impact',
      placement: impactLabelPlacement(target.shooter, target.target, impact, targetPlacement.side),
    })
  }
  return { markers, lines, tags }
}

function SeriesProgress({ series, elapsedMs }: { series: MortarSeriesState | null; elapsedMs: number }) {
  const verdicts = series
    ? series.shots.map((shot, index) => shotVerdict(shotError(shot.setting, series.targets[index]), series.difficulty))
    : []
  const current = series && series.phase === 'aiming' ? series.index : null
  const dots = seriesDots(verdicts, current, MORTAR_TARGETS_PER_SERIES)
  const shown = series ? (series.phase === 'summary' ? MORTAR_TARGETS_PER_SERIES : series.index + 1) : 1
  const hits = verdicts.filter((verdict) => verdict === 'hit').length

  return (
    <div className="flex items-center gap-3">
      <span className="t-label whitespace-nowrap">
        Série{' '}
        <span className="t-num text-gray-900" data-testid="mortar-series-count">
          {shown} / {MORTAR_TARGETS_PER_SERIES}
        </span>
      </span>
      <ol
        className="flex items-center gap-1"
        aria-label={`Tirs de la série : ${hits} au but, ${verdicts.length - hits} raté${verdicts.length - hits > 1 ? 's' : ''}`}
      >
        {dots.map((state, index) => (
          <li
            key={index}
            data-state={state}
            title={`Cible ${index + 1} : ${DOT_LABEL[state]}`}
            className={`block h-2.5 w-2.5 rounded-full ${DOT_CLASS[state]}`}
          />
        ))}
      </ol>
      <span role="timer" className="t-num flex items-center gap-1 whitespace-nowrap text-[13px] font-bold text-gray-900">
        <Timer className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
        <span className="sr-only">Temps de visée de la série : </span>
        {formatClock(elapsedMs)}
      </span>
    </div>
  )
}

function DistanceTicks() {
  return (
    <div className="relative h-4" aria-hidden="true">
      {MORTAR_SLIDER_TICKS.map((value, index) => {
        const first = index === 0
        const last = index === MORTAR_SLIDER_TICKS.length - 1
        return (
          <span
            key={value}
            className={`t-num absolute top-0 whitespace-nowrap text-[11px] font-semibold text-gray-500 ${first ? '' : last ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${sliderPercent(value)}%` }}
          >
            {last ? `${value} m` : value}
          </span>
        )
      })}
    </div>
  )
}

export default function MortarTraining({
  difficulty,
  round,
  onDifficulty,
  onReplay,
}: {
  difficulty: MortarDifficulty
  round: number
  onDifficulty: (difficulty: MortarDifficulty) => void
  onReplay: () => void
}) {
  const { clanId } = useSelectedClan()
  const { authenticated } = useAuthSession()
  const [boardToken, setBoardToken] = useState(0)
  const onRecorded = useCallback(() => setBoardToken((token) => token + 1), [])
  const { series, loading, elapsedMs, setSetting, nudge, fire, next } = useMortarSeries(difficulty, round, onRecorded)

  // Clavier : après le tir, « Cible suivante » prend le focus ; à la cible suivante, le curseur ; au bilan, « Rejouer ».
  const sliderRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const replayRef = useRef<HTMLButtonElement>(null)
  const focusAfter = useRef<'next' | 'slider' | 'replay' | null>(null)

  useEffect(() => {
    const wanted = focusAfter.current
    if (!wanted) return
    const element = wanted === 'next' ? nextRef.current : wanted === 'slider' ? sliderRef.current : replayRef.current
    if (!element) return
    focusAfter.current = null
    element.focus({ preventScroll: true })
  }, [series])

  const rules = MORTAR_DIFFICULTY_RULES[difficulty]
  const target = series ? series.targets[Math.min(series.index, series.targets.length - 1)] : null
  const shot = series && series.phase === 'result' ? series.shots[series.index] : null
  const error = shot && target ? shotError(shot.setting, target) : null
  const verdict = error !== null && series ? shotVerdict(error, series.difficulty) : null
  const lastShot = series ? series.shots.length >= MORTAR_TARGETS_PER_SERIES : false
  const elevationHint = target ? elevationLabel(target.elevation) : null

  function handleFire() {
    focusAfter.current = 'next'
    fire()
  }

  function handleNext() {
    focusAfter.current = lastShot ? 'replay' : 'slider'
    next()
  }

  function handleReplay() {
    focusAfter.current = 'slider'
    onReplay()
  }

  function handleSliderKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleFire()
      return
    }
    if (!event.shiftKey) return
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (direction === 0) return
    event.preventDefault()
    nudge(direction * MORTAR_STEP.coarse)
  }

  const layers = target && series && series.phase !== 'summary' ? mapLayers(target, shot?.setting ?? null, verdict) : null
  const mapLabel = target
    ? `Carte de Sanhok, grille de 100 m : toi et la cible${elevationHint ? ` (${elevationHint.toLowerCase()})` : ''}${
        verdict && error !== null ? `, impact ${verdictLabel(verdict, error).toLowerCase()}` : ''
      }`
    : ''

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-[18px]">
      <section aria-label="Entraînement au mortier" className="app-panel flex min-w-0 flex-col gap-3 p-3 sm:p-4" data-testid="mortar-game">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 max-sm:w-full">
            <div role="group" aria-label="Difficulté" className="flex max-sm:w-full">
              <SegmentedControl options={MORTAR_DIFFICULTY_OPTIONS} value={difficulty} onChange={onDifficulty} size="sm" fullWidthOnMobile />
            </div>
            <span className="t-meta whitespace-nowrap" data-testid="mortar-tolerance">
              Au but à ±{rules.tolerance} m
            </span>
          </div>
          <SeriesProgress series={loading ? null : series} elapsedMs={loading ? 0 : elapsedMs} />
        </div>

        {series?.origin === 'offline' && !loading ? (
          <p className="t-meta">Serveur injoignable : cette série se joue sans être enregistrée.</p>
        ) : null}

        {/* Annonce du verdict pour un lecteur d'écran (la zone visible est remplacée à chaque tir). */}
        <p className="sr-only" aria-live="polite">
          {verdict && error !== null ? verdictLabel(verdict, error) : ''}
        </p>

        {!series ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Préparation de la série">
            <div className="bg-map-fallback aspect-[5/3] w-full animate-pulse rounded-[10px]" />
            <div className="h-16 w-full animate-pulse rounded-[10px] bg-gray-100" />
          </div>
        ) : (
          <div className={`flex flex-col gap-3 transition-opacity ${loading ? 'pointer-events-none opacity-60' : ''}`} aria-busy={loading}>
            {series.phase === 'summary' ? (
              <MortarSummary
                difficulty={series.difficulty}
                origin={series.origin}
                summary={series.summary}
                authenticated={authenticated}
                onReplay={handleReplay}
                replayRef={replayRef}
              />
            ) : (
              <>
                {layers ? (
                  <MortarMap
                    markers={layers.markers}
                    lines={layers.lines}
                    tags={layers.tags}
                    scaleBar
                    label={mapLabel}
                    sizes={MAP_SIZES}
                    priority
                    testId="mortar-map"
                  />
                ) : null}

                {series.phase === 'aiming' ? (
                  <div className="flex flex-col gap-2">
                    <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                      <div className="flex items-end justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
                        <div className="flex flex-col gap-1">
                          <label htmlFor="mortar-distance" className="t-label">
                            Distance
                          </label>
                          {/* Largeur figée : Teko n'a pas de chiffres à chasse fixe (« 171 m » 76 px, « 400 m » 92 px) ; sans elle, le
                              curseur voisin tremble à chaque mètre. 6 rem couvre la valeur la plus large à 40 px. */}
                          <output htmlFor="mortar-distance" className="t-hero t-hero--lg inline-block w-[6rem] whitespace-nowrap text-gray-900" data-testid="mortar-setting">
                            {formatMeters(series.setting)}
                          </output>
                        </div>
                        {elevationHint ? (
                          <p className="t-meta flex items-center gap-1.5 whitespace-nowrap" data-testid="mortar-elevation">
                            <Mountain className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {elevationHint}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <input
                          ref={sliderRef}
                          id="mortar-distance"
                          type="range"
                          min={MORTAR_RANGE.min}
                          max={MORTAR_RANGE.max}
                          step={MORTAR_STEP.fine}
                          value={series.setting}
                          onChange={(event) => setSetting(Number(event.target.value))}
                          onKeyDown={handleSliderKey}
                          aria-valuetext={formatMeters(series.setting)}
                          aria-describedby="mortar-keys"
                          className="h-8 w-full cursor-pointer accent-[var(--theme-ui-accent)]"
                        />
                        <DistanceTicks />
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => nudge(-MORTAR_STEP.coarse)} className="app-btn app-btn--md app-btn--secondary t-num min-w-[3.25rem]">
                          −25
                        </button>
                        <button type="button" onClick={() => nudge(MORTAR_STEP.coarse)} className="app-btn app-btn--md app-btn--secondary t-num min-w-[3.25rem]">
                          +25
                        </button>
                        <button type="button" onClick={handleFire} className="app-btn app-btn--md app-btn--primary flex-1 gap-2 sm:flex-none">
                          <Crosshair className="h-4 w-4" aria-hidden="true" />
                          Tirer
                        </button>
                      </div>
                    </div>
                    <p id="mortar-keys" className="t-meta max-sm:hidden">
                      Flèches : ±1 m · Maj + flèche : ±25 m · Entrée : tirer
                    </p>
                  </div>
                ) : null}

                {series.phase === 'result' && shot && target && verdict && error !== null ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="mortar-result" data-verdict={verdict}>
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] ${VERDICT_TILE[verdict]}`}>
                        <VerdictIcon verdict={verdict} />
                      </span>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <p className={`t-hero t-hero--md uppercase ${verdict === 'hit' ? 't-pos' : 't-neg'}`} data-testid="mortar-verdict">
                          {verdictLabel(verdict, error)}
                        </p>
                        <dl className="flex flex-wrap gap-x-5 gap-y-1">
                          <div className="flex flex-col">
                            <dt className="t-label">Ton tir</dt>
                            <dd className="t-num text-[15px] font-bold text-gray-900" data-testid="mortar-shot-setting">
                              {formatMeters(shot.setting)}
                            </dd>
                          </div>
                          <div className="flex flex-col">
                            <dt className="t-label">Distance</dt>
                            <dd className="t-num text-[15px] font-bold text-gray-900" data-testid="mortar-shot-distance">
                              {formatMeters(target.distance)}
                            </dd>
                          </div>
                          <div className="flex flex-col">
                            <dt className="t-label">Écart</dt>
                            <dd className={`t-num text-[15px] font-bold ${verdict === 'hit' ? 't-pos' : 't-neg'}`} data-testid="mortar-shot-error">
                              {formatMeters(error, { signed: true })}
                            </dd>
                          </div>
                        </dl>
                        {target.elevation !== 0 ? (
                          <p className="t-meta flex items-center gap-1.5" data-testid="mortar-shot-ideal">
                            <Mountain className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Dénivelé {formatElevation(target.elevation)} : il fallait {formatMeters(requiredSetting(target))}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <button ref={nextRef} type="button" onClick={handleNext} className="app-btn app-btn--md app-btn--primary shrink-0 gap-2">
                      {lastShot ? 'Voir le bilan' : 'Cible suivante'}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </section>

      <MortarLeaderboard clanId={clanId} difficulty={difficulty} reloadToken={boardToken} />
    </div>
  )
}
