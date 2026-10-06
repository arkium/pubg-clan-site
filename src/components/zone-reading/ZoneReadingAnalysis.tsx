'use client'

import { Hourglass, Info, Lightbulb } from 'lucide-react'
import { useMemo, useState } from 'react'

import { mapLabel } from '@/components/maps/MapToolbarControls'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { ZoneReadingAnalysis as ZoneReadingAnalysisPayload } from '@/lib/zone-reading/zone-reading-api'
import {
  ZONE_READING_BAND_METERS,
  ZONE_READING_GUIDED_SHARE,
  bandExplanation,
  bandHeadline,
  bestAim,
  closingVerdict,
  entriesNearAxis,
  finalOfEntry,
  finalZoneGrid,
  gridCellSizeMeters,
  practicalRule,
  topGridCells,
  type ZoneReadingStats,
} from '@/lib/zone-reading/zone-reading-analysis'
import { formatDistance } from '@/lib/zone-reading/zone-reading-game'
import type { Axis } from '@/lib/zone-reading/zone-reading-geometry'

import { AxisControls, ZoneReadingAxisMap } from './ZoneReadingAxisMap'

/**
 * Onglet « Analyse » de la Lecture de zone (docs/features/lecture-de-zone.md) : quatre blocs dont chaque titre et chaque
 * verdict est calculé (`zone-reading-analysis.ts`). L'axe du C-130 est partagé par le bloc 01 et la grille du bloc 04 :
 * le tourner dans l'un le tourne dans l'autre.
 */

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const percent = (value: number) => `${Math.round(value * 100)} %`
/** Points affichés au plus sur la carte du bloc 01 : au-delà, la carte devient une tache. */
const MAX_DOTS = 400

function SectionHeader({ number, title, meta, id }: { number: string; title: string; meta?: string; id: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="t-label t-num">{number}</span>
      <h2 id={id} className="t-section-title">
        {title}
      </h2>
      {meta ? <span className="t-meta">{meta}</span> : null}
    </div>
  )
}

function KeyFigure({ value, caption, testId }: { value: string; caption: string; testId: string }) {
  return (
    <div className="app-panel-muted flex items-center gap-3 px-3.5 py-2.5" data-testid={testId}>
      <b className="t-hero t-hero--md min-w-[84px] shrink-0 text-gray-900">{value}</b>
      <span className="t-body text-gray-700">{caption}</span>
    </div>
  )
}

