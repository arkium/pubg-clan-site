'use client'

import { Compass } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'

import type { DropZoneMapViewportHandle } from '@/components/drop-zones/DropZoneMapViewport'
import { MapPager, mapLabel, PickerChip } from '@/components/maps/MapToolbarControls'
import {
  cellsOf,
  EventLegend,
  EventPicker,
  ForceReport,
  hashKey,
  HotZoneCard,
  PhasePicker,
  PositionsMap,
  TopCities,
  WhoDoesWhat,
  type PositionsPayload,
} from '@/components/positions/PositionsExplorer'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { memberColor } from '@/lib/drop-zones-view'
import type { MapLocation } from '@/lib/map-location-service'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'
import { eventTitle, kingOf, locationCounts, POSITION_EVENTS, positionEvent, totalOf, type PositionEventKey } from '@/lib/positions-view'
import type { TacticalPhase } from '@/lib/tactical-phase'

const pickPositions = (payload: unknown) => (payload as { data?: PositionsPayload } | null)?.data ?? null
const NO_LOCATIONS: MapLocation[] = []
const integer = new Intl.NumberFormat('fr-FR')

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Cartographie tactique — choisis un événement, lis la carte (maquette « Positions », 2026-09-27 ;
 * docs/features/positions.md). Bandeau des zones de drop (carte ‹ ›, période, joueur), sept événements, un seul rendu
 * à la fois, phase du cercle, zone chaude, rapport de force, top 5 et « Qui … où ».
 */
