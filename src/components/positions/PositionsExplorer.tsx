'use client'

/* eslint-disable @next/next/no-img-element -- fonds de carte locaux, positionnés en pourcentage */

import { Car, ChevronLeft, ChevronRight, Crosshair, Crown, Flame, HeartPulse, Skull, Target, X, Zap, type LucideIcon } from 'lucide-react'
import { useMemo, useState, useSyncExternalStore, type RefObject } from 'react'

import DropZoneMapViewport, { type DropZoneMapViewportHandle } from '@/components/drop-zones/DropZoneMapViewport'
import { mapLabel } from '@/components/maps/MapToolbarControls'
import { memberColor, spotBackgroundPosition } from '@/lib/drop-zones-view'
import type { MapLocation } from '@/lib/map-location-service'
import { paginate } from '@/lib/pagination'
import type { PositionMetric } from '@/lib/position-metric-cells'
import {
  cellCenter,
  dotSize,
  eventTitle,
  FORCE_VERDICT_LABELS,
  forceReport,
  glowIntensity,
  locationCounts,
  memberEventSummary,
  POSITION_EVENTS,
  totalOf,
  type HeatmapCell,
  type MemberBreakdown,
  type PositionEvent,
  type PositionEventKey,
} from '@/lib/positions-view'
import { TACTICAL_PHASE_OPTIONS, type TacticalPhase } from '@/lib/tactical-phase'

/**
 * Cartographie tactique — choisis un événement, lis la carte (maquette « Positions », 2026-09-27 ;
 * docs/features/positions.md). Sélecteur d'événement, carte à un seul rendu, phase du cercle, zone chaude, rapport de
 * force, top 5, « Qui … où ». Le bandeau (carte ‹ ›, période, joueur) est celui des zones de drop.
 */

export type PositionsPayload = {
  gridSize: number
  selectedMap: string | null
  selectedMemberKey: string | null
  maps: Array<{ mapName: string; matches: number }>
  members: Array<{ memberKey: string; memberLabel: string; points: number }>
  safeZoneOverlay: { x: number; y: number; r: number } | null
  memberBreakdown: MemberBreakdown[]
  options?: { mapLocations?: Record<string, MapLocation[]> }
} & Record<CellField, HeatmapCell[]>

type CellField = 'kills' | 'deaths' | 'shots' | 'damageDealt' | 'damageTaken' | 'knockoutsDealt' | 'knockoutsTaken' | 'revivesGiven' | 'revivesTaken' | 'vehicles'

/** Champ de la réponse qui porte les cellules d'une métrique. */
export const CELL_FIELD: Partial<Record<PositionMetric, CellField>> = {
  kill: 'kills',
  death: 'deaths',
  shot: 'shots',
  damage_dealt: 'damageDealt',
  damage_taken: 'damageTaken',
  knockout_dealt: 'knockoutsDealt',
  knockout_taken: 'knockoutsTaken',
  revive_given: 'revivesGiven',
  revive_received: 'revivesTaken',
  vehicle: 'vehicles',
}

export const cellsOf = (payload: PositionsPayload, metric: PositionMetric) => payload[CELL_FIELD[metric]!] ?? []

