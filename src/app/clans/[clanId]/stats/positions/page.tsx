'use client'

import Image from 'next/image'
import { Compass } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import DropZoneMapViewport, {
  type DropZoneMapViewportHandle,
} from '@/components/drop-zones/DropZoneMapViewport'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'

import { mapDisplayName } from '@/lib/map-label-service'
import type { MapLocation, MapLocations } from '@/lib/map-location-service'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import {
  TACTICAL_PHASE_OPTIONS,
  tacticalPhaseLabel,
  type TacticalPhase,
} from '@/lib/tactical-phase'

type TelemetryPeriod = 'week' | 'month' | 'all'
type HeatmapCategory = 'combat' | 'equipe'
type HeatmapView =
  | 'kill'
  | 'shot'
  | 'damage'
  | 'knockout'
  | 'revive'
  | 'vehicle'
  | 'death'
type HeatmapViewSelection = HeatmapView | 'all'
type HeatmapRole = 'a' | 'b'
type HeatmapCell = {
  xIndex: number
  yIndex: number
  count: number
}

type HeatmapLayer = {
  key: string
  label: string
  color: string
  cells: HeatmapCell[]
  dot?: boolean
}

type HeatRange = {
  min: number
  max: number
  color: string
  label: string
}

type MemberOption = {
  memberKey: string
  memberLabel: string
  points: number
}

type SafeZoneOverlay = {
  x: number
  y: number
  r: number
}

type PositionsHeatmapResponse = {
  ok: boolean
  clanId: number
  period: TelemetryPeriod
  periodKey: string
  selectedMap: string | null
  selectedMapLabel: string | null
  selectedMemberKey: string | null
  selectedPhase: TacticalPhase
  maps: Array<{
    mapName: string
    matches: number
  }>
  members: MemberOption[]
  phases: number[]
  deaths: HeatmapCell[]
  kills: HeatmapCell[]
  shots: HeatmapCell[]
  damageDealt: HeatmapCell[]
  damageTaken: HeatmapCell[]
  knockoutsDealt: HeatmapCell[]
  knockoutsTaken: HeatmapCell[]
  revivesGiven: HeatmapCell[]
  revivesTaken: HeatmapCell[]
  vehicles: HeatmapCell[]
  safeZoneOverlay: SafeZoneOverlay | null
  gridSize: number
  mapLabels: Record<string, string>
  phaseLabels: Record<string, string>
  options?: {
    mapLocations?: MapLocations
  }
  note: string | null
}

const PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tout' },
]

const CATEGORY_OPTIONS: Array<{ value: HeatmapCategory; label: string }> = [
  { value: 'combat', label: 'Combat' },
  { value: 'equipe', label: 'Équipe' },
]

const VIEW_OPTIONS_BY_CATEGORY: Record<HeatmapCategory, Array<{ value: HeatmapView; label: string }>> = {
  combat: [
    { value: 'kill', label: 'Kill' },
    { value: 'shot', label: 'Tirs' },
    { value: 'damage', label: 'Dégâts' },
    { value: 'knockout', label: 'KO' },
  ],
  equipe: [
    { value: 'revive', label: 'Revive' },
    { value: 'vehicle', label: 'Véhicule' },
    { value: 'death', label: 'Mort' },
  ],
}

const DEFAULT_VIEW_BY_CATEGORY: Record<HeatmapCategory, HeatmapView> = {
  combat: 'kill',
  equipe: 'revive',
}

type RoleOption = { value: HeatmapRole; label: string }
const ROLE_OPTIONS_BY_VIEW: Partial<Record<HeatmapView, [RoleOption, RoleOption]>> = {
  damage: [
    { value: 'a', label: 'Infligés' },
    { value: 'b', label: 'Reçus' },
  ],
  knockout: [
    { value: 'a', label: 'Infligé' },
    { value: 'b', label: 'Reçu' },
  ],
  revive: [
    { value: 'a', label: 'Donné' },
    { value: 'b', label: 'Reçu' },
  ],
}

const HEAT_RANGE_STEPS = [
  { ratio: 0.2, color: '#A5D6A7', label: 'Très faible' },
  { ratio: 0.4, color: '#4CAF50', label: 'Faible' },
  { ratio: 0.6, color: '#FFEB3B', label: 'Modérée' },
  { ratio: 0.8, color: '#FB8C00', label: 'Forte' },
  { ratio: 1, color: '#B71C1C', label: 'Point chaud' },
] as const

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function formatNumber(value: number) {
  return value.toLocaleString('fr-FR')
}