export default function ClanPositionsPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')
  const viewportRef = useRef<DropZoneMapViewportHandle>(null)
  // Lien préfiltré `?map=&view=` (ex-panneau « Villes », archivé le 2026-10-03) : état initial, la page prend le relais.
  const searchParams = useSearchParams()
  const [map, setMap] = useState<string | null>(() => searchParams.get('map'))
  const [memberKey, setMemberKey] = useState<string | null>(null)
  const [phase, setPhase] = useState<TacticalPhase>('all')
  const [eventKey, setEventKey] = useState<PositionEventKey>(() => {
    const view = searchParams.get('view')
    return POSITION_EVENTS.find((event) => event.key === view)?.key ?? 'kill'
  })
  const [roleIndex, setRoleIndex] = useState(0)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [transition, setTransition] = useState<{ key: number; from: 'left' | 'right' | null }>({ key: 0, from: null })

  const query = new URLSearchParams({ period, phase })
  if (map) query.set('map', map)
  if (memberKey) query.set('memberKey', memberKey)
  const { data, loading, error } = usePageData(
    clanId && ready ? `/api/clans/${clanId}/telemetry/positions?${query.toString()}` : null,
    pickPositions
  )

  const event = positionEvent(eventKey)
  const metric = event.roles[roleIndex].metric
  const activeMap = data?.selectedMap ?? ''
  const maps = data?.maps.map((entry) => entry.mapName) ?? []
  const locations = data?.options?.mapLocations?.[activeMap] ?? NO_LOCATIONS
  const cells = data ? cellsOf(data, metric) : []
  const counts = locationCounts(cells, locations, data?.gridSize ?? 40)
  const memberName = memberKey ? data?.members.find((member) => member.memberKey === memberKey)?.memberLabel ?? null : null

  function resetFocus() {
    setLocationId(null)
    viewportRef.current?.reset()
  }

  function selectLocation(location: MapLocation | null) {
    if (!location || location.id === locationId) {
      resetFocus()
      return
    }
    setLocationId(location.id)
    viewportRef.current?.focusLocation(location)
  }

  function selectMap(next: string, from: 'left' | 'right' | null = null) {
    setMap(next)
    setTransition((current) => ({ key: current.key + 1, from }))
    resetFocus()
  }

  function stepMap(direction: 'prev' | 'next') {
    if (maps.length < 2) return
    const index = Math.max(0, maps.indexOf(activeMap))
    selectMap(maps[(index + (direction === 'next' ? 1 : -1) + maps.length) % maps.length], direction === 'next' ? 'right' : 'left')
  }

  function selectMember(next: string | null) {
    setMemberKey(next)
    resetFocus()
  }

  if (!clanId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Clan invalide.</p>
      </div>
    )
  }

  const title = eventTitle(event, roleIndex)
  const verb = event.roles[roleIndex].verb
  const top = counts.cities[0]
  const king = !memberKey && top && data ? kingOf(data.memberBreakdown, metric, top.location.id) : null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Cartographie tactique"
          currentHref={`/clans/${clanId}/stats/positions`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-[#0b1220] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/cartographie-tactique.jpg')`, backgroundPosition: 'center 40%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-cyan-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-[22px] font-black tracking-tight text-white drop-shadow-md sm:text-3xl">Cartographie tactique</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md sm:text-sm">Où le clan se bat, tombe et se relève, ville par ville.</p>
          </div>
        </header>
      </div>

      {/* Même bandeau que les zones de drop, même exception à sticky.md §2 : carte, période et joueur sur une ligne. */}
      <DockingToolbar ariaLabel="Filtres de la cartographie tactique">
        <div className="flex w-full flex-nowrap items-center gap-1.5 sm:gap-2">
          <MapPager maps={maps} activeMap={activeMap} onStep={stepMap} onSelect={(next) => selectMap(next)} accent="#22d3ee" />
          <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} size="xs" className="map-toolbar-period" />
          <PickerChip
            ariaLabel="Joueur"
            label={memberName ?? 'Tout le clan'}
            color={memberKey ? memberColor(hashKey(memberKey)) : null}
            items={[
              { key: 'all', label: 'Tout le clan', color: null, active: memberKey === null, onSelect: () => selectMember(null) },
              ...(data?.members ?? []).map((member) => ({
                key: member.memberKey,
                label: member.memberLabel,
                color: memberColor(hashKey(member.memberKey)),
                active: memberKey === member.memberKey,
                onSelect: () => selectMember(member.memberKey),
              })),
            ]}
          />
          {data ? (
            <span className="ml-auto hidden whitespace-nowrap text-[13px] tabular-nums text-gray-500 lg:inline" data-testid="positions-summary">
              {integer.format(totalOf(cells))} {title.toLowerCase()} · {mapLabel(activeMap)}
            </span>
          ) : null}
        </div>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-[18px] pb-8">
        {error ? <p className="app-panel p-4 text-sm text-red-600">{error}</p> : null}
        {!data && loading ? <CardSkeleton /> : null}

        {data ? (
          maps.length > 0 ? (
            <div className={`flex flex-col gap-[18px] transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
              <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="flex min-w-0 flex-col gap-2.5">
                  <EventPicker
                    payload={data}
                    value={eventKey}
                    onChange={(next) => {
                      setEventKey(next)
                      setRoleIndex(0)
                      resetFocus()
                    }}
                  />
                  <PositionsMap
                    viewportRef={viewportRef}
                    payload={data}
                    event={event}
                    roleIndex={roleIndex}
                    onRole={(next) => {
                      setRoleIndex(next)
                      resetFocus()
                    }}
                    cells={cells}
                    top5={counts.cities.slice(0, 5)}
                    selectedLocationId={locationId}
                    onSelectLocation={selectLocation}
                    onStep={stepMap}
                    transition={transition}
                    emptyMessage={`Aucun événement « ${title.toLowerCase()} » pour ${memberName ?? 'le clan'} sur ${mapLabel(activeMap)} ${PERIOD_WHEN_LABELS[period]}`}
                  />
                  <EventLegend event={event} roleIndex={roleIndex} />
                  <PhasePicker
                    value={phase}
                    onChange={(next) => {
                      setPhase(next)
                      resetFocus()
                    }}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-[18px]">
                  <HotZoneCard
                    event={event}
                    roleIndex={roleIndex}
                    top={top}
                    total={counts.total}
                    activeMap={activeMap}
                    king={king}
                    title={memberName ? `${memberName} ${verb}` : `Là où le clan ${verb}`}
                    onSelect={selectLocation}
                  />
                  <ForceReport
                    kills={data.kills ?? []}
                    deaths={data.deaths ?? []}
                    locations={locations}
                    gridSize={data.gridSize}
                    selectedLocationId={locationId}
                    onSelect={selectLocation}
                  />
                  <TopCities event={event} roleIndex={roleIndex} counts={counts} selectedLocationId={locationId} onSelect={selectLocation} />
                </div>
              </div>
              <WhoDoesWhat
                event={event}
                roleIndex={roleIndex}
                breakdown={data.memberBreakdown ?? []}
                locations={locations}
                activeMap={activeMap}
                selectedMemberKey={memberKey}
                onSelect={selectMember}
              />
            </div>
          ) : (
            <p className="app-panel-muted p-4 text-sm text-gray-500">Aucune partie analysée {PERIOD_WHEN_LABELS[period]}.</p>
          )
        ) : null}
      </div>
    </div>
  )
}
