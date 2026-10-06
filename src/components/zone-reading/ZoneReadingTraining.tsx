'use client'

import { ArrowRight, CircleCheckBig, CircleDashed, CircleX, EyeOff, MapPin, Plane, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

import { mapLabel } from '@/components/maps/MapToolbarControls'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuthSession } from '@/hooks/useAuthSession'
import { ZONE_READING_MODE_LABELS, type ZoneReadingMode } from '@/lib/zone-reading/zone-reading-api'
import {
  ROUND_VERDICT_LABELS,
  ZONE_READING_ROUNDS,
  ZONE_READING_STEPS,
  formatDistance,
  roundVerdict,
  type ZoneReadingRoundVerdict,
} from '@/lib/zone-reading/zone-reading-game'
import type { Circle, Point } from '@/lib/zone-reading/zone-reading-geometry'

import ZoneReadingLeaderboard from './ZoneReadingLeaderboard'
import { ZoneReadingMapFrame, placeAt, pointFromEvent, toUnits } from './ZoneReadingMapFrame'
import ZoneReadingSummary from './ZoneReadingSummary'
import { useZoneReadingSeries, type ZoneReadingSeriesState } from './useZoneReadingSeries'

/**
 * Onglet « Entraînement » de la Lecture de zone (docs/features/lecture-de-zone.md) : panneau de jeu à gauche (série,
 * carte, étape, révélation, bilan), classement du clan à droite — empilés sur mobile. Une seule épreuve, « Où finit la
 * zone ? » : l'exercice « Sens de fermeture » de la maquette a été retiré, le cercle suivant se plaçant au hasard
 * (13 % de bonnes réponses sur 8 secteurs, mesure du 2026-10-06).
 */

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

const PIP_CLASS: Record<ZoneReadingRoundVerdict | 'current' | 'pending', string> = {
  both: 'bg-[var(--game-pos)]',
  one: 'bg-[var(--game-warn)]',
  none: 'bg-[var(--game-neg)]',
  current: 'bg-[var(--theme-ui-accent)] shadow-[0_0_0_3px_var(--theme-ui-accent-soft)]',
  pending: 'bg-[var(--game-track)] shadow-[inset_0_0_0_1px_var(--theme-ui-border)]',
}

const PIP_LABEL: Record<ZoneReadingRoundVerdict | 'current' | 'pending', string> = {
  both: 'mieux que les deux repères',
  one: 'un repère faisait mieux',
  none: 'les deux repères faisaient mieux',
  current: 'en cours',
  pending: 'à venir',
}

const VERDICT_TILE: Record<ZoneReadingRoundVerdict, string> = {
  both: 'bg-[var(--game-pos-soft)] text-[var(--game-pos)]',
  one: 'bg-[var(--theme-ui-accent-tint)] t-accent',
  none: 'bg-[var(--game-neg-soft)] text-[var(--game-neg)]',
}