function mapAssetPath(mapName: string) {
  return `/maps/pubg/${mapName}.webp`
}

function dotColor(view: HeatmapView): string {
  switch (view) {
    case 'death': return '255, 84, 106'
    case 'kill': return '255, 200, 0'
    case 'shot': return '180, 80, 255'
    case 'damage': return '255, 80, 80'
    case 'knockout': return '255, 150, 0'
    case 'revive': return '80, 255, 150'
    case 'vehicle': return '0, 210, 200'
  }
}

function dotColorForRole(view: HeatmapView, role: HeatmapRole): string {
  if (view === 'damage' && role === 'b') return '255, 130, 180'
  if (view === 'knockout' && role === 'b') return '255, 100, 40'
  if (view === 'revive' && role === 'b') return '60, 200, 120'
  return dotColor(view)
}

function viewLabel(view: HeatmapView, role: HeatmapRole): string {
  const roleOptions = ROLE_OPTIONS_BY_VIEW[view]
  if (!roleOptions) return VIEW_OPTIONS_BY_CATEGORY.combat.find(o => o.value === view)?.label
    ?? VIEW_OPTIONS_BY_CATEGORY.equipe.find(o => o.value === view)?.label
    ?? view
  return roleOptions[role === 'a' ? 0 : 1].label
}

function pointSize(ratio: number) {
  return 10 + Math.sqrt(ratio) * 20
}

function minimumHeatCount(maximum: number) {
  if (maximum <= 0) return 0
  return Math.max(1, Math.floor(Math.log10(maximum)))
}

function isPointView(view: HeatmapView) {
  return view === 'kill' || view === 'knockout' || view === 'revive' || view === 'vehicle' || view === 'death'
}

function buildHeatRanges(minimum: number, maximum: number): HeatRange[] {
  if (minimum <= 0 || maximum <= 0) return []

  const ranges: HeatRange[] = []
  const minimumLog = Math.log(minimum)
  const logarithmicSpan = Math.log(maximum) - minimumLog
  let rangeMinimum = minimum

  for (const step of HEAT_RANGE_STEPS) {
    if (rangeMinimum > maximum) break
    const logarithmicMaximum = Math.floor(Math.exp(minimumLog + logarithmicSpan * step.ratio))
    const rangeMaximum = step.ratio === 1
      ? maximum
      : Math.min(maximum, Math.max(rangeMinimum, logarithmicMaximum))
    ranges.push({ ...step, min: rangeMinimum, max: rangeMaximum })
    rangeMinimum = rangeMaximum + 1
  }

  return ranges
}

function heatRangeLabel(range: HeatRange) {
  return range.min === range.max
    ? formatNumber(range.min)
    : `${formatNumber(range.min)}–${formatNumber(range.max)}`
}

function heatRangeForCount(count: number, ranges: HeatRange[]) {
  return ranges.find((range) => count >= range.min && count <= range.max) ?? null
}

function logarithmicIntensity(count: number, minimum: number, maximum: number) {
  if (maximum <= minimum) return 1
  return clamp01((Math.log(count) - Math.log(minimum)) / (Math.log(maximum) - Math.log(minimum)))
}

function locationForPercent(xPct: number, yPct: number, locations: MapLocation[]) {
  let closestLocation: MapLocation | null = null
  let closestRatio = Number.POSITIVE_INFINITY

  for (const location of locations) {
    const ratio = Math.hypot(xPct - location.xPct, yPct - location.yPct) / location.radiusPct
    if (ratio <= 1 && ratio < closestRatio) {
      closestLocation = location
      closestRatio = ratio
    }
  }

  return closestLocation
}

function pickCells(payload: PositionsHeatmapResponse, view: HeatmapView, role: HeatmapRole): HeatmapCell[] {
  switch (view) {
    case 'death': return payload.deaths
    case 'kill': return payload.kills ?? []
    case 'shot': return payload.shots ?? []
    case 'damage': return role === 'a' ? (payload.damageDealt ?? []) : (payload.damageTaken ?? [])
    case 'knockout': return role === 'a' ? (payload.knockoutsDealt ?? []) : (payload.knockoutsTaken ?? [])
    case 'revive': return role === 'a' ? (payload.revivesGiven ?? []) : (payload.revivesTaken ?? [])
    case 'vehicle': return payload.vehicles ?? []
  }
}

