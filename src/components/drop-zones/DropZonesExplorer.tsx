'use client'

/* eslint-disable @next/next/no-img-element -- fonds de carte locaux, positionnés en pourcentage */

import { ChevronDown, ChevronLeft, ChevronRight, Crown, MapPin, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import DropZoneMapViewport, { type DropZoneMapViewportHandle } from '@/components/drop-zones/DropZoneMapViewport'
import { DROP_PRESSURE_LEVELS, dropPressureTooltip } from '@/lib/drop-zone-pressure'
import {
  jumpProfile,
  locationForPoint,
  mapsByJumps,
  memberColor,
  memberJumpSummaries,
  neighbourMap,
  pressureDistribution,
  SPOT_MOODS,
  spotBackgroundPosition,
  spotStats,
  type LandingPoint,
  type SpotStat,
} from '@/lib/drop-zones-view'
import { mapDisplayName } from '@/lib/map-label-service'
import type { MapLocation, MapLocations } from '@/lib/map-location-service'
import { paginate } from '@/lib/pagination'

/**
 * Zones de drop « une question à la fois » (maquette « Zones de drop », 2026-09-27 ; docs/features/drop-zones.md).
 * Composants partagés par la page du clan et celle d'un joueur : sélecteur de carte ‹ › du bandeau, carte à deux
 * lectures avec épingles du top 5, spot favori, profil de saut, top 5, « Qui saute où ».
 */

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const mapPath = (mapName: string) => `/maps/pubg/${mapName}.webp`
/** Nom court de la carte (« Erangel » plutôt que « Erangel (Remastered) ») : bandeau sur une ligne, étiquettes de la carte. */
export const mapLabel = (mapName: string) => mapDisplayName(mapName, {}).replace(/\s*\(.*\)$/, '')
const RANK_COLORS = ['#fbbf24', '#cbd5e1', '#d97706']

export type DropLens = 'drops' | 'heat'

// ── État partagé : carte affichée, lentille, spot sélectionné ─────────────────────────────────────

export function useDropZonesExplorer(points: readonly LandingPoint[], mapLocations: MapLocations | undefined, filterMemberId: number | null) {
  const viewportRef = useRef<DropZoneMapViewportHandle>(null)
  const [selectedMap, setSelectedMap] = useState('')
  const [lens, setLens] = useState<DropLens>('drops')
  const [spotId, setSpotId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  // Nombre de changements de carte, et leur sens : l'arrivée de la carte glisse depuis ce côté.
  const [transition, setTransition] = useState<{ key: number; from: 'left' | 'right' | null }>({ key: 0, from: null })

  // Les cartes restent celles du clan (ou du périmètre de la page) : filtrer un joueur ne fait pas disparaître de carte.
  const maps = useMemo(() => mapsByJumps(points), [points])
  const activeMap = selectedMap && maps.includes(selectedMap) ? selectedMap : maps[0] ?? ''
  const locations = useMemo(() => (mapLocations?.[activeMap] ?? []).filter((location) => location.enabled), [activeMap, mapLocations])
  const mapPoints = useMemo(() => points.filter((point) => point.mapName === activeMap), [activeMap, points])
  const visiblePoints = useMemo(
    () => (filterMemberId === null ? mapPoints : mapPoints.filter((point) => point.memberId === filterMemberId)),
    [filterMemberId, mapPoints]
  )
  const spots = useMemo(() => spotStats(visiblePoints, locations), [locations, visiblePoints])
  const selectedSpot = spots.find((spot) => spot.location.id === spotId) ?? null

  const selectMap = useCallback(
    (mapName: string, from: 'left' | 'right' | null = null) => {
      setSelectedMap(mapName)
      setSpotId(null)
      setTransition((current) => ({ key: current.key + 1, from }))
      viewportRef.current?.reset()
    },
    []
  )

  const stepMap = useCallback(
    (direction: 'prev' | 'next') => {
      const target = neighbourMap(maps, activeMap, direction)
      if (target && target !== activeMap) selectMap(target, direction === 'next' ? 'right' : 'left')
    },
    [activeMap, maps, selectMap]
  )

  function selectSpot(location: MapLocation | null) {
    if (!location || location.id === spotId) {
      setSpotId(null)
      viewportRef.current?.reset()
      return
    }
    setSpotId(location.id)
    viewportRef.current?.focusLocation(location)
  }

  function clearFocus() {
    setSpotId(null)
    viewportRef.current?.reset()
  }

  return {
    viewportRef,
    maps,
    activeMap,
    selectMap,
    stepMap,
    lens,
    setLens,
    zoom,
    setZoom,
    transition,
    locations,
    mapPoints,
    visiblePoints,
    spots,
    selectedSpot,
    selectSpot,
    clearFocus,
    profile: jumpProfile(visiblePoints),
  }
}

export type DropZonesExplorerState = ReturnType<typeof useDropZonesExplorer>

// ── Bandeau : carte ‹ › et joueur ─────────────────────────────────────────────────────────────────

export function MapPager({ explorer }: { explorer: DropZonesExplorerState }) {
  const { maps, activeMap, stepMap, selectMap } = explorer
  if (maps.length === 0) return null
  return (
    <div className="flex min-w-0 flex-1 items-center rounded-[10px] border border-gray-200 bg-white p-0.5 sm:w-[220px] sm:flex-none sm:gap-0.5 sm:p-[3px]" role="group" aria-label="Carte">
      <button type="button" onClick={() => stepMap('prev')} disabled={maps.length < 2} aria-label="Carte précédente" className="grid h-7 w-[22px] shrink-0 place-items-center rounded-md text-gray-900 hover:bg-gray-100 disabled:opacity-35 sm:w-7">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-[3px]">
        <b className="max-w-full truncate text-xs font-extrabold text-gray-900 sm:text-[13px] sm:uppercase sm:tracking-[0.06em]" data-testid="active-map">
          {mapLabel(activeMap)}
        </b>
        <span className="flex gap-1">
          {maps.map((mapName) => (
            <button
              key={mapName}
              type="button"
              onClick={() => mapName !== activeMap && selectMap(mapName)}
              aria-label={mapLabel(mapName)}
              aria-current={mapName === activeMap ? 'true' : undefined}
              className="h-1 rounded-sm transition-all"
              style={{ width: mapName === activeMap ? 16 : 6, backgroundColor: mapName === activeMap ? '#f97316' : 'var(--theme-ui-border)' }}
            />
          ))}
        </span>
      </div>
      <button type="button" onClick={() => stepMap('next')} disabled={maps.length < 2} aria-label="Carte suivante" className="grid h-7 w-[22px] shrink-0 place-items-center rounded-md text-gray-900 hover:bg-gray-100 disabled:opacity-35 sm:w-7">
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export type PickerItem = { key: string; label: string; color: string | null; count?: number; active: boolean; onSelect: () => void }

/** Pastille du bandeau qui ouvre un menu (joueur filtré, ou périmètre sur la page d'un joueur). */
export function PickerChip({ label, color, items, ariaLabel }: { label: string; color: string | null; items: PickerItem[]; ariaLabel: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${ariaLabel} : ${label}`}
        className="flex h-[38px] items-center gap-2 rounded-[10px] border bg-white px-[5px] text-gray-900 sm:pr-2"
        style={{ borderColor: color ?? 'var(--theme-ui-border)' }}
      >
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full text-xs font-black text-[#020617]" style={{ backgroundColor: color ?? 'var(--theme-ui-surface-strong)' }}>
          {color ? label.replace(/^Joueur\s+/, '').charAt(0).toUpperCase() : ''}
        </span>
        <span className="hidden max-w-[120px] truncate text-[13px] font-semibold sm:inline">{label}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-gray-500 sm:block" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label={ariaLabel} className="app-panel absolute right-0 top-[44px] z-50 flex max-h-[60vh] w-[230px] flex-col gap-0.5 overflow-y-auto p-1.5 shadow-xl">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitemradio"
              aria-checked={item.active}
              onClick={() => {
                item.onSelect()
                setOpen(false)
              }}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-left hover:bg-gray-100 ${item.active ? 'bg-gray-100' : ''}`}
            >
              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11px] font-black text-[#020617]" style={{ backgroundColor: item.color ?? 'var(--theme-ui-surface-strong)' }}>
                {item.color ? item.label.replace(/^Joueur\s+/, '').charAt(0).toUpperCase() : ''}
              </span>
              <span className={`min-w-0 flex-1 truncate text-[13px] text-gray-900 ${item.active ? 'font-extrabold' : 'font-medium'}`}>{item.label}</span>
              {item.count !== undefined ? <span className="text-xs tabular-nums text-gray-500">{item.count}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ── Carte à deux lectures ─────────────────────────────────────────────────────────────────────────

const overlayButton = 'flex items-center gap-1 rounded-full border border-white/20 bg-slate-950/70 text-[11px] font-bold text-white backdrop-blur-md'

export function DropZonesMap({ explorer, emptyMessage }: { explorer: DropZonesExplorerState; emptyMessage: string }) {
  const { viewportRef, activeMap, maps, lens, setLens, zoom, setZoom, transition, locations, visiblePoints, spots, selectedSpot, selectSpot, clearFocus, stepMap } = explorer
  const top5 = spots.slice(0, 5)
  const prev = neighbourMap(maps, activeMap, 'prev')
  const next = neighbourMap(maps, activeMap, 'next')
  const canSwipe = maps.length > 1
  const empty = visiblePoints.length === 0
  const animation = transition.from === 'right' ? 'dz-slide-from-right' : transition.from === 'left' ? 'dz-slide-from-left' : ''

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="isolate overflow-hidden rounded-2xl border border-gray-200" data-testid="drop-map">
        <DropZoneMapViewport
          ref={viewportRef}
          showBoundaryControl={false}
          onSwipeMap={canSwipe ? stepMap : undefined}
          onZoomChange={setZoom}
          overlay={
            <>
              <div className="absolute left-2.5 top-2.5 z-40 inline-flex gap-0.5 rounded-[10px] border border-white/15 bg-slate-950/80 p-[3px] backdrop-blur-md" role="group" aria-label="Lecture de la carte">
                {([['drops', 'Nos sauts'], ['heat', 'Densité']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLens(value)}
                    aria-pressed={lens === value}
                    className={`h-7 rounded-[7px] px-2.5 text-xs font-bold ${lens === value ? 'bg-orange-500 text-white' : 'text-white/80 hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {zoom <= 1 && canSwipe && !empty ? (
                <>
                  {maps.length > 2 ? (
                  <button type="button" onClick={() => stepMap('prev')} className={`${overlayButton} absolute left-2 top-1/2 z-30 h-[30px] -translate-y-1/2 pl-1.5 pr-2.5`}>
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    {prev ? mapLabel(prev) : ''}
                  </button>
                  ) : null}
                  <button type="button" onClick={() => stepMap('next')} className={`${overlayButton} absolute right-2 top-1/2 z-30 h-[30px] -translate-y-1/2 pl-2.5 pr-1.5`}>
                    {next ? mapLabel(next) : ''}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <span className="pointer-events-none absolute bottom-2.5 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-semibold text-white/85">
                    Glisse la carte pour changer de map
                  </span>
                </>
              ) : null}
              {zoom > 1 ? (
                <button type="button" onClick={clearFocus} className="absolute bottom-2.5 left-1/2 z-40 flex h-[30px] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-orange-500 px-3 text-xs font-extrabold text-white">
                  {selectedSpot ? `${selectedSpot.location.name} · ` : ''}Toute la carte
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
          <div key={transition.key} className={`absolute inset-0 ${animation}`}>
            {activeMap ? <img src={mapPath(activeMap)} alt={mapLabel(activeMap)} className="absolute inset-0 h-full w-full object-cover" draggable={false} /> : null}
            <div className="absolute inset-0" style={{ backgroundColor: `rgba(2, 6, 23, ${lens === 'heat' ? 0.5 : 0.3})` }} />

            {lens === 'heat'
              ? visiblePoints.map((point, index) => (
                  <span
                    key={`h:${point.matchId}:${point.memberId}:${index}`}
                    className="pointer-events-none absolute aspect-square w-[11%] -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
                    style={{
                      left: `${point.xPct}%`,
                      top: `${point.yPct}%`,
                      background: 'radial-gradient(circle, rgba(255,170,40,.5) 0%, rgba(255,80,0,.22) 38%, rgba(255,60,0,0) 70%)',
                    }}
                  />
                ))
              : null}

            {top5.map((spot) => {
              const selected = selectedSpot?.location.id === spot.location.id
              return (
                <span
                  key={`r:${spot.location.id}`}
                  className="pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${spot.location.xPct}%`,
                    top: `${spot.location.yPct}%`,
                    width: `${spot.location.radiusPct * 2}%`,
                    border: selected ? '2px solid #22d3ee' : '1.5px dashed rgba(255,255,255,.55)',
                    backgroundColor: selected ? 'rgba(34,211,238,.1)' : 'transparent',
                  }}
                />
              )
            })}

            {lens === 'drops'
              ? visiblePoints.map((point, index) => {
                  const inside = !selectedSpot || locationForPoint(point, locations)?.id === selectedSpot.location.id
                  return (
                    <span
                      key={`p:${point.matchId}:${point.memberId}:${index}`}
                      title={`${point.memberName} · ${locationForPoint(point, locations)?.name ?? 'Hors ville'} · ${dropPressureTooltip(point)}`}
                      className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-slate-950/80 sm:h-2.5 sm:w-2.5"
                      style={{
                        left: `${point.xPct}%`,
                        top: `${point.yPct}%`,
                        backgroundColor: DROP_PRESSURE_LEVELS[point.pressureLevel].color,
                        opacity: inside ? 1 : 0.25,
                      }}
                      data-testid="drop-dot"
                    />
                  )
                })
              : null}

            {top5.map((spot, index) => (
              <button
                key={`pin:${spot.location.id}`}
                type="button"
                onClick={() => selectSpot(spot.location)}
                aria-label={`${index + 1}. ${spot.location.name} : ${spot.count} sauts`}
                aria-pressed={selectedSpot?.location.id === spot.location.id}
                className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border bg-slate-950/85 py-0.5 pl-0.5 pr-2 text-white shadow-lg"
                style={{
                  left: `${spot.location.xPct}%`,
                  top: `${spot.location.yPct - spot.location.radiusPct}%`,
                  borderColor: RANK_COLORS[index] ?? 'rgba(255,255,255,.7)',
                }}
                data-testid="spot-pin"
              >
                <span className="grid h-[18px] w-[18px] place-items-center rounded-full text-[11px] font-black text-[#020617]" style={{ backgroundColor: RANK_COLORS[index] ?? 'rgba(255,255,255,.7)' }}>
                  {index + 1}
                </span>
                <span className="max-w-[84px] truncate text-[10px] font-bold sm:max-w-[150px] sm:text-xs">{spot.location.name}</span>
                <span className="text-[10px] font-extrabold tabular-nums sm:text-xs" style={{ color: RANK_COLORS[index] ?? 'rgba(255,255,255,.85)' }}>{spot.count}</span>
              </button>
            ))}
          </div>
        </DropZoneMapViewport>
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-0.5 text-xs text-gray-600" data-testid="map-legend">
        {lens === 'drops' ? (
          <>
            <b className="text-gray-900">Adversaires au sol à 250 m</b>
            {pressureDistribution([]).map((level) => (
              <span key={level.level} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-slate-950/60" style={{ backgroundColor: level.color }} aria-hidden="true" />
                {level.label} <span className="text-gray-500">{level.max === null ? `${level.min}+` : `${level.min}–${level.max}`}</span>
              </span>
            ))}
          </>
        ) : (
          <>
            <b className="text-gray-900">Densité de nos sauts</b>
            <span className="inline-flex items-center gap-2 text-gray-500">
              rare
              <span className="h-2 w-[120px] rounded bg-gradient-to-r from-orange-600/25 via-orange-500 to-amber-200" aria-hidden="true" />
              fréquent
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Spot favori, profil de saut, top 5 ────────────────────────────────────────────────────────────

export function FavoriteSpotCard({ explorer, title }: { explorer: DropZonesExplorerState; title: string }) {
  const favorite = explorer.spots[0]
  if (!favorite) return null
  const level = DROP_PRESSURE_LEVELS[favorite.averageLevel]
  const total = explorer.visiblePoints.length
  return (
    <button
      type="button"
      onClick={() => explorer.selectSpot(favorite.location)}
      aria-label={`${title} : ${favorite.location.name}`}
      className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-orange-500/55 bg-[#0b1220] p-4 text-left text-white shadow-[0_0_0_4px_rgba(249,115,22,.1)]"
      style={{ backgroundImage: `url('${mapPath(explorer.activeMap)}')`, backgroundSize: '700%', backgroundPosition: spotBackgroundPosition(favorite.location.xPct, favorite.location.yPct) }}
      data-testid="favorite-spot"
    >
      <span className="absolute inset-0 bg-gradient-to-t from-slate-950/95 from-20% to-slate-950/55" aria-hidden="true" />
      <span className="relative flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-orange-300">
        <MapPin className="h-3.5 w-3.5 text-orange-400" aria-hidden="true" />
        {title}
      </span>
      <span className="relative flex flex-col gap-0.5">
        <b className="text-[28px] font-black leading-tight tracking-tight">{favorite.location.name}</b>
        <span className="text-[13px] text-white/75">
          {integer.format(favorite.count)} saut{favorite.count > 1 ? 's' : ''} sur {integer.format(total)} · {integer.format(favorite.share)} % des drops sur {mapLabel(explorer.activeMap)}
        </span>
      </span>
      <span className="relative flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-slate-950/60 px-2.5 py-0.5 text-xs font-extrabold" style={{ borderColor: level.color }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: level.color }} aria-hidden="true" />
          {level.label} · {decimal.format(favorite.average)} adv.
        </span>
        {favorite.king && new Set(explorer.visiblePoints.map((point) => point.memberId)).size > 1 ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-400/15 px-2.5 py-0.5 text-xs font-extrabold text-amber-200">
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            Roi du spot : {favorite.king.name} ×{favorite.king.count}
          </span>
        ) : null}
      </span>
      <span className="relative text-[13px] text-white/85">{SPOT_MOODS[favorite.averageLevel]}</span>
    </button>
  )
}

function PressureBar({ distribution, thin = false }: { distribution: ReturnType<typeof pressureDistribution>; thin?: boolean }) {
  return (
    <span className={`flex gap-px overflow-hidden bg-[var(--theme-ui-surface-strong)] ${thin ? 'h-[5px] max-w-[180px] rounded-[3px]' : 'h-3.5 gap-0.5 rounded-[7px]'}`} aria-hidden="true">
      {distribution.map((entry) => (entry.share > 0 ? <span key={entry.level} style={{ width: `${entry.share}%`, backgroundColor: entry.color }} /> : null))}
    </span>
  )
}

export function JumpProfileCard({ explorer }: { explorer: DropZonesExplorerState }) {
  const { profile } = explorer
  return (
    <section className="app-panel flex flex-col gap-3 px-4 py-3.5" aria-labelledby="jump-profile-title">
      <div className="flex items-baseline gap-2">
        <h2 id="jump-profile-title" className="text-[15px] font-extrabold text-gray-900">Profil de saut</h2>
        <span className="text-xs text-gray-500">adversaires au sol à 250 m</span>
      </div>
      <PressureBar distribution={profile.distribution} />
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {profile.distribution.map((entry) => (
          <li key={entry.level} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
            {entry.label} {entry.max === null ? `${entry.min}+` : `${entry.min}–${entry.max}`}
            <b className="ml-auto tabular-nums text-gray-900">{integer.format(entry.share)} %</b>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-3 gap-2 border-t border-gray-200 pt-2.5">
        {[
          { label: 'adversaires en moyenne', value: decimal.format(profile.average), color: undefined },
          { label: 'au pire drop', value: integer.format(profile.maximum), color: '#ef4444' },
          { label: 'de hot drops', value: `${integer.format(profile.hotDropShare)} %`, color: '#f97316' },
        ].map((kpi) => (
          <div key={kpi.label} className="flex flex-col-reverse gap-px">
            <dt className="text-[11px] leading-tight text-gray-500">{kpi.label}</dt>
            <dd className="text-xl font-black tabular-nums text-gray-900" style={kpi.color ? { color: kpi.color } : undefined}>{kpi.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function TopSpotsList({ explorer, showKing }: { explorer: DropZonesExplorerState; showKing: boolean }) {
  const top5 = explorer.spots.slice(0, 5)
  const inCity = explorer.spots.reduce((sum, spot) => sum + spot.count, 0)
  const outside = explorer.visiblePoints.length - inCity
  return (
    <section className="app-panel flex flex-col overflow-hidden" aria-labelledby="top-spots-title">
      <div className="flex items-baseline gap-2 px-4 pb-2 pt-3">
        <h2 id="top-spots-title" className="text-[15px] font-extrabold text-gray-900">Top 5 des spots</h2>
        <span className="text-xs text-gray-500">{integer.format(inCity)} en ville · {integer.format(outside)} hors périmètre</span>
      </div>
      {top5.length > 0 ? (
        <ol aria-label="Top 5 des spots">
          {top5.map((spot: SpotStat, index) => {
            const selected = explorer.selectedSpot?.location.id === spot.location.id
            return (
              <li key={spot.location.id}>
                <button
                  type="button"
                  onClick={() => explorer.selectSpot(spot.location)}
                  aria-pressed={selected}
                  className={`grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-gray-200 px-4 py-2 text-left hover:bg-gray-50 ${selected ? 'bg-orange-500/10 shadow-[inset_3px_0_0_#f97316]' : ''}`}
                >
                  <span
                    className="grid h-[22px] w-[22px] place-items-center rounded-full text-[11px] font-black"
                    style={{ backgroundColor: RANK_COLORS[index] ?? 'var(--theme-ui-surface-strong)', color: index < 3 ? (index === 2 ? '#fff' : '#020617') : 'var(--theme-ui-text)' }}
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <b className="truncate text-sm text-gray-900">{spot.location.name}</b>
                    <PressureBar distribution={spot.distribution} thin />
                    <span className="truncate text-[11px] text-gray-500">
                      {decimal.format(spot.average)} adv. · {integer.format(spot.hotDropShare)} % hot
                      {showKing && spot.king ? ` · ${spot.king.name} ×${spot.king.count}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-col items-end tabular-nums">
                    <b className="text-base text-gray-900">{spot.count}</b>
                    <span className="text-[11px] text-gray-500">{integer.format(spot.share)} %</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-500">Aucun saut dans une ville sur cette carte.</p>
      )}
      <span className="border-t border-gray-200 px-4 pb-3 pt-2 text-[11px] text-gray-500">Touchez un spot pour zoomer dessus.</span>
    </section>
  )
}

const SM_QUERY = '(min-width: 640px)'
function subscribeSmallScreen(onChange: () => void) {
  const query = window.matchMedia(SM_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

// ── Qui saute où ─────────────────────────────────────────────────────────────────────────────────

export function WhoJumpsWhere({
  explorer,
  periodLabel,
  selectedMemberId,
  onSelectMember,
}: {
  explorer: DropZonesExplorerState
  periodLabel: string
  selectedMemberId: number | null
  onSelectMember: (memberId: number | null) => void
}) {
  const [page, setPage] = useState(1)
  // 2 cartes par page sur mobile, 4 à partir de `sm` : jamais de défilement horizontal.
  const perPage = useSyncExternalStore(subscribeSmallScreen, () => (window.matchMedia(SM_QUERY).matches ? 4 : 2), () => 4)
  const summaries = useMemo(() => memberJumpSummaries(explorer.mapPoints, explorer.locations), [explorer.locations, explorer.mapPoints])

  const { current, pageCount, visible } = paginate(summaries, page, perPage)
  if (summaries.length === 0) return null

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="who-jumps-title">
      <div className="flex items-center gap-2">
        <h2 id="who-jumps-title" className="whitespace-nowrap text-[17px] font-extrabold text-gray-900">Qui saute où</h2>
        <span className="truncate text-[13px] text-gray-500">{mapLabel(explorer.activeMap)} · {periodLabel}</span>
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
        {visible.map((member) => {
          const color = memberColor(member.memberId)
          const selected = selectedMemberId === member.memberId
          const level = DROP_PRESSURE_LEVELS[member.level]
          return (
            <li key={member.memberId} className="flex min-w-0">
              <button
                type="button"
                onClick={() => onSelectMember(selected ? null : member.memberId)}
                aria-pressed={selected}
                aria-label={`${member.name} : filtrer la carte`}
                className="app-panel flex w-full min-w-0 flex-col gap-2 px-3.5 py-3 text-left transition hover:border-[var(--theme-ui-accent-ring)]"
                style={selected ? { borderColor: color, boxShadow: `0 0 0 3px ${color}40` } : undefined}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black text-[#020617]" style={{ backgroundColor: color }}>
                    {member.name.replace(/^Joueur\s+/, '').charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <b className="truncate text-sm text-gray-900">{member.name}</b>
                    <span className="text-[11px] text-gray-500">
                      {member.jumps} saut{member.jumps > 1 ? 's' : ''} · {decimal.format(member.average)} adv.
                    </span>
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-gray-500">Spot préféré</span>
                  <b className="truncate text-[13px] text-gray-900">{member.favorite ? `${member.favorite.name} ×${member.favorite.count}` : '—'}</b>
                </span>
                <span className="inline-flex items-center gap-1.5 self-start rounded-md bg-[var(--theme-ui-surface-strong)] px-2 py-0.5 text-[11px] font-bold text-gray-700">
                  <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: level.color }} aria-hidden="true" />
                  {level.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