function SeriesPips({ series }: { series: ZoneReadingSeriesState }) {
  return (
    <ol className="flex items-center gap-1" aria-label="Parties de la série">
      {Array.from({ length: ZONE_READING_ROUNDS }, (_, index) => {
        const outcome = series.outcomes[index]
        const state = outcome ? outcome.verdict : index === series.roundIndex && !series.showSummary ? 'current' : 'pending'
        return (
          <li key={index} data-state={state} className={`h-1.5 w-3 rounded-full sm:w-3.5 ${PIP_CLASS[state]}`}>
            <span className="sr-only">
              Partie {index + 1} : {PIP_LABEL[state]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Chip({ icon, children, testId }: { icon: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900" data-testid={testId}>
      {icon}
      {children}
    </span>
  )
}

function CircleShape({ circle, mapSize, tone }: { circle: Circle; mapSize: number; tone: 'current' | 'past' }) {
  return (
    <circle
      cx={toUnits(circle.x, mapSize)}
      cy={toUnits(circle.y, mapSize)}
      r={toUnits(circle.r, mapSize)}
      fill="none"
      stroke="white"
      strokeOpacity={tone === 'current' ? 0.95 : 0.35}
      strokeWidth={tone === 'current' ? 2 : 1.2}
      vectorEffect="non-scaling-stroke"
    />
  )
}

function Marker({ point, mapSize, label, tone }: { point: Point; mapSize: number; label: string; tone: 'you' | 'final' }) {
  return (
    <span className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center" style={placeAt(point, mapSize)}>
      <span className={`mb-0.5 rounded px-1 text-[11px] font-bold leading-4 ${tone === 'you' ? 'bg-slate-950/75 text-[var(--theme-ui-accent)]' : 'bg-slate-950/75 text-[var(--game-pos)]'}`}>
        {label}
      </span>
      {tone === 'you' ? (
        <MapPin className="h-6 w-6 fill-slate-950/60 text-[var(--theme-ui-accent)] drop-shadow" aria-hidden="true" />
      ) : (
        <span className="mb-[-7px] block h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--game-pos)] shadow-[0_0_0_5px_rgb(16_185_129_/_0.35)]" />
      )}
    </span>
  )
}

/** Carte jouable : cercles dévoilés, ligne de vol (une partie sur deux), marqueur ; à la révélation, la zone finale et le
 *  chemin du marqueur, étape par étape. Clic ou toucher pour placer ; au clavier, flèches (Maj : pas de 5 %), Entrée. */
function GameMap({
  series,
  onPlace,
  onAdvance,
}: {
  series: ZoneReadingSeriesState
  onPlace: (point: Point) => void
  onAdvance: () => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  const roundInfo = series.rounds[series.roundIndex]
  const reveal = series.reveal
  const size = series.mapSizeMeters
  const line = reveal ? reveal.line : roundInfo?.line ?? null
  const circles = reveal ? reveal.circles : series.circles
  const playing = !reveal
  const steps = reveal?.score.steps ?? []

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    down.current = { x: event.clientX, y: event.clientY }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = down.current
    down.current = null
    if (!playing || !start || !frameRef.current) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return
    onPlace(pointFromEvent(event, frameRef.current, size))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!playing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      onAdvance()
      return
    }
    const delta = (event.shiftKey ? 0.05 : 0.01) * size
    const moves: Record<string, Point> = { ArrowLeft: { x: -delta, y: 0 }, ArrowRight: { x: delta, y: 0 }, ArrowUp: { x: 0, y: -delta }, ArrowDown: { x: 0, y: delta } }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    const from = series.guess ?? circles[circles.length - 1] ?? { x: size / 2, y: size / 2 }
    const clamp = (value: number) => Math.max(0, Math.min(size, value))
    onPlace({ x: clamp(from.x + move.x), y: clamp(from.y + move.y) })
  }

  const heading = line ? ((Math.atan2(line.end.x - line.start.x, -(line.end.y - line.start.y)) * 180) / Math.PI + 360) % 360 : 0
  const plane = line ? { x: line.start.x + (line.end.x - line.start.x) * 0.1, y: line.start.y + (line.end.y - line.start.y) * 0.1 } : null

  return (
    <ZoneReadingMapFrame
      mapName={series.mapName}
      frameRef={frameRef}
      interactive={playing}
      testId="zone-game-map"
      ariaLabel={
        playing
          ? `Carte ${mapLabel(series.mapName)} : place ton marqueur là où la partie finira (flèches pour le déplacer, Entrée pour valider)`
          : `Carte ${mapLabel(series.mapName)} : zone finale révélée`
      }
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      svg={
        <>
          {line ? (
            <line
              x1={toUnits(line.start.x, size)}
              y1={toUnits(line.start.y, size)}
              x2={toUnits(line.end.x, size)}
              y2={toUnits(line.end.y, size)}
              stroke="var(--theme-ui-accent)"
              strokeWidth={2.5}
              strokeOpacity={reveal && !roundInfo?.withPlane ? 0.55 : 1}
              strokeDasharray={reveal && !roundInfo?.withPlane ? '8 6' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {circles.map((circle, index) => (
            <CircleShape key={index} circle={circle} mapSize={size} tone={playing && index === circles.length - 1 ? 'current' : 'past'} />
          ))}
          {steps.length > 1 ? (
            <polyline
              points={steps.map((step) => `${toUnits(step.guess.x, size)},${toUnits(step.guess.y, size)}`).join(' ')}
              fill="none"
              stroke="var(--theme-ui-accent)"
              strokeOpacity={0.8}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </>
      }
      overlay={
        <>
          {plane ? (
            <span className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-slate-950/70 text-[var(--theme-ui-accent)] shadow" style={placeAt(plane, size)}>
              <Plane className="h-4 w-4" style={{ transform: `rotate(${heading - 45}deg)` }} aria-hidden="true" />
            </span>
          ) : null}
          {playing ? (
            <span className="absolute left-1/2 top-2.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-[var(--theme-ui-accent-ring)] bg-slate-950/80 px-3 py-1 text-xs font-bold text-[var(--theme-ui-accent)]">
              <span className="hidden sm:inline">Clique</span>
              <span className="sm:hidden">Touche</span> pour {series.guess ? 'déplacer' : 'placer'} ton marqueur
            </span>
          ) : null}
          {steps.slice(0, -1).map((step) => (
            <span
              key={step.circle}
              className="t-num absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--theme-ui-accent)] bg-slate-950/80 text-[10px] font-bold text-[var(--theme-ui-accent)]"
              style={placeAt(step.guess, size)}
              aria-hidden="true"
            >
              {step.circle}
            </span>
          ))}
          {reveal ? <Marker point={reveal.final} mapSize={size} label="Zone finale" tone="final" /> : null}
          {playing && series.guess ? <Marker point={series.guess} mapSize={size} label="Toi" tone="you" /> : null}
          {reveal && steps.length > 0 ? <Marker point={steps[steps.length - 1].guess} mapSize={size} label="Toi" tone="you" /> : null}
        </>
      }
    />
  )
}

function RevealPanel({ series, onNext }: { series: ZoneReadingSeriesState; onNext: () => void }) {
  const reveal = series.reveal
  const nextRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [reveal])
  if (!reveal) return null
  const score = reveal.score
  const verdict = roundVerdict(score)
  const last = series.roundIndex === ZONE_READING_ROUNDS - 1
  const Icon = verdict === 'both' ? CircleCheckBig : verdict === 'none' ? CircleX : CircleDashed

  return (
    <div className="flex flex-col gap-3" data-testid="zone-reveal">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${VERDICT_TILE[verdict]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
          <b className={`t-hero t-hero--md uppercase ${verdict === 'both' ? 't-pos' : 'text-gray-900'}`} data-testid="zone-reveal-score">
            {formatDistance(score.you)} d’écart moyen
          </b>
          <span className="t-body text-gray-700" data-testid="zone-reveal-verdict">
            {ROUND_VERDICT_LABELS[verdict]}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {[
          { key: 'you', label: 'Toi', value: score.you },
          { key: 'center', label: 'Centre', value: score.center },
          { key: 'line', label: 'Ligne', value: score.line },
        ].map((entry) => (
          <div
            key={entry.key}
            className={`app-panel-muted app-kpi ${entry.key === 'you' ? 'shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]' : ''}`}
            data-testid={`zone-reveal-${entry.key}`}
          >
            <dt className="t-label">{entry.label}</dt>
            <dd className={`t-num text-[17px] font-extrabold ${entry.key === 'you' ? 't-accent' : 'text-gray-900'}`}>{formatDistance(entry.value)}</dd>
          </div>
        ))}
      </dl>
      <div className="app-table-shell overflow-hidden">
        <table className="w-full table-auto text-[13px]">
          <caption className="sr-only">Écart à la zone finale à chaque cercle</caption>
          <thead className="app-table-head">
            <tr>
              <th scope="col" className="t-label py-1.5 pl-3 text-left">
                Étape
              </th>
              <th scope="col" className="t-label px-[9px] py-1.5 text-right">
                Toi
              </th>
              <th scope="col" className="t-label px-[9px] py-1.5 text-right">
                Centre
              </th>
              <th scope="col" className="t-label py-1.5 pl-[9px] pr-3 text-right">
                Ligne
              </th>
            </tr>
          </thead>
          <tbody>
            {score.steps.map((step) => (
              <tr key={step.circle} className="app-table-row last:border-b-0" data-testid="zone-reveal-step">
                <td className="py-1.5 pl-3 font-semibold text-gray-900">Cercle {step.circle}</td>
                <td className={`t-num px-[9px] py-1.5 text-right font-bold ${step.you < Math.min(step.centerError, step.lineError) ? 't-pos' : 'text-gray-900'}`}>
                  {formatDistance(step.you)}
                </td>
                <td className="t-num px-[9px] py-1.5 text-right text-gray-700">{formatDistance(step.centerError)}</td>
                <td className="t-num py-1.5 pl-[9px] pr-3 text-right text-gray-700">{formatDistance(step.lineError)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button ref={nextRef} type="button" onClick={onNext} className="app-btn app-btn--md app-btn--primary w-fit gap-2">
        {last ? 'Voir le bilan' : 'Partie suivante'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export default function ZoneReadingTraining({
  mapName,
  mode,
  period,
  clanId,
  round,
  onReplay,
}: {
  mapName: string
  mode: ZoneReadingMode
  period: string
  clanId: number | null
  round: number
  onReplay: () => void
}) {
  const { authenticated } = useAuthSession()
  const { series, loading, error, stepError, pending, place, advance, next } = useZoneReadingSeries({
    mapName,
    mode,
    period,
    clanId,
    round,
    enabled: Boolean(mapName),
  })
  // Classement rechargé à chaque nouvelle série et quand une série enregistrée se termine.
  const reloadToken = round * 2 + (series?.summary?.finish ? 1 : 0)
  const replayRef = useRef<HTMLButtonElement>(null)

  const roundInfo = series ? series.rounds[series.roundIndex] : null
  const showSummary = Boolean(series?.showSummary && series.summary)

  return (
    <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="app-panel flex min-w-0 flex-col gap-3 p-3 sm:p-4" aria-label="Où finit la zone ?" data-testid="zone-game">
        {!mapName ? (
          <p className="t-body text-gray-600">Aucune partie analysée pour ce mode et cette période.</p>
        ) : error ? (
          <p className="t-body flex items-start gap-2 text-gray-700" data-testid="zone-game-error">
            <TriangleAlert className="t-warn mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : loading || !series || !roundInfo ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Préparation de la série">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="aspect-square w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="t-label whitespace-nowrap">
                Série{' '}
                <b className="t-num text-[13px] text-gray-900" data-testid="zone-series-count">
                  {showSummary ? ZONE_READING_ROUNDS : series.roundIndex + 1} / {ZONE_READING_ROUNDS}
                </b>
              </span>
              <SeriesPips series={series} />
              <Chip icon={<CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />} testId="zone-step-chip">
                {showSummary ? 'Bilan' : series.reveal ? 'Zone finale' : `Cercle ${series.step} / ${ZONE_READING_STEPS}`}
              </Chip>
              {!showSummary ? (
                <Chip
                  icon={roundInfo.withPlane ? <Plane className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                  testId="zone-plane-chip"
                >
                  {roundInfo.withPlane ? 'Avec avion' : 'Sans avion'}
                </Chip>
              ) : null}
              <span className="t-meta ml-auto" data-testid="zone-round-meta">
                Partie du {dateFormat.format(new Date(roundInfo.matchDate))} · {mapLabel(series.mapName)} · {ZONE_READING_MODE_LABELS[roundInfo.mode]}
              </span>
            </div>

            {showSummary && series.summary ? (
              <ZoneReadingSummary
                score={series.summary.score}
                finish={series.summary.finish}
                origin={series.origin}
                authenticated={authenticated}
                onReplay={onReplay}
                replayRef={replayRef}
              />
            ) : (
              <>
                <GameMap series={series} onPlace={place} onAdvance={() => void advance()} />
                {series.reveal ? (
                  <RevealPanel series={series} onNext={next} />
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="t-body text-gray-700" data-testid="zone-step-hint">
                      {!series.guess
                        ? 'Pose ton marqueur là où tu penses que la partie finira.'
                        : series.step === 1
                          ? 'Dévoile les cercles un par un : ton marqueur est noté à chaque cercle, tu peux le déplacer.'
                          : `Cercle ${series.step} dévoilé. Déplace ton marqueur si besoin.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => void advance()}
                      disabled={!series.guess || pending}
                      className="app-btn app-btn--md app-btn--primary shrink-0 gap-2"
                    >
                      {series.step < ZONE_READING_STEPS ? `Dévoiler le cercle ${series.step + 1}` : 'Voir la zone finale'}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
                {stepError ? (
                  <p className="t-body flex items-start gap-2 text-[var(--theme-ui-negative)]" role="alert">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {stepError}
                  </p>
                ) : null}
              </>
            )}
            <p className="t-meta" data-testid="zone-series-source">
              Une partie sur deux sans la ligne de vol : le bilan compare tes écarts avec et sans l’avion.{' '}
              {series.source === 'clan' ? 'Parties jouées par le clan.' : 'Parties de tout le site : le clan n’en a pas assez sur cette carte.'}
            </p>
          </>
        )}
      </section>

      <ZoneReadingLeaderboard clanId={clanId} mapName={mapName} reloadToken={reloadToken} />
    </div>
  )
}