const EVENT_ICONS: Record<PositionEventKey, LucideIcon> = { kill: Crosshair, ko: Zap, damage: Flame, shot: Target, revive: HeartPulse, vehicle: Car, death: Skull }
const RANK_COLORS = ['#fbbf24', '#cbd5e1', '#d97706']
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const rgb = (event: PositionEvent, alpha = 1) => `rgba(${event.rgb}, ${alpha})`
const SM_QUERY = '(min-width: 640px)'
function subscribeSmallScreen(onChange: () => void) {
  const query = window.matchMedia(SM_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const useIsSmall = () => useSyncExternalStore(subscribeSmallScreen, () => !window.matchMedia(SM_QUERY).matches, () => false)

// ── Sélecteur d'événement ────────────────────────────────────────────────────────────────────────

export function EventPicker({ payload, value, onChange }: { payload: PositionsPayload; value: PositionEventKey; onChange: (key: PositionEventKey) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7" role="group" aria-label="Événement">
      {POSITION_EVENTS.map((event) => {
        const Icon = EVENT_ICONS[event.key]
        const active = event.key === value
        const count = event.roles.reduce((sum, role) => sum + totalOf(cellsOf(payload, role.metric)), 0)
        return (
          <button
            key={event.key}
            type="button"
            onClick={() => onChange(event.key)}
            aria-pressed={active}
            className="flex min-w-0 flex-col items-center gap-1 rounded-xl border bg-white px-1 py-2 transition"
            style={{ borderColor: active ? rgb(event) : 'var(--theme-ui-border)', backgroundColor: active ? rgb(event, 0.14) : undefined }}
          >
            <Icon className="h-[18px] w-[18px]" style={{ color: rgb(event) }} aria-hidden="true" />
            <b className={`text-xs text-gray-900 ${active ? 'font-extrabold' : 'font-semibold'}`}>{event.label}</b>
            <span className="text-[11px] tabular-nums text-gray-500">{integer.format(count)}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Carte ────────────────────────────────────────────────────────────────────────────────────────

type MapProps = {
  viewportRef: RefObject<DropZoneMapViewportHandle | null>
  payload: PositionsPayload
  event: PositionEvent
  roleIndex: number
  onRole: (index: number) => void
  cells: HeatmapCell[]
  top5: ReturnType<typeof locationCounts>['cities']
  selectedLocationId: string | null
  onSelectLocation: (location: MapLocation | null) => void
  onStep: (direction: 'prev' | 'next') => void
  transition: { key: number; from: 'left' | 'right' | null }
  emptyMessage: string
}

const overlayButton = 'flex items-center gap-1 rounded-full border border-white/20 bg-slate-950/70 text-[11px] font-bold text-white backdrop-blur-md'

export function PositionsMap({ viewportRef, payload, event, roleIndex, onRole, cells, top5, selectedLocationId, onSelectLocation, onStep, transition, emptyMessage }: MapProps) {
  const [zoom, setZoom] = useState(1)
  const compact = useIsSmall()
  const maps = payload.maps.map((entry) => entry.mapName)
  const activeMap = payload.selectedMap ?? ''
  const index = maps.indexOf(activeMap)
  const prev = maps.length > 1 ? maps[(index - 1 + maps.length) % maps.length] : null
  const next = maps.length > 1 ? maps[(index + 1) % maps.length] : null
  const maxCount = cells.reduce((max, cell) => Math.max(max, cell.count), 0)
  const empty = totalOf(cells) === 0
  const selected = top5.find((city) => city.location.id === selectedLocationId)?.location ?? null
  const animation = transition.from === 'right' ? 'dz-slide-from-right' : transition.from === 'left' ? 'dz-slide-from-left' : ''
  const zone = payload.safeZoneOverlay

  return (
    <div className="isolate overflow-hidden rounded-2xl border border-gray-200" data-testid="positions-map">
      <DropZoneMapViewport
        ref={viewportRef}
        showBoundaryControl={false}
        onSwipeMap={maps.length > 1 ? onStep : undefined}
        onZoomChange={setZoom}
        overlay={
          <>
            {event.roles.length > 1 ? (
              <div className="absolute left-2.5 top-2.5 z-40 inline-flex gap-0.5 rounded-[10px] border border-white/15 bg-slate-950/80 p-[3px] backdrop-blur-md" role="group" aria-label="Sens de l’événement">
                {event.roles.map((role, index) => (
                  <button
                    key={role.metric}
                    type="button"
                    onClick={() => onRole(index)}
                    aria-pressed={roleIndex === index}
                    className="h-7 rounded-[7px] px-2.5 text-xs font-bold"
                    style={roleIndex === index ? { backgroundColor: rgb(event), color: '#020617' } : { color: 'rgba(255,255,255,.8)' }}
                  >
                    {role.label}
                  </button>
                ))}
              </div>
            ) : null}
            {zoom <= 1 && next && !empty ? (
              <>
                {maps.length > 2 && prev ? (
                  <button type="button" onClick={() => onStep('prev')} className={`${overlayButton} absolute left-2 top-1/2 z-30 h-[30px] -translate-y-1/2 pl-1.5 pr-2.5`}>
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    {mapLabel(prev)}
                  </button>
                ) : null}
                <button type="button" onClick={() => onStep('next')} className={`${overlayButton} absolute right-2 top-1/2 z-30 h-[30px] -translate-y-1/2 pl-2.5 pr-1.5`}>
                  {mapLabel(next)}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span className="pointer-events-none absolute bottom-2.5 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-semibold text-white/85">
                  Glisse la carte pour changer de map
                </span>
              </>
            ) : null}
            {zoom > 1 ? (
              <button type="button" onClick={() => onSelectLocation(null)} className="absolute bottom-2.5 left-1/2 z-40 flex h-[30px] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-cyan-600 px-3 text-xs font-extrabold text-white">
                {selected ? `${selected.name} · ` : ''}Toute la carte
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {empty ? (
              <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center p-6">
                <span className="rounded-xl bg-slate-950/85 px-4 py-2.5 text-center text-sm font-semibold text-white">{emptyMessage}</span>
              </div>
            ) : null}
          </>
        }
      >
        <div key={transition.key} className={`absolute inset-0 overflow-hidden ${animation}`}>
          {activeMap ? <img src={`/maps/pubg/${activeMap}.webp`} alt={mapLabel(activeMap)} className="absolute inset-0 h-full w-full object-cover" draggable={false} /> : null}
          <div className="absolute inset-0 bg-slate-950/40" />

          {zone ? (
            <span
              className="pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/85"
              style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.r * 2}%`, boxShadow: '0 0 0 3000px rgba(37, 99, 235, 0.22)' }}
              data-testid="safe-zone"
            />
          ) : null}

          {!event.dots
            ? cells.map((cell) => {
                const { xPct, yPct } = cellCenter(cell, payload.gridSize)
                const intensity = glowIntensity(cell.count, maxCount)
                return (
                  <span
                    key={`g:${cell.xIndex}:${cell.yIndex}`}
                    className="pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
                    style={{
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      width: `${5 + intensity * 6}%`,
                      background: `radial-gradient(circle, ${rgb(event, 0.25 + intensity * 0.6)} 0%, ${rgb(event, 0)} 70%)`,
                    }}
                    data-testid="event-glow"
                  />
                )
              })
            : null}

          {top5.map((city) => {
            const active = city.location.id === selectedLocationId
            return (
              <span
                key={`r:${city.location.id}`}
                className="pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${city.location.xPct}%`,
                  top: `${city.location.yPct}%`,
                  width: `${city.location.radiusPct * 2}%`,
                  border: active ? '2px solid #22d3ee' : '1.5px dashed rgba(255,255,255,.5)',
                  backgroundColor: active ? 'rgba(34,211,238,.1)' : 'transparent',
                }}
              />
            )
          })}

          {event.dots
            ? cells.map((cell) => {
                const { xPct, yPct } = cellCenter(cell, payload.gridSize)
                const size = dotSize(cell.count, maxCount, compact)
                return (
                  <span
                    key={`d:${cell.xIndex}:${cell.yIndex}`}
                    title={`${cell.count} ${eventTitle(event, roleIndex).toLowerCase()}`}
                    className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[1.5px] border-slate-950/85 text-[9px] font-black text-[#020617]"
                    style={{ left: `${xPct}%`, top: `${yPct}%`, width: size, height: size, backgroundColor: rgb(event) }}
                    data-testid="event-dot"
                  >
                    {cell.count > 1 && size >= 15 ? cell.count : ''}
                  </span>
                )
              })
            : null}

          {top5.map((city, index) => (
            <button
              key={`pin:${city.location.id}`}
              type="button"
              onClick={() => onSelectLocation(city.location)}
              aria-label={`${index + 1}. ${city.location.name} : ${city.count}`}
              aria-pressed={city.location.id === selectedLocationId}
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border bg-slate-950/85 py-0.5 pl-0.5 pr-2 text-white shadow-lg"
              style={{ left: `${city.location.xPct}%`, top: `${city.location.yPct - city.location.radiusPct}%`, borderColor: RANK_COLORS[index] ?? 'rgba(255,255,255,.7)' }}
              data-testid="city-pin"
            >
              <span className="grid h-[18px] w-[18px] place-items-center rounded-full text-[11px] font-black text-[#020617]" style={{ backgroundColor: RANK_COLORS[index] ?? 'rgba(255,255,255,.7)' }}>
                {index + 1}
              </span>
              <span className="max-w-[84px] truncate text-[10px] font-bold sm:max-w-[150px] sm:text-xs">{city.location.name}</span>
              <span className="text-[10px] font-extrabold tabular-nums sm:text-xs" style={{ color: RANK_COLORS[index] ?? 'rgba(255,255,255,.85)' }}>{city.count}</span>
            </button>
          ))}
        </div>
      </DropZoneMapViewport>
    </div>
  )
}

export function EventLegend({ event, roleIndex }: { event: PositionEvent; roleIndex: number }) {
  return (
    <p className="flex flex-wrap items-center gap-2 px-0.5 text-xs text-gray-600" data-testid="event-legend">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: rgb(event) }} aria-hidden="true" />
      <b className="text-gray-900">{eventTitle(event, roleIndex)}</b>{' '}
      <span>
        {event.roles[roleIndex].description}
        {event.dots ? ' · taille = nombre' : ''}
      </span>
    </p>
  )
}

// ── Phase du cercle ─────────────────────────────────────────────────────────────────────────────

const PHASE_RING: Record<TacticalPhase, number> = { all: 26, early: 20, mid: 13, late: 7 }

export function PhasePicker({ value, onChange }: { value: TacticalPhase; onChange: (phase: TacticalPhase) => void }) {
  return (
    <section className="app-panel flex flex-col gap-2 px-3.5 py-3" aria-labelledby="phase-title">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 id="phase-title" className="whitespace-nowrap text-sm font-bold text-gray-900">Phase du cercle</h2>
        <span className="text-xs text-gray-500">
          {value === 'all' ? 'filtre les événements selon l’avancée de la zone' : 'cercle blanc : zone moyenne de cette phase'}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Phase du cercle">
        {TACTICAL_PHASE_OPTIONS.map((option) => {
          const active = option.value === value
          const [label, detail] = option.value === 'all' ? ['Toutes', 'toute la partie'] : option.label.split(' · ')
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`flex min-w-0 flex-col items-center gap-1.5 rounded-[10px] border px-1 py-2 ${active ? 'border-cyan-400 bg-cyan-400/10' : 'border-gray-200'}`}
            >
              <span className="relative grid h-7 w-7 place-items-center" aria-hidden="true">
                <span className="absolute inset-0 rounded-full border-[1.5px] border-dashed border-gray-400 opacity-60" />
                <span
                  className="rounded-full border-2"
                  style={{
                    width: PHASE_RING[option.value],
                    height: PHASE_RING[option.value],
                    borderColor: active ? '#22d3ee' : 'var(--theme-ui-text-secondary)',
                    backgroundColor: active ? 'rgba(34,211,238,.18)' : 'transparent',
                  }}
                />
              </span>
              <b className={`text-xs text-gray-900 ${active ? 'font-extrabold' : 'font-semibold'}`}>{label.replace(' de partie', '')}</b>
              <span className="truncate text-[10px] text-gray-500">{detail}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── Colonne de droite ───────────────────────────────────────────────────────────────────────────

export function HotZoneCard({
  event,
  roleIndex,
  top,
  total,
  activeMap,
  king,
  title,
  onSelect,
}: {
  event: PositionEvent
  roleIndex: number
  top: ReturnType<typeof locationCounts>['cities'][number] | undefined
  total: number
  activeMap: string
  king: { name: string; count: number } | null
  title: string
  onSelect: (location: MapLocation) => void
}) {
  if (!top) return null
  const Icon = EVENT_ICONS[event.key]
  const victim = event.key === 'death' || (event.roles.length > 1 && roleIndex === 1)
  return (
    <button
      type="button"
      onClick={() => onSelect(top.location)}
      aria-label={`${title} : ${top.location.name}`}
      className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border bg-[#0b1220] p-4 text-left text-white"
      style={{
        borderColor: rgb(event, 0.6),
        backgroundImage: `url('/maps/pubg/${activeMap}.webp')`,
        backgroundSize: '700%',
        backgroundPosition: spotBackgroundPosition(top.location.xPct, top.location.yPct),
      }}
      data-testid="hot-zone"
    >
      <span className="absolute inset-0 bg-gradient-to-t from-slate-950/95 from-20% to-slate-950/55" aria-hidden="true" />
      <span className="relative flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: rgb(event) }}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </span>
      <span className="relative flex flex-col gap-0.5">
        <b className="text-[28px] font-black leading-tight tracking-tight">{top.location.name}</b>
        <span className="text-[13px] text-white/75">
          {integer.format(top.count)} {eventTitle(event, roleIndex).toLowerCase()} · {integer.format(total > 0 ? (top.count / total) * 100 : 0)} % sur {mapLabel(activeMap)}
        </span>
      </span>
      {king ? (
        <span className="relative inline-flex items-center gap-1.5 self-start rounded-md border border-amber-400/60 bg-amber-400/15 px-2.5 py-0.5 text-xs font-extrabold text-amber-200">
          <Crown className="h-3.5 w-3.5" aria-hidden="true" />
          {victim ? 'Le plus touché' : 'Roi du coin'} : {king.name} ×{king.count}
        </span>
      ) : null}
    </button>
  )
}

export function ForceReport({ kills, deaths, locations, gridSize, selectedLocationId, onSelect }: {
  kills: HeatmapCell[]
  deaths: HeatmapCell[]
  locations: MapLocation[]
  gridSize: number
  selectedLocationId: string | null
  onSelect: (location: MapLocation) => void
}) {
  const rows = forceReport(kills, deaths, locations, gridSize)
  return (
    <section className="app-panel flex flex-col overflow-hidden" aria-labelledby="force-title">
      <div className="flex flex-col gap-0.5 px-4 pb-2 pt-3">
        <h2 id="force-title" className="text-[15px] font-extrabold text-gray-900">Rapport de force</h2>
        <span className="text-xs text-gray-500">Kills du clan contre morts du clan, par ville</span>
      </div>
      {rows.length > 0 ? (
        <ul aria-label="Rapport de force par ville">
          {rows.map((row) => {
            const color = row.verdict === 'win' ? 'var(--theme-ui-positive)' : row.verdict === 'avoid' ? 'var(--theme-ui-negative)' : 'var(--theme-ui-text-muted)'
            return (
              <li key={row.location.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.location)}
                  className={`flex w-full flex-col gap-1.5 border-t border-gray-200 px-4 py-2 text-left hover:bg-gray-50 ${row.location.id === selectedLocationId ? 'bg-cyan-400/10' : ''}`}
                >
                  <span className="flex items-baseline gap-2">
                    <b className="min-w-0 flex-1 truncate text-[13px] text-gray-900">{row.location.name}</b>
                    <span className="whitespace-nowrap text-[11px] font-extrabold" style={{ color }}>
                      {FORCE_VERDICT_LABELS[row.verdict]} · {decimal.format(row.ratio)}
                    </span>
                  </span>
                  <span className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-1.5 text-[11px] font-extrabold tabular-nums">
                    <span className="text-right text-yellow-500">{row.kills}</span>
                    <span className="flex h-2 gap-0.5 overflow-hidden rounded" aria-hidden="true">
                      <span className="bg-yellow-400" style={{ width: `${row.killShare}%` }} />
                      <span className="flex-1 bg-rose-400" />
                    </span>
                    <span className="text-rose-400">{row.deaths}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-500">Ni kill ni mort en ville sur cette carte.</p>
      )}
      <span className="flex gap-3.5 border-t border-gray-200 px-4 pb-3 pt-2 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-yellow-400" aria-hidden="true" />kills</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-400" aria-hidden="true" />morts</span>
      </span>
    </section>
  )
}

export function TopCities({ event, roleIndex, counts, selectedLocationId, onSelect }: {
  event: PositionEvent
  roleIndex: number
  counts: ReturnType<typeof locationCounts>
  selectedLocationId: string | null
  onSelect: (location: MapLocation) => void
}) {
  const top5 = counts.cities.slice(0, 5)
  const inCity = counts.cities.reduce((sum, city) => sum + city.count, 0)
  return (
    <section className="app-panel flex flex-col overflow-hidden" aria-labelledby="top-cities-title">
      <div className="flex flex-wrap items-baseline gap-2 px-4 pb-2 pt-3">
        <h2 id="top-cities-title" className="text-[15px] font-extrabold text-gray-900">Top 5 · {eventTitle(event, roleIndex).toLowerCase()}</h2>
        <span className="text-xs text-gray-500">{integer.format(inCity)} en ville · {integer.format(counts.outside)} hors ville</span>
      </div>
      {top5.length > 0 ? (
        <ol aria-label="Top 5 des villes">
          {top5.map((city, index) => (
            <li key={city.location.id}>
              <button
                type="button"
                onClick={() => onSelect(city.location)}
                aria-pressed={city.location.id === selectedLocationId}
                className={`grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-gray-200 px-4 py-2 text-left hover:bg-gray-50 ${city.location.id === selectedLocationId ? 'bg-cyan-400/10 shadow-[inset_3px_0_0_#22d3ee]' : ''}`}
              >
                <span
                  className="grid h-[22px] w-[22px] place-items-center rounded-full text-[11px] font-black"
                  style={{ backgroundColor: RANK_COLORS[index] ?? 'var(--theme-ui-surface-strong)', color: index < 3 ? (index === 2 ? '#fff' : '#020617') : 'var(--theme-ui-text)' }}
                >
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <b className="truncate text-sm text-gray-900">{city.location.name}</b>
                  <span className="block h-[5px] max-w-[180px] overflow-hidden rounded-[3px] bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
                    <span className="block h-full" style={{ width: `${(city.count / top5[0].count) * 100}%`, backgroundColor: rgb(event) }} />
                  </span>
                </span>
                <span className="flex flex-col items-end tabular-nums">
                  <b className="text-base text-gray-900">{integer.format(city.count)}</b>
                  <span className="text-[11px] text-gray-500">{integer.format(city.share)} %</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-500">Aucun événement en ville sur cette carte.</p>
      )}
      <span className="border-t border-gray-200 px-4 pb-3 pt-2 text-[11px] text-gray-500">Touchez une ville pour zoomer dessus.</span>
    </section>
  )
}

// ── Qui … où ────────────────────────────────────────────────────────────────────────────────────

export function WhoDoesWhat({ event, roleIndex, breakdown, locations, activeMap, selectedMemberKey, onSelect }: {
  event: PositionEvent
  roleIndex: number
  breakdown: MemberBreakdown[]
  locations: MapLocation[]
  activeMap: string
  selectedMemberKey: string | null
  onSelect: (memberKey: string | null) => void
}) {
  const [page, setPage] = useState(1)
  const small = useIsSmall()
  const metric = event.roles[roleIndex].metric
  const members = useMemo(
    () =>
      breakdown
        .map((member) => ({ member, summary: memberEventSummary(member, metric, locations) }))
        .sort((a, b) => b.summary.count - a.summary.count || a.member.memberLabel.localeCompare(b.member.memberLabel, 'fr')),
    [breakdown, locations, metric]
  )
  const { current, pageCount, visible } = paginate(members, page, small ? 2 : 4)
  if (members.length === 0) return null

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="who-title">
      <div className="flex items-center gap-2">
        <h2 id="who-title" className="whitespace-nowrap text-[17px] font-extrabold text-gray-900">Qui {event.roles[roleIndex].verb} où</h2>
        <span className="hidden truncate text-[13px] text-gray-500 sm:inline">{eventTitle(event, roleIndex)} · {mapLabel(activeMap)}</span>
        {pageCount > 1 ? (
          <nav className="ml-auto flex items-center gap-1.5" aria-label="Pages des joueurs">
            <button type="button" className="app-pager-button" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Joueurs précédents">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-[30px] text-center text-xs font-bold tabular-nums text-gray-500">{current}/{pageCount}</span>
            <button type="button" className="app-pager-button" onClick={() => setPage(current + 1)} disabled={current === pageCount} aria-label="Joueurs suivants">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </div>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Joueurs de la carte">
        {visible.map(({ member, summary }) => {
          const color = memberColor(hashKey(member.memberKey))
          const selected = selectedMemberKey === member.memberKey
          return (
            <li key={member.memberKey} className="flex min-w-0">
              <button
                type="button"
                onClick={() => onSelect(selected ? null : member.memberKey)}
                aria-pressed={selected}
                aria-label={`${member.memberLabel} : filtrer la carte`}
                className="app-panel flex w-full min-w-0 flex-col gap-2 px-3.5 py-3 text-left transition hover:border-[var(--theme-ui-accent-ring)]"
                style={selected ? { borderColor: color, boxShadow: `0 0 0 3px ${color}40` } : undefined}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black text-[#020617]" style={{ backgroundColor: color }}>
                    {member.memberLabel.replace(/^Joueur\s+/, '').charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <b className="truncate text-sm text-gray-900">{member.memberLabel}</b>
                    <span className="text-[11px] text-gray-500">{integer.format(summary.count)} {eventTitle(event, roleIndex).toLowerCase()}</span>
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-gray-500">Ville n° 1</span>
                  <b className="truncate text-[13px] text-gray-900">{summary.topLocation ? `${summary.topLocation.name} ×${summary.topLocation.count}` : '—'}</b>
                </span>
                <span className="self-start rounded-md bg-[var(--theme-ui-surface-strong)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-gray-700">K/D {decimal.format(summary.kd)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Couleur stable d'une clé de membre (compte PUBG ou pseudo) : même palette que les zones de drop. */
export function hashKey(key: string) {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) | 0
  return Math.abs(hash)
}