function PlaneAndZone({
  payload,
  stats,
  axis,
  onAxisChange,
}: {
  payload: ZoneReadingAnalysisPayload & { mapName: string }
  stats: ZoneReadingStats
  axis: Axis
  onAxisChange: (axis: Axis) => void
}) {
  const near = useMemo(() => entriesNearAxis(payload.axes, axis, payload.mapSizeMeters), [payload.axes, payload.mapSizeMeters, axis])
  const dots = useMemo(() => near.slice(0, MAX_DOTS).map(finalOfEntry), [near])
  const random = stats.crossesFirstRandomShare

  return (
    <section className="app-panel flex flex-col gap-4 p-3 sm:p-4" aria-labelledby="zone-reading-plane-title">
      <SectionHeader number="01" id="zone-reading-plane-title" title="L’avion et la zone" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2.5">
          <ZoneReadingAxisMap
            mapName={payload.mapName}
            mapLabel={mapLabel(payload.mapName)}
            mapSize={payload.mapSizeMeters}
            axis={axis}
            onAxisChange={onAxisChange}
            dots={dots}
            draggable
            testId="zone-reading-axis-map"
          />
          <ul className="t-meta flex flex-wrap gap-x-4 gap-y-1" aria-label="Légende">
            <li className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[var(--theme-ui-accent)]" aria-hidden="true" />
              Ligne de vol
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-3.5 rounded-sm border border-[var(--theme-ui-accent)] bg-[var(--theme-ui-accent-soft)]" aria-hidden="true" />
              Bande de {ZONE_READING_BAND_METERS} m de chaque côté
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border border-gray-500 bg-white" aria-hidden="true" />
              Zone finale d’une partie
            </li>
          </ul>
          <AxisControls
            axis={axis}
            mapSize={payload.mapSizeMeters}
            onAxisChange={onAxisChange}
            nearCount={near.length}
            hint="Glisse la poignée jaune pour tourner l’avion, la bande pour la déplacer."
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <p className="t-hero t-hero--lg uppercase text-gray-900" data-testid="zone-reading-headline">
            {bandHeadline(stats)}
          </p>
          <p className="t-body text-gray-700" data-testid="zone-reading-band-explanation">
            {bandExplanation(stats)}
          </p>
          <div className="flex flex-col gap-2">
            <KeyFigure
              testId="figure-final-line"
              value={formatDistance(stats.finalLineMedian)}
              caption="distance médiane entre la zone finale et la ligne de vol"
            />
            <KeyFigure
              testId="figure-crosses-first"
              value={percent(stats.crossesFirstShare)}
              caption={`des parties : la ligne de vol traverse le premier cercle${random === null ? '' : ` (${percent(random)} avec la ligne d’une autre partie)`}`}
            />
            <KeyFigure
              testId="figure-first-center"
              value={formatDistance(stats.firstCenterLineMedian)}
              caption="distance médiane du premier centre à la ligne"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function ClosingDirection({ stats }: { stats: ZoneReadingStats }) {
  const bars = stats.closing.filter((bar) => bar.total > 0)
  return (
    <section className="app-panel flex flex-col gap-3 p-3 sm:p-4" aria-labelledby="zone-reading-closing-title">
      <SectionHeader number="02" id="zone-reading-closing-title" title="Sens de fermeture" />
      <p className="t-card-title" data-testid="zone-reading-closing-verdict">
        {closingVerdict(stats)}
      </p>
      <div className="relative mt-5 h-40" role="list" aria-label="Part des cercles plus proches de la ligne de vol que le précédent">
        {/* Repère 50 % : le hasard. */}
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-400" style={{ bottom: '50%' }} aria-hidden="true" />
        <div className="relative flex h-full items-end gap-1.5 sm:gap-2">
          {bars.map((bar) => {
            const guided = bar.share >= ZONE_READING_GUIDED_SHARE
            return (
              <div key={bar.circle} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" data-testid="closing-bar" aria-label={`Cercle ${bar.circle} : ${percent(bar.share)}`}>
                <span className={`t-num text-xs font-bold ${guided ? 't-accent' : 'text-gray-700'}`}>{percent(bar.share)}</span>
                <div
                  className={`w-full rounded-t-[6px] ${guided ? 'bg-[var(--theme-ui-accent)]' : 'bg-[var(--theme-ui-border)]'}`}
                  style={{ height: `${Math.max(2, bar.share * 100)}%` }}
                  data-guided={guided ? 'true' : 'false'}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex gap-1.5 sm:gap-2" aria-hidden="true">
        {bars.map((bar) => (
          <span key={bar.circle} className="t-meta t-num flex-1 text-center">
            C{bar.circle}
          </span>
        ))}
      </div>
      <p className="t-meta">
        Part des cercles plus proches de la ligne de vol que le précédent, du cercle 2 au cercle {bars.at(-1)?.circle ?? 8}.{' '}
        <span className="whitespace-nowrap">
          <span className="mr-1 inline-block w-4 border-t border-dashed border-gray-400 align-middle" aria-hidden="true" />
          50 % = hasard
        </span>
      </p>
    </section>
  )
}

function PracticalRule({ stats }: { stats: ZoneReadingStats }) {
  const rows = stats.rule.filter((row) => row.total > 0)
  return (
    <section className="app-panel flex flex-col gap-3 p-3 sm:p-4" aria-labelledby="zone-reading-rule-title">
      <SectionHeader number="03" id="zone-reading-rule-title" title="La règle pratique" />
      <p className="flex items-start gap-2.5 rounded-[10px] border border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-tint)] px-3 py-2.5" data-testid="zone-reading-rule">
        <Lightbulb className="t-accent mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <b className="t-card-title">{practicalRule(rows)}</b>
      </p>
      <div className="app-table-shell overflow-hidden">
        <table className="w-full table-auto text-[13px]">
          <caption className="sr-only">Erreur médiane sur la position de la zone finale selon le repère visé</caption>
          <thead className="app-table-head">
            <tr>
              <th scope="col" className="t-label py-2 pl-3 text-left">
                Depuis
              </th>
              <th scope="col" className="t-label px-[9px] py-2 text-right">
                Viser le centre
              </th>
              <th scope="col" className="t-label py-2 pl-[9px] pr-3 text-right">
                Viser la ligne
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const best = bestAim(row)
              return (
                <tr key={row.circle} className="app-table-row last:border-b-0" data-testid="rule-row" data-best={best}>
                  <td className="py-2 pl-3 font-semibold text-gray-900">Cercle {row.circle}</td>
                  <td className={`t-num px-[9px] py-2 text-right font-bold ${best === 'center' ? 't-pos' : 'text-gray-700'}`}>
                    {formatDistance(row.center)}
                  </td>
                  <td className={`t-num py-2 pl-[9px] pr-3 text-right font-bold ${best === 'line' ? 't-pos' : 'text-gray-700'}`}>
                    {formatDistance(row.line)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="t-meta">Erreur médiane sur la position de la zone finale. En vert, le meilleur choix.</p>
    </section>
  )
}

type GridScope = 'all' | 'axis'

const GRID_SCOPES: Array<{ value: GridScope; label: string }> = [
  { value: 'all', label: 'Toutes les parties' },
  { value: 'axis', label: 'Selon l’axe' },
]

function WhereItEnds({
  payload,
  axis,
  onAxisChange,
}: {
  payload: ZoneReadingAnalysisPayload & { mapName: string }
  axis: Axis
  onAxisChange: (axis: Axis) => void
}) {
  const [scope, setScope] = useState<GridScope>('all')
  const entries = useMemo(
    () => (scope === 'axis' ? entriesNearAxis(payload.axes, axis, payload.mapSizeMeters) : payload.axes),
    [scope, payload.axes, payload.mapSizeMeters, axis]
  )
  const grid = useMemo(() => finalZoneGrid(entries.map(finalOfEntry), payload.mapSizeMeters), [entries, payload.mapSizeMeters])
  const top = useMemo(() => topGridCells(grid), [grid])
  const max = Math.max(0, ...grid)
  const cell = gridCellSizeMeters(payload.mapSizeMeters)
  const cellLabel = cell >= 1000 ? `${integer.format(Math.round(cell / 1000))} km` : formatDistance(cell)

  return (
    <section className="app-panel flex flex-col gap-4 p-3 sm:p-4" aria-labelledby="zone-reading-grid-title">
      <SectionHeader number="04" id="zone-reading-grid-title" title="Où finit la zone" meta={`Fins de partie par case de ${cellLabel}`} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2.5">
          <ZoneReadingAxisMap
            mapName={payload.mapName}
            mapLabel={mapLabel(payload.mapName)}
            mapSize={payload.mapSizeMeters}
            axis={axis}
            onAxisChange={onAxisChange}
            showAxis={scope === 'axis'}
            grid={grid}
            testId="zone-reading-grid-map"
          />
          <div role="group" aria-label="Parties de la grille">
            <SegmentedControl options={GRID_SCOPES} value={scope} onChange={setScope} size="sm" />
          </div>
          {scope === 'axis' ? <AxisControls axis={axis} mapSize={payload.mapSizeMeters} onAxisChange={onAxisChange} nearCount={entries.length} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1" aria-hidden="true">
            <div className="h-2 rounded-full bg-gradient-to-r from-[var(--theme-ui-accent-soft)] to-[var(--theme-ui-accent)]" />
            <div className="t-meta t-num flex justify-between">
              <span>0</span>
              <span>{integer.format(max)} fins</span>
            </div>
          </div>
          <h3 className="t-label">Cases les plus fréquentes</h3>
          {top.length === 0 ? (
            <p className="t-body text-gray-600">Aucune partie avec une ligne de vol proche de cet axe : tourne ou déplace l’avion.</p>
          ) : (
            <ol className="flex flex-col gap-1.5" aria-label="Cases les plus fréquentes">
              {top.map((entry) => (
                <li key={entry.index} className="app-panel-muted flex items-center gap-3 px-3 py-2" data-testid="top-cell">
                  <b className="t-num w-9 shrink-0 text-[13px] font-extrabold text-gray-900">{entry.code}</b>
                  <span className="t-body min-w-0 flex-1 truncate text-gray-700">{payload.cellLabels[entry.index] || '—'}</span>
                  <b className="t-num shrink-0 text-[13px] text-gray-900">
                    {integer.format(entry.count)} fin{entry.count > 1 ? 's' : ''}
                  </b>
                </li>
              ))}
            </ol>
          )}
          <p className="t-meta flex items-start gap-1.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Zone finale : le dernier cercle stable atteint avant la fin de la partie.
          </p>
        </div>
      </div>
    </section>
  )
}

/** Carte sous le seuil : le compteur et un raccourci vers la carte la plus jouée, à la place des chiffres. */
export function ZoneReadingNotEnough({
  payload,
  onSelectMap,
}: {
  payload: ZoneReadingAnalysisPayload
  onSelectMap: (mapName: string) => void
}) {
  const label = payload.mapName ? mapLabel(payload.mapName) : 'cette carte'
  const best = payload.mapOptions.find((option) => option.mapName !== payload.mapName && option.matches >= payload.threshold)
  const progress = Math.min(1, payload.matchCount / payload.threshold)
  return (
    <section className="app-panel flex items-start gap-3 border-dashed p-4" data-testid="zone-reading-not-enough" aria-labelledby="zone-reading-not-enough-title">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--theme-ui-surface-strong)] text-gray-700">
        <Hourglass className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 id="zone-reading-not-enough-title" className="t-section-title">
          Pas encore assez de parties sur {label}
        </h2>
        <p className="t-body text-gray-700">
          Avec {integer.format(payload.matchCount)} partie{payload.matchCount > 1 ? 's' : ''}, les écarts entre zone et ligne de vol dépendent trop de
          quelques parties. L’analyse s’affiche à partir de {integer.format(payload.threshold)} parties sur la carte.
        </p>
        <div className="flex max-w-[290px] flex-col gap-1">
          <div className="t-meta t-num flex justify-between">
            <span>Parties analysées</span>
            <b className="text-gray-900">
              {integer.format(payload.matchCount)} / {integer.format(payload.threshold)}
            </b>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[var(--theme-ui-border)]"
            role="progressbar"
            aria-label="Parties analysées"
            aria-valuemin={0}
            aria-valuemax={payload.threshold}
            aria-valuenow={payload.matchCount}
          >
            <div className="h-full rounded-full bg-[var(--theme-ui-accent)]" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        {best ? (
          <button type="button" onClick={() => onSelectMap(best.mapName)} className="app-btn app-btn--md app-btn--secondary w-fit">
            Voir {mapLabel(best.mapName)}
          </button>
        ) : null}
      </div>
    </section>
  )
}

export default function ZoneReadingAnalysis({
  payload,
  axis,
  onAxisChange,
  onSelectMap,
}: {
  payload: ZoneReadingAnalysisPayload
  axis: Axis | null
  onAxisChange: (axis: Axis) => void
  onSelectMap: (mapName: string) => void
}) {
  const mapName = payload.mapName
  if (!mapName || !payload.ready || !payload.stats || !axis) {
    return <ZoneReadingNotEnough payload={payload} onSelectMap={onSelectMap} />
  }
  const ready = { ...payload, mapName }
  return (
    <div className="flex flex-col gap-[18px]">
      <PlaneAndZone payload={ready} stats={payload.stats} axis={axis} onAxisChange={onAxisChange} />
      <div className="grid items-start gap-[18px] xl:grid-cols-2">
        <ClosingDirection stats={payload.stats} />
        <PracticalRule stats={payload.stats} />
      </div>
      <WhereItEnds payload={ready} axis={axis} onAxisChange={onAxisChange} />
    </div>
  )
}