function mergeCells(...groups: HeatmapCell[][]): HeatmapCell[] {
  const byCell = new Map<string, HeatmapCell>()
  for (const group of groups) {
    for (const cell of group) {
      const key = `${cell.xIndex}-${cell.yIndex}`
      const existing = byCell.get(key)
      if (existing) {
        existing.count += cell.count
        continue
      }
      byCell.set(key, { ...cell })
    }
  }
  return [...byCell.values()]
}

function pickAllCategoryLayers(payload: PositionsHeatmapResponse, category: HeatmapCategory): HeatmapLayer[] {
  if (category === 'combat') {
    return [
      { key: 'kill', label: 'Kill', color: dotColor('kill'), cells: payload.kills ?? [], dot: true },
      { key: 'shot', label: 'Tirs', color: dotColor('shot'), cells: payload.shots ?? [] },
      {
        key: 'damage',
        label: 'Dégâts',
        color: dotColor('damage'),
        cells: mergeCells(payload.damageDealt ?? [], payload.damageTaken ?? []),
      },
      {
        key: 'knockout',
        label: 'KO',
        color: dotColor('knockout'),
        cells: mergeCells(payload.knockoutsDealt ?? [], payload.knockoutsTaken ?? []),
        dot: true,
      },
    ]
  }
  if (category === 'equipe') {
    return [
      {
        key: 'revive',
        label: 'Revive',
        color: dotColor('revive'),
        cells: mergeCells(payload.revivesGiven ?? [], payload.revivesTaken ?? []),
        dot: true,
      },
      { key: 'vehicle', label: 'Véhicule', color: dotColor('vehicle'), cells: payload.vehicles ?? [], dot: true },
      { key: 'death', label: 'Mort', color: dotColor('death'), cells: payload.deaths ?? [], dot: true },
    ]
  }
  return [] as HeatmapLayer[]
}

const LEGEND_BY_CATEGORY: Record<HeatmapCategory, Array<{ color: string; label: string; desc: string }>> = {
  combat: [
    { color: 'rgb(255,200,0)', label: 'Kill', desc: 'Position du tueur membre du clan au moment du kill.' },
    { color: 'rgb(180,80,255)', label: 'Tirs', desc: 'Clusters de tirs — pondérés par volume réel.' },
    { color: 'rgb(255,80,80)', label: 'Dégâts infligés', desc: 'Positions lors de dégâts infligés.' },
    { color: 'rgb(255,130,180)', label: 'Dégâts reçus', desc: 'Positions lors de dégâts reçus.' },
    { color: 'rgb(255,150,0)', label: 'KO infligé', desc: 'Positions lors d\'un KO infligé.' },
    { color: 'rgb(255,100,40)', label: 'KO reçu', desc: 'Positions lors d\'un KO reçu.' },
  ],
  equipe: [
    { color: 'rgb(80,255,150)', label: 'Revive donné', desc: 'Position du reviveur au moment du revive.' },
    { color: 'rgb(60,200,120)', label: 'Revive reçu', desc: 'Position du revivé au moment du revive.' },
    { color: 'rgb(0,210,200)', label: 'Véhicule', desc: 'Montées et descentes de véhicule.' },
    { color: 'rgb(255,84,106)', label: 'Mort', desc: 'Emplacements de mort des membres du clan.' },
  ],
}

const pendingPositionRequests = new Map<string, Promise<PositionsHeatmapResponse>>()

function fetchPositions(url: string) {
  const pending = pendingPositionRequests.get(url)
  if (pending) return pending

  const request = fetch(url, { cache: 'no-store' })
    .then(async (response) => {
      const data = (await response.json()) as PositionsHeatmapResponse | { error?: { message?: string } }
      if (!response.ok) {
        const fallback = 'Impossible de charger les heatmaps positions'
        const message = 'error' in data ? data.error?.message ?? fallback : fallback
        throw new Error(message)
      }
      return data as PositionsHeatmapResponse
    })
    .finally(() => pendingPositionRequests.delete(url))

  pendingPositionRequests.set(url, request)
  return request
}

export default function ClanPositionsHeatmapPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const mapViewportRef = useRef<DropZoneMapViewportHandle>(null)

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [mapName, setMapName] = useState('')
  const [memberKey, setMemberKey] = useState('')
  const [phase, setPhase] = useState<TacticalPhase>('all')
  const [category, setCategory] = useState<HeatmapCategory>('combat')
  const [view, setView] = useState<HeatmapViewSelection>('kill')
  const [role, setRole] = useState<HeatmapRole>('a')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [showLocationBoundaries, setShowLocationBoundaries] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<PositionsHeatmapResponse | null>(null)
  function handleCategoryChange(next: HeatmapCategory) {
    setCategory(next)
    setView(DEFAULT_VIEW_BY_CATEGORY[next])
    setRole('a')
  }

  function handleViewChange(next: HeatmapViewSelection) {
    setView(next)
    setRole('a')
  }

  useEffect(() => {
    if (!clanId) {
      return
    }

    let cancelled = false

    async function loadHeatmap() {
      try {
        setLoading(true)
        setError('')

        const query = new URLSearchParams({ period })
        if (mapName.trim()) {
          query.set('map', mapName.trim())
        }
        if (memberKey.trim()) {
          query.set('memberKey', memberKey.trim())
        }
        if (phase !== 'all') {
          query.set('phase', String(phase))
        }
        const data = await fetchPositions(`/api/clans/${clanId}/telemetry/positions?${query.toString()}`)

        if (!cancelled) {
          const nextPayload = data
          setPayload(nextPayload)

          const nextMember = nextPayload.selectedMemberKey ?? ''
          if (nextMember !== memberKey) {
            setMemberKey(nextMember)
          }

          const nextPhase = nextPayload.selectedPhase
          if (nextPhase !== phase) {
            setPhase(nextPhase)
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setPayload(null)
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les heatmaps positions')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadHeatmap()

    return () => {
      cancelled = true
    }
  }, [clanId, period, mapName, memberKey, phase])

  const layers = useMemo(() => {
    if (!payload) return [] as HeatmapLayer[]
    if (view === 'all') {
      return pickAllCategoryLayers(payload, category)
    }
    return [{
      key: `view-${view}-${role}`,
      label: viewLabel(view, role),
      color: dotColorForRole(view, role),
      cells: pickCells(payload, view, role),
      dot: isPointView(view),
    }]
  }, [payload, view, role, category])

  const activeLocations = useMemo(() => {
    if (!payload?.selectedMap) return []
    return payload.options?.mapLocations?.[payload.selectedMap] ?? []
  }, [payload])

  const topZones = useMemo(() => {
    const counts = new Map<string, { location: MapLocation; count: number }>()
    for (const layer of layers) {
      for (const cell of layer.cells) {
        const xPct = ((cell.xIndex + 0.5) / (payload?.gridSize ?? 1)) * 100
        const yPct = ((cell.yIndex + 0.5) / (payload?.gridSize ?? 1)) * 100
        const location = locationForPercent(xPct, yPct, activeLocations)
        if (!location) continue
        const current = counts.get(location.id)
        counts.set(location.id, {
          location,
          count: (current?.count ?? 0) + cell.count,
        })
      }
    }
    return Array.from(counts.values())
      .sort((left, right) => right.count - left.count || left.location.name.localeCompare(right.location.name, 'fr'))
      .slice(0, 5)
  }, [activeLocations, layers, payload?.gridSize])

  const maxCellCount = useMemo(
    () => layers.reduce((globalMax, layer) => Math.max(globalMax, layer.cells.reduce((max, cell) => Math.max(max, cell.count), 0)), 0),
    [layers],
  )
  const usesDensityGradation = view !== 'all' && !isPointView(view)
  const minimumHeat = useMemo(
    () => usesDensityGradation ? minimumHeatCount(maxCellCount) : 0,
    [maxCellCount, usesDensityGradation],
  )
  const heatRanges = useMemo(
    () => buildHeatRanges(minimumHeat, maxCellCount),
    [maxCellCount, minimumHeat],
  )
  const totalCellCount = useMemo(
    () => layers.reduce((sum, layer) => sum + layer.cells.reduce((layerSum, cell) => layerSum + cell.count, 0), 0),
    [layers],
  )
  const totalRenderedCells = useMemo(() => layers.reduce((sum, layer) => sum + layer.cells.length, 0), [layers])
  const visibleRenderedCells = useMemo(
    () => layers.reduce(
      (sum, layer) => sum + layer.cells.filter((cell) => !usesDensityGradation || cell.count >= minimumHeat).length,
      0,
    ),
    [layers, minimumHeat, usesDensityGradation],
  )
  const visibleEventCount = useMemo(
    () => layers.reduce(
      (sum, layer) => sum + layer.cells.reduce(
        (layerSum, cell) => layerSum + (!usesDensityGradation || cell.count >= minimumHeat ? cell.count : 0),
        0,
      ),
      0,
    ),
    [layers, minimumHeat, usesDensityGradation],
  )
  const analyzedMatches = useMemo(() => {
    if (!payload) return 0
    if (payload.selectedMap) {
      return payload.maps.find((entry) => entry.mapName === payload.selectedMap)?.matches ?? 0
    }
    return payload.maps.reduce((sum, entry) => sum + entry.matches, 0)
  }, [payload])

  const selectedMapLabel =
    payload?.selectedMap ? mapDisplayName(payload.selectedMap, payload.mapLabels) : 'Aucune carte'

  const selectedMemberLabel =
    memberKey.length > 0
      ? payload?.members.find((entry) => entry.memberKey === memberKey)?.memberLabel ?? memberKey
      : 'Tous les membres'

  const periodLabel = PERIOD_OPTIONS.find((entry) => entry.value === period)?.label ?? 'Semaine'
  const categoryLabel = CATEGORY_OPTIONS.find((entry) => entry.value === category)?.label ?? 'Combat'
  const viewLabelCurrent = view === 'all'
    ? 'Tous'
    : VIEW_OPTIONS_BY_CATEGORY[category].find((entry) => entry.value === view)?.label ?? viewLabel(view, role)
  const selectedPhaseLabel = tacticalPhaseLabel(phase)

  const periodItems = PERIOD_OPTIONS.map((entry) => ({
    key: `period-${entry.value}`,
    label: entry.label,
    active: period === entry.value,
    onSelect: () => setPeriod(entry.value),
  }))

  function selectMap(nextMapName: string) {
    setMapName(nextMapName)
    setSelectedLocationId('')
    mapViewportRef.current?.reset()
  }

  const activeMapName = mapName || payload?.selectedMap || ''
  const mapNames = (payload?.maps ?? []).map((entry) => entry.mapName)

  function handleSwipeMap(direction: 'prev' | 'next') {
    if (loading || mapNames.length < 2) return
    const currentIndex = mapNames.indexOf(activeMapName)
    if (currentIndex === -1) return
    const nextIndex =
      direction === 'next'
        ? (currentIndex + 1) % mapNames.length
        : (currentIndex - 1 + mapNames.length) % mapNames.length
    selectMap(mapNames[nextIndex])
  }

  const mapItems = (payload?.maps ?? []).map((entry) => ({
      key: `map-${entry.mapName}`,
      label: mapDisplayName(entry.mapName, payload?.mapLabels ?? {}),
      active: activeMapName === entry.mapName,
      onSelect: () => selectMap(entry.mapName),
    }))

  const locationItems = [
    {
      key: 'location-all',
      label: 'Carte entière',
      active: selectedLocationId === '',
      onSelect: () => {
        setSelectedLocationId('')
        mapViewportRef.current?.reset()
      },
    },
    ...activeLocations.map((location) => ({
      key: `location-${location.id}`,
      label: location.name,
      active: selectedLocationId === location.id,
      onSelect: () => {
        setSelectedLocationId(location.id)
        mapViewportRef.current?.focusLocation(location)
      },
    })),
  ]
  const selectedLocationLabel = activeLocations.find((location) => location.id === selectedLocationId)?.name
    ?? 'Carte entière'

  const phaseItems = TACTICAL_PHASE_OPTIONS.map((entry) => ({
    key: `phase-${entry.value}`,
    label: entry.label,
    active: phase === entry.value,
    onSelect: () => setPhase(entry.value),
  }))

  const categoryItems = CATEGORY_OPTIONS.map((entry) => ({
    key: `category-${entry.value}`,
    label: entry.label,
    active: category === entry.value,
    onSelect: () => handleCategoryChange(entry.value),
  }))

  const viewItems = [
    {
      key: 'view-all',
      label: 'Tous',
      active: view === 'all',
      onSelect: () => handleViewChange('all'),
    },
    ...VIEW_OPTIONS_BY_CATEGORY[category].map((entry) => ({
      key: `view-${entry.value}`,
      label: entry.label,
      active: view === entry.value,
      onSelect: () => handleViewChange(entry.value),
    })),
  ]

  const memberItems = [
    {
      key: 'member-all',
      label: 'Tous',
      active: memberKey === '',
      onSelect: () => setMemberKey(''),
    },
    ...((payload?.members ?? []).map((entry) => ({
      key: `member-${entry.memberKey}`,
      label: entry.memberLabel,
      active: memberKey === entry.memberKey,
      onSelect: () => setMemberKey(entry.memberKey),
    }))),
  ]

  if (!clanId) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <NavigationTrail
        currentLabel="Positions & Top 10"
        currentHref={`/clans/${clanId}/stats/positions`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />
        <p className="text-sm text-red-600">Clan invalide.</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <header
        className="relative mb-5 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/cartographie-tactique.jpg')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Compass className="h-4 w-4 text-cyan-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Cartographie tactique</h1>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
            Zones de combat et d&apos;entraide par ville, joueur et période.
          </p>
        </div>
      </header>

      <section className="app-panel mb-5 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <MobileDropdownNav
              id="positions-period-filter"
              label="Periode"
              currentLabel={periodLabel}
              items={periodItems}
              visibilityClass=""
              className="w-full"
            />
          </div>

          <div className="min-w-0">
            <MobileDropdownNav
              id="positions-map-filter"
              label="Carte"
              currentLabel={payload?.selectedMap ? mapDisplayName(payload.selectedMap, payload.mapLabels) : 'Aucune carte'}
              items={mapItems}
              visibilityClass=""
              className="w-full"
            />
          </div>

          <div className="min-w-0">
            <MobileDropdownNav
              id="positions-phase-filter"
              label="Phase cercle"
              currentLabel={selectedPhaseLabel}
              items={phaseItems}
              visibilityClass=""
              className="w-full"
            />
          </div>

          <div className="min-w-0">
            <MobileDropdownNav
              id="positions-member-filter"
              label="Joueur"
              currentLabel={selectedMemberLabel}
              items={memberItems}
              visibilityClass=""
              className="w-full"
            />
          </div>

          <div className="min-w-0">
            <MobileDropdownNav
              id="positions-category-filter"
              label="Categorie"
              currentLabel={categoryLabel}
              items={categoryItems}
              visibilityClass=""
              className="w-full"
            />
          </div>

          <div className="min-w-0">
            <MobileDropdownNav
              id="positions-view-filter"
              label="Vue"
              currentLabel={viewLabelCurrent}
              items={viewItems}
              visibilityClass=""
              className="w-full"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs text-slate-600 sm:grid-cols-3 lg:grid-cols-6">
          {LEGEND_BY_CATEGORY[category].map((item) => (
            <div key={item.label}>
              <p className="font-semibold text-slate-700">
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: item.color }} />
                {item.label}
              </p>
              <p className="text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
        {usesDensityGradation && heatRanges.length > 0 ? (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">
                Gradation de {viewLabelCurrent.toLowerCase()} · échelle logarithmique
              </p>
              <p className="text-xs text-slate-500">
                Seuil visible {formatNumber(minimumHeat)} · maximum {formatNumber(maxCellCount)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              {heatRanges.map((range) => (
                <div key={`${range.min}-${range.max}`} className="flex items-center gap-2 text-slate-600">
                  <span className="h-3 w-5 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: range.color }} />
                  <span><strong className="font-semibold text-slate-700">{range.label}</strong> {heatRangeLabel(range)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : view === 'all' ? (
          <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
            Vue combinée : la couleur identifie la métrique ; la taille et l’opacité indiquent son intensité relative.
          </p>
        ) : null}
      </section>

      {loading ? <p className="mb-4 text-sm text-slate-600">Chargement des heatmaps positions...</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && payload ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Matchs analyses: {formatNumber(analyzedMatches)}</span>
            <span className="text-slate-600">
              Événements visibles: {formatNumber(visibleEventCount)}
            </span>
            <span className="text-slate-600">
              Cellules visibles: {formatNumber(visibleRenderedCells)} / {formatNumber(totalRenderedCells)}
            </span>
            <span className="text-slate-600">
              Intensite max: {formatNumber(maxCellCount)}
            </span>
          </div>

          <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Top 5 des zones</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  {topZones[0]
                    ? `Zone principale : ${topZones[0].location.name}`
                    : 'Aucune zone urbaine identifiée'}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Classement des villes pour la vue {viewLabelCurrent.toLowerCase()}.
                </p>
              </div>
              <div className="grid min-w-full gap-3 sm:min-w-0 sm:grid-cols-[minmax(13rem,1fr)_auto] sm:items-end">
                <MobileDropdownNav
                  id="positions-location-filter"
                  label="Ville"
                  currentLabel={selectedLocationLabel}
                  items={locationItems}
                  visibilityClass=""
                  className="w-full"
                />
                <span className="pb-2 text-xs text-gray-500">{selectedMapLabel}</span>
              </div>
            </div>
            {topZones.length > 0 ? (
              <div className="app-table-shell overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <th className="w-16 px-3 py-2 text-center">Rang</th>
                      <th className="px-3 py-2 text-left">Ville</th>
                      <th className="px-3 py-2 text-right">Événements</th>
                      <th className="px-3 py-2 text-right">Part visible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topZones.map((zone, index) => {
                      const rank = index + 1
                      const medal = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null
                      return (
                        <tr key={zone.location.id} className={`app-table-row ${rank <= 3 ? `app-table-row--top${rank}` : ''}`}>
                          <td className="px-3 py-3 text-center font-semibold">
                            {medal ? (
                              <Image src={`/icons/medal-${medal}.svg`} alt={`Médaille, rang ${rank}`} width={24} height={24} className="mx-auto h-6 w-6" />
                            ) : rank}
                          </td>
                          <td className="px-3 py-3 font-medium text-gray-900">
                            <button
                              type="button"
                              className="hover:text-cyan-600 hover:underline"
                              onClick={() => {
                                setSelectedLocationId(zone.location.id)
                                mapViewportRef.current?.focusLocation(zone.location)
                              }}
                            >
                              {zone.location.name}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">{formatNumber(zone.count)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-600">
                            {totalCellCount > 0 ? `${((zone.count / totalCellCount) * 100).toFixed(1).replace('.', ',')} %` : '0 %'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="app-panel-muted rounded-lg px-4 py-5 text-sm text-gray-500">
                Aucune zone urbaine identifiée pour cette vue.
              </p>
            )}
          </div>

          <div>
            <DropZoneMapViewport
              ref={mapViewportRef}
              boundariesVisible={showLocationBoundaries}
              onBoundariesVisibleChange={setShowLocationBoundaries}
              onSwipeMap={handleSwipeMap}
            >
              {payload.selectedMap ? (
                <>
                  <Image
                    src={mapAssetPath(payload.selectedMap)}
                    alt={selectedMapLabel}
                    fill
                    className="object-cover opacity-80 brightness-[0.72] saturate-[0.8] contrast-[1.08]"
                    sizes="(max-width: 1280px) 100vw, 70vw"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-slate-950/20" />
                </>
              ) : null}

              <div className="absolute inset-0 overflow-hidden">
                {showLocationBoundaries ? activeLocations.map((location) => (
                  <div
                    key={location.id}
                    className={`pointer-events-none absolute z-10 rounded-full border ${
                      selectedLocationId === location.id
                        ? 'border-cyan-300 bg-cyan-300/15 shadow-[0_0_20px_rgba(103,232,249,0.45)]'
                        : 'border-white/25 bg-transparent'
                    }`}
                    style={{
                      left: `${location.xPct}%`,
                      top: `${location.yPct}%`,
                      width: `${location.radiusPct * 2}%`,
                      aspectRatio: '1',
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-950/75 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm">
                      {location.name}
                    </span>
                  </div>
                )) : null}
                <>
                    {payload.safeZoneOverlay ? (
                      <svg
                        className="absolute inset-0 h-full w-full"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{ pointerEvents: 'none' }}
                      >
                        <circle
                          cx={payload.safeZoneOverlay.x}
                          cy={payload.safeZoneOverlay.y}
                          r={payload.safeZoneOverlay.r}
                          fill="rgba(52, 211, 153, 0.06)"
                          stroke="rgba(52, 211, 153, 0.7)"
                          strokeWidth={0.5}
                          strokeDasharray="2 1.5"
                        />
                      </svg>
                    ) : null}
                    {layers.map((layer) => {
                      const layerMaxCount = layer.cells.reduce((max, cell) => Math.max(max, cell.count), 0)
                      return layer.cells.map((cell) => {
                        const ratio = layerMaxCount > 0 ? clamp01(cell.count / layerMaxCount) : 0
                        if (usesDensityGradation && cell.count < minimumHeat) return null

                        const heatRange = usesDensityGradation ? heatRangeForCount(cell.count, heatRanges) : null
                        const intensity = usesDensityGradation
                          ? logarithmicIntensity(cell.count, minimumHeat, layerMaxCount)
                          : ratio
                        const left = ((cell.xIndex + 0.5) / payload.gridSize) * 100
                        const top = ((cell.yIndex + 0.5) / payload.gridSize) * 100
                        const size = pointSize(ratio)

                        if (layer.dot) {
                          const dotSize = 12 + Math.sqrt(ratio) * 16
                          const markerColor = `rgb(${layer.color})`
                          return (
                            <div
                              key={`${layer.key}-${cell.xIndex}-${cell.yIndex}`}
                              className="absolute z-20 flex items-center justify-center rounded-full border-2 border-white/90 font-black text-slate-950"
                              style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                width: `${dotSize}px`,
                                height: `${dotSize}px`,
                                transform: 'translate(-50%, -50%)',
                                backgroundColor: markerColor,
                                boxShadow: `0 0 0 2px rgba(2, 6, 23, 0.78), 0 0 ${8 + ratio * 10}px rgba(${layer.color}, 0.9)`,
                              }}
                              title={`${layer.label} · ${heatRange?.label ?? 'Intensité relative'} · ${formatNumber(cell.count)} événements`}
                            >
                              {cell.count > 1 ? (
                                <span className="text-[9px] leading-none">
                                  {cell.count}
                                </span>
                              ) : null}
                            </div>
                          )
                        }
                        if (usesDensityGradation && heatRange) {
                          return (
                            <div
                              key={`${layer.key}-${cell.xIndex}-${cell.yIndex}`}
                              className="absolute z-20 rounded-[28%] border border-white/75"
                              style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                width: `${100 / payload.gridSize}%`,
                                height: `${100 / payload.gridSize}%`,
                                transform: 'translate(-50%, -50%)',
                                backgroundColor: heatRange.color,
                                boxShadow: '0 0 0 1px rgba(2, 6, 23, 0.7), 0 2px 8px rgba(2, 6, 23, 0.5)',
                                opacity: 0.62 + intensity * 0.33,
                              }}
                              title={`${layer.label} · ${heatRange.label} · ${formatNumber(cell.count)} événements`}
                            />
                          )
                        }
                        return (
                          <div
                            key={`${layer.key}-${cell.xIndex}-${cell.yIndex}`}
                            className="absolute z-20 rounded-[30%] border border-white/70"
                            style={{
                              left: `${left}%`,
                              top: `${top}%`,
                              width: `${size}px`,
                              height: `${size}px`,
                              transform: 'translate(-50%, -50%)',
                              backgroundColor: `rgba(${layer.color}, ${0.68 + ratio * 0.27})`,
                              boxShadow: `0 0 0 1px rgba(2, 6, 23, 0.72), 0 0 ${5 + ratio * 8}px rgba(${layer.color}, 0.65)`,
                            }}
                            title={`${layer.label} x:${cell.xIndex} y:${cell.yIndex} c:${cell.count}`}
                          />
                        )
                      })
                    })}
                </>
              </div>

              <div className="absolute bottom-4 left-4 z-30 rounded border border-cyan-300/35 bg-slate-950/80 px-4 py-2 text-white shadow-[0_10px_30px_rgba(15,23,42,0.45)] backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Carte visible</p>
                <p className="mt-0.5 text-lg font-bold leading-tight text-white">{selectedMapLabel}</p>
                {payload.safeZoneOverlay ? (
                  <p className="mt-1 text-[10px] text-emerald-200">Cercle vert : zone de sécurité moyenne</p>
                ) : null}
              </div>
            </DropZoneMapViewport>
          </div>
        </section>
      ) : null}
    </main>
  )
}
