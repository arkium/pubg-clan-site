'use client'

import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import DropZoneMapViewport, {
  type DropZoneMapViewportHandle,
} from '@/components/drop-zones/DropZoneMapViewport'
import DropPressureLegend from '@/components/drop-zones/DropPressureLegend'
import DropPressureMarker from '@/components/drop-zones/DropPressureMarker'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'

import {
  DROP_PRESSURE_LEVELS,
  summarizeDropPressure,
  type DropPressureLevel,
} from '@/lib/drop-zone-pressure'
import { mapDisplayName } from '@/lib/map-label-service'
import type { MapLocation, MapLocations } from '@/lib/map-location-service'

type TelemetryPeriod = 'week' | 'month' | 'all'
type DropZonesViewMode = 'mix' | 'heatmap' | 'points'

type LandingPoint = {
  memberId: number
  memberName: string
  matchId: string
  mapName: string
  x: number
  y: number
  xPct: number
  yPct: number
  nearbyPlayerCount250m: number
  pressureLevel: DropPressureLevel
}

type HeatmapCell = {
  mapName: string
  xIndex: number
  yIndex: number
  count: number
}

type HeatRange = {
  min: number
  max: number
  color: string
  label: string
}

type DropZonesResponse = {
  ok: boolean
  meta: {
    period: TelemetryPeriod
    periodKey: string
    count: number
  }
  data: {
    gridSize: number
    points: LandingPoint[]
    heatmap: HeatmapCell[]
    options?: {
      mapLocations?: MapLocations
    }
  }
}

const PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

const VIEW_MODE_OPTIONS: Array<{ value: DropZonesViewMode; label: string }> = [
  { value: 'mix', label: 'Mixte' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'points', label: 'Points' },
]

const HEAT_RANGE_STEPS = [
  { ratio: 0.2, color: '#A5D6A7', label: 'Tres faible' },
  { ratio: 0.4, color: '#4CAF50', label: 'Faible' },
  { ratio: 0.6, color: '#FFEB3B', label: 'Moderee' },
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

function mapAssetPath(mapName: string) {
  return `/maps/pubg/${mapName}.webp`
}

function formatNumber(value: number) {
  return value.toLocaleString('fr-FR')
}

function hashColor(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }

  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 82% 56%)`
}

function minimumHeatCount(max: number) {
  if (max <= 0) return 0
  return Math.max(1, Math.floor(Math.log2(max)))
}

function buildHeatRanges(minimum: number, max: number): HeatRange[] {
  if (minimum <= 0 || max <= 0) return []

  const ranges: HeatRange[] = []
  const minimumLog = Math.log(minimum)
  const logarithmicSpan = Math.log(max) - minimumLog
  let min = minimum

  for (const step of HEAT_RANGE_STEPS) {
    if (min > max) break
    const logarithmicMax = Math.floor(Math.exp(minimumLog + logarithmicSpan * step.ratio))
    const rangeMax = step.ratio === 1
      ? max
      : Math.min(max, Math.max(min, logarithmicMax))
    ranges.push({ min, max: rangeMax, color: step.color, label: step.label })
    min = rangeMax + 1
  }

  return ranges
}

function heatRangeLabel(range: HeatRange) {
  return range.min === range.max
    ? formatNumber(range.min)
    : `${formatNumber(range.min)}-${formatNumber(range.max)}`
}

function heatOpacity(count: number, minimum: number, max: number) {
  if (count < minimum || minimum <= 0 || max <= 0) return 0
  if (max <= minimum) return 0.6

  const minimumLog = Math.log(minimum)
  const intensity = (Math.log(count) - minimumLog) / (Math.log(max) - minimumLog)
  return 0.1 + intensity * 0.5
}

function locationForPoint(point: LandingPoint, locations: MapLocation[]) {
  let closestLocation: MapLocation | null = null
  let closestRatio = Number.POSITIVE_INFINITY

  for (const location of locations) {
    const distance = Math.hypot(point.xPct - location.xPct, point.yPct - location.yPct)
    const ratio = distance / location.radiusPct
    if (ratio <= 1 && ratio < closestRatio) {
      closestLocation = location
      closestRatio = ratio
    }
  }

  return closestLocation
}

function heatmapFromPoints(points: LandingPoint[], gridSize: number): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>()

  for (const point of points) {
    const xIndex = Math.min(Math.floor((point.xPct / 100) * gridSize), gridSize - 1)
    const yIndex = Math.min(Math.floor((point.yPct / 100) * gridSize), gridSize - 1)
    const key = `${point.mapName}:${xIndex}:${yIndex}`
    const current = cells.get(key)
    cells.set(key, {
      mapName: point.mapName,
      xIndex,
      yIndex,
      count: (current?.count ?? 0) + 1,
    })
  }

  return Array.from(cells.values())
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  if ('error' in payload) {
    const errorValue = (payload as { error?: unknown }).error
    if (
      errorValue &&
      typeof errorValue === 'object' &&
      'message' in errorValue &&
      typeof (errorValue as { message?: unknown }).message === 'string'
    ) {
      return (errorValue as { message: string }).message
    }

    if (typeof errorValue === 'string') {
      return errorValue
    }
  }

  return fallback
}

export default function ClanDropZonesPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const mapViewportRef = useRef<DropZoneMapViewportHandle>(null)

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [viewMode, setViewMode] = useState<DropZonesViewMode>('mix')
  const [selectedMap, setSelectedMap] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [showLocationBoundaries, setShowLocationBoundaries] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<DropZonesResponse | null>(null)

  useEffect(() => {
    if (!clanId) {
      return
    }

    let cancelled = false

    async function loadDropZones() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/clans/${clanId}/telemetry/drop-zones?period=${period}`, {
          cache: 'no-store',
        })
        const data = (await response.json()) as DropZonesResponse | { error?: unknown }

        if (!response.ok || !('data' in data)) {
          throw new Error(extractErrorMessage(data, 'Impossible de charger les drop zones'))
        }

        if (!cancelled) {
          setPayload(data as DropZonesResponse)
        }
      } catch (loadError) {
        if (!cancelled) {
          setPayload(null)
          setError(
            loadError instanceof Error ? loadError.message : 'Impossible de charger les drop zones'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadDropZones()

    return () => {
      cancelled = true
    }
  }, [clanId, period])

  const maps = useMemo(() => {
    const names = new Set<string>()
    for (const point of payload?.data.points ?? []) {
      if (!selectedMemberId || point.memberId === selectedMemberId) {
        names.add(point.mapName)
      }
    }
    return Array.from(names).sort((left, right) => left.localeCompare(right, 'fr-FR'))
  }, [payload?.data.points, selectedMemberId])

  const members = useMemo(() => {
    const map = new Map<number, { id: number; name: string }>()
    for (const point of payload?.data.points ?? []) {
      if (!map.has(point.memberId)) {
        map.set(point.memberId, { id: point.memberId, name: point.memberName })
      }
    }
    return Array.from(map.values())
      .sort((left, right) => left.name.localeCompare(right.name, 'fr-FR'))
  }, [payload?.data.points])

  const activeMap = selectedMap && maps.includes(selectedMap) ? selectedMap : maps[0] || ''

  function selectMap(mapName: string) {
    setSelectedMap(mapName)
    setSelectedLocationId('')
    mapViewportRef.current?.reset()
  }

  function handleSwipeMap(direction: 'prev' | 'next') {
    if (maps.length < 2) return
    const currentIndex = maps.indexOf(activeMap)
    if (currentIndex === -1) return
    const nextIndex =
      direction === 'next'
        ? (currentIndex + 1) % maps.length
        : (currentIndex - 1 + maps.length) % maps.length
    selectMap(maps[nextIndex])
  }

  const mapPoints = useMemo(() => {
    return (payload?.data.points ?? []).filter((point) => {
      if (point.mapName !== activeMap) return false
      if (selectedMemberId && point.memberId !== selectedMemberId) return false
      return true
    })
  }, [activeMap, payload?.data.points, selectedMemberId])

  const activeLocations = useMemo(() => {
    return (payload?.data.options?.mapLocations?.[activeMap] ?? [])
      .filter((location) => location.enabled)
      .sort((left, right) => left.name.localeCompare(right.name, 'fr-FR'))
  }, [activeMap, payload?.data.options?.mapLocations])

  const selectedLocation = activeLocations.find((location) => location.id === selectedLocationId)

  function selectLocation(location: MapLocation | null) {
    setSelectedLocationId(location?.id ?? '')
    if (location) {
      mapViewportRef.current?.focusLocation(location)
    } else {
      mapViewportRef.current?.reset()
    }
  }

  const cityStats = useMemo(() => {
    const pointsByLocation = new Map<string, LandingPoint[]>()
    for (const point of mapPoints) {
      const location = locationForPoint(point, activeLocations)
      if (!location) continue
      const points = pointsByLocation.get(location.id) ?? []
      points.push(point)
      pointsByLocation.set(location.id, points)
    }

    return activeLocations
      .map((location) => {
        const points = pointsByLocation.get(location.id) ?? []
        const memberCounts = new Map<number, { name: string; count: number }>()
        for (const point of points) {
          const current = memberCounts.get(point.memberId)
          memberCounts.set(point.memberId, {
            name: point.memberName,
            count: (current?.count ?? 0) + 1,
          })
        }
        const topMember = Array.from(memberCounts.values()).sort(
          (left, right) => right.count - left.count || left.name.localeCompare(right.name, 'fr-FR')
        )[0] ?? null
        const pressure = summarizeDropPressure(points)

        return {
          location,
          count: points.length,
          share: mapPoints.length > 0 ? (points.length / mapPoints.length) * 100 : 0,
          matches: new Set(points.map((point) => point.matchId)).size,
          members: new Set(points.map((point) => point.memberId)).size,
          topMember,
          pressure,
        }
      })
      .filter((stat) => stat.count > 0)
      .sort((left, right) => right.count - left.count || left.location.name.localeCompare(right.location.name, 'fr-FR'))
  }, [activeLocations, mapPoints])

  const topCityStats = cityStats.slice(0, 5)
  const favoriteCity = topCityStats[0]
  const locatedPointCount = cityStats.reduce((total, stat) => total + stat.count, 0)

  const filteredPoints = useMemo(() => {
    if (!selectedLocation) return mapPoints
    return mapPoints.filter((point) => locationForPoint(point, activeLocations)?.id === selectedLocation.id)
  }, [activeLocations, mapPoints, selectedLocation])

  const pressureStats = useMemo(() => summarizeDropPressure(filteredPoints), [filteredPoints])

  const filteredHeatmap = useMemo(() => {
    if (selectedLocation) {
      return heatmapFromPoints(filteredPoints, payload?.data.gridSize || 40)
    }
    return (payload?.data.heatmap ?? []).filter((cell) => cell.mapName === activeMap)
  }, [activeMap, filteredPoints, payload?.data.gridSize, payload?.data.heatmap, selectedLocation])

  const maxHeat = useMemo(() => {
    return filteredHeatmap.reduce((max, cell) => Math.max(max, cell.count), 0)
  }, [filteredHeatmap])

  const minimumHeat = useMemo(() => minimumHeatCount(maxHeat), [maxHeat])

  const visibleHeatmap = useMemo(() => {
    return filteredHeatmap.filter((cell) => cell.count >= minimumHeat)
  }, [filteredHeatmap, minimumHeat])

  const heatRanges = useMemo(
    () => buildHeatRanges(minimumHeat, maxHeat),
    [maxHeat, minimumHeat]
  )

  const displayedMatchCount = useMemo(() => {
    return new Set(filteredPoints.map((point) => point.matchId)).size
  }, [filteredPoints])

  if (!clanId) {
    return (
      <main className="app-container app-main">
        <p className="text-sm text-red-600">Clan invalide.</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main">
      <header className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-5 py-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Drop zones clan</h1>
            <p className="mt-1 text-sm text-slate-200">
              Analyse des zones de saut (points + heatmap) issue de LogParachuteLanding.
            </p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-slate-100">
            <p>Carte: {activeMap ? mapDisplayName(activeMap, {}) : 'Aucune'}</p>
            <p>Dropzones visibles: {formatNumber(filteredPoints.length)}</p>
            <p>Pression moyenne: {pressureStats.average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</p>
            <p>Hot drops: {pressureStats.hotDropShare.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</p>
            <p>Cellules visibles: {formatNumber(visibleHeatmap.length)} / {formatNumber(filteredHeatmap.length)}</p>
          </div>
        </div>
        <div className="mt-3">
        </div>
      </header>

      <section className="app-panel mb-5 p-4">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <MobileDropdownNav
                id="drop-zones-period-filter"
                label="Periode"
                currentLabel={PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Selectionner'}
                items={PERIOD_OPTIONS.map((option) => ({
                  key: `period-${option.value}`,
                  label: option.label,
                  active: period === option.value,
                  onSelect: () => setPeriod(option.value),
                }))}
                visibilityClass=""
                className="w-full"
              />
            </div>

            <div className="min-w-0">
              <MobileDropdownNav
                id="drop-zones-view-filter"
                label="Affichage"
                currentLabel={VIEW_MODE_OPTIONS.find((option) => option.value === viewMode)?.label ?? 'Selectionner'}
                items={VIEW_MODE_OPTIONS.map((option) => ({
                  key: `view-${option.value}`,
                  label: option.label,
                  active: viewMode === option.value,
                  onSelect: () => setViewMode(option.value),
                }))}
                visibilityClass=""
                className="w-full"
              />
            </div>

            <div className="min-w-0">
              <MobileDropdownNav
                id="drop-zones-map-filter"
                label="Carte"
                currentLabel={activeMap ? mapDisplayName(activeMap, {}) : 'Selectionner'}
                items={maps.map((mapName) => ({
                  key: `map-${mapName}`,
                  label: mapDisplayName(mapName, {}),
                  active: activeMap === mapName,
                  onSelect: () => selectMap(mapName),
                }))}
                visibilityClass=""
                className="w-full"
              />
            </div>

            <div className="min-w-0">
              <MobileDropdownNav
                id="drop-zones-member-filter"
                label="Joueur"
                currentLabel={selectedMemberId ? members.find(m => m.id === selectedMemberId)?.name ?? 'Joueur' : 'Tous'}
                items={[
                  {
                    key: 'member-all',
                    label: 'Tous les joueurs',
                    active: selectedMemberId === null,
                    onSelect: () => {
                      setSelectedMemberId(null)
                      setSelectedLocationId('')
                      mapViewportRef.current?.reset()
                    },
                  },
                  ...members.map((entry) => ({
                    key: `member-${entry.id}`,
                    label: entry.name,
                    active: selectedMemberId === entry.id,
                    onSelect: () => {
                      setSelectedMemberId(entry.id)
                      setSelectedLocationId('')
                      mapViewportRef.current?.reset()
                    },
                  })),
                ]}
                visibilityClass=""
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
            <div>
              <p className="font-semibold text-slate-700">Points</p>
              <p>Atterrissage de chaque membre du clan — 1 point par match, coloré par joueur.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Heatmap</p>
              <p>Tous les joueurs de chaque match, adversaires compris — intensité = fréquence de la zone.</p>
            </div>
          </div>

        </div>
      </section>

      {loading ? <p className="mb-4 text-sm text-slate-600">Chargement des drop zones...</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && payload ? (
        maps.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="font-medium text-slate-800">Carte: {activeMap ? mapDisplayName(activeMap, {}) : 'Aucune'}</span>
              <span className="text-slate-600">Matchs analyses: {formatNumber(displayedMatchCount)}</span>
              <span className="text-slate-600">Dropzones visibles: {formatNumber(filteredPoints.length)}</span>
              <span className="text-slate-600">
                Pression moyenne: {pressureStats.average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
              </span>
              <span className="text-slate-600">Maximum: {formatNumber(pressureStats.maximum)}</span>
              <span className="text-slate-600">
                Hot drops: {pressureStats.hotDropShare.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
              </span>
              <span className="text-slate-600">
                Cellules visibles: {formatNumber(visibleHeatmap.length)} / {formatNumber(filteredHeatmap.length)}
              </span>
            </div>

            <div className="border-b border-slate-200 bg-white px-4 py-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Top 5 des dropzones</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">
                    {favoriteCity
                      ? `Dropzone favorite : ${favoriteCity.location.name}`
                      : 'Aucun atterrissage dans une ville configuree'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatNumber(locatedPointCount)} en ville · {formatNumber(mapPoints.length - locatedPointCount)} hors périmètre
                  </p>
                </div>

                <div className="grid min-w-full gap-3 sm:min-w-0 sm:grid-cols-[minmax(13rem,1fr)_auto] sm:items-end">
                  <MobileDropdownNav
                    id="clan-drop-zones-location-filter"
                    label="Ville"
                    currentLabel={selectedLocation?.name ?? 'Toutes les villes'}
                    items={[
                      {
                        key: 'all-locations',
                        label: 'Toutes les villes',
                        active: !selectedLocation,
                        onSelect: () => selectLocation(null),
                      },
                      ...activeLocations.map((location) => ({
                        key: location.id,
                        label: location.name,
                        active: selectedLocation?.id === location.id,
                        onSelect: () => selectLocation(location),
                      })),
                    ]}
                    visibilityClass=""
                    className="w-full"
                  />
                </div>
              </div>

              {topCityStats.length > 0 ? (
                <>
                  <div className="app-table-shell hidden overflow-hidden md:block">
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '24%' }} />
                      </colgroup>
                      <thead className="app-table-head text-xs uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-3 text-center whitespace-nowrap">Rang</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">Dropzone</th>
                          <th className="px-4 py-3 text-right whitespace-nowrap">Atterrissages</th>
                          <th className="px-4 py-3 text-right whitespace-nowrap">Part</th>
                          <th className="px-4 py-3 text-right whitespace-nowrap">Matchs</th>
                          <th className="px-4 py-3 text-right whitespace-nowrap">Membres</th>
                          <th className="px-4 py-3 text-left whitespace-nowrap">Membre principal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCityStats.map((stat, index) => {
                          const rank = index + 1
                          const rowClassName = rank === 1
                            ? 'app-table-row app-table-row--top1'
                            : rank === 2
                              ? 'app-table-row app-table-row--top2'
                              : rank === 3
                                ? 'app-table-row app-table-row--top3'
                                : 'app-table-row'

                          return (
                            <tr
                              key={stat.location.id}
                              className={`${rowClassName}${selectedLocation?.id === stat.location.id ? ' ring-2 ring-inset ring-cyan-500' : ''}`}
                            >
                              <td className="px-4 py-3 text-center">
                                {rank <= 3 ? (
                                  <span className={`app-podium-badge ${
                                    rank === 1
                                      ? 'app-podium-badge--gold'
                                      : rank === 2
                                        ? 'app-podium-badge--silver'
                                        : 'app-podium-badge--bronze'
                                  }`}>
                                    #{rank}
                                  </span>
                                ) : (
                                  <span className="font-semibold text-gray-500">#{rank}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-900">
                                <button
                                  type="button"
                                  onClick={() => selectLocation(stat.location)}
                                  className="max-w-full truncate text-left font-semibold text-cyan-700 hover:underline"
                                >
                                  {stat.location.name}
                                </button>
                                <p className="mt-1 text-xs font-normal text-gray-500">
                                  Pression {stat.pressure.average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} · {stat.pressure.hotDropShare.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} % hot
                                </p>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{formatNumber(stat.count)}</td>
                              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{stat.share.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</td>
                              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(stat.matches)}</td>
                              <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(stat.members)}</td>
                              <td className="px-4 py-3 font-medium text-gray-700">
                                {stat.topMember ? (
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="app-avatar flex h-7 w-7 shrink-0 items-center justify-center text-xs font-semibold text-gray-700">
                                      {stat.topMember.name.charAt(0).toUpperCase()}
                                    </span>
                                    <span className="min-w-0 truncate">{stat.topMember.name}</span>
                                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700">
                                      {formatNumber(stat.topMember.count)}
                                    </span>
                                  </span>
                                ) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="app-table-shell overflow-hidden md:hidden">
                    <ul>
                      {topCityStats.map((stat, index) => {
                        const rank = index + 1
                        const rowClassName = rank === 1
                          ? 'app-table-row app-table-row--top1'
                          : rank === 2
                            ? 'app-table-row app-table-row--top2'
                            : rank === 3
                              ? 'app-table-row app-table-row--top3'
                              : 'app-table-row'

                        return (
                          <li
                            key={stat.location.id}
                            className={`${rowClassName} p-3${selectedLocation?.id === stat.location.id ? ' ring-2 ring-inset ring-cyan-500' : ''}`}
                          >
                            <div className="flex items-start gap-3">
                              <span className={`app-podium-badge mt-0.5 ${
                                rank === 1
                                  ? 'app-podium-badge--gold'
                                  : rank === 2
                                    ? 'app-podium-badge--silver'
                                    : rank === 3
                                      ? 'app-podium-badge--bronze'
                                      : 'border-gray-200 bg-gray-100 text-gray-700'
                              }`}>
                                #{rank}
                              </span>
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => selectLocation(stat.location)}
                                  className="block max-w-full truncate text-left text-sm font-semibold text-cyan-700 hover:underline"
                                >
                                  {stat.location.name}
                                </button>
                                <p className="mt-1 text-xs text-gray-500">
                                  {formatNumber(stat.matches)} match{stat.matches > 1 ? 's' : ''} · {formatNumber(stat.members)} membre{stat.members > 1 ? 's' : ''}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  Pression {stat.pressure.average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} · {stat.pressure.hotDropShare.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} % hot
                                </p>
                                {stat.topMember ? (
                                  <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-700">
                                    <span className="font-medium">Membre principal :</span>
                                    <span className="truncate">{stat.topMember.name}</span>
                                    <span className="shrink-0 font-semibold tabular-nums">({formatNumber(stat.topMember.count)})</span>
                                  </p>
                                ) : null}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-base font-semibold text-gray-900 tabular-nums">{formatNumber(stat.count)}</p>
                                <p className="text-xs text-gray-500 tabular-nums">
                                  {stat.share.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                                </p>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

            <DropZoneMapViewport
              ref={mapViewportRef}
              boundariesVisible={showLocationBoundaries}
              onBoundariesVisibleChange={setShowLocationBoundaries}
              onSwipeMap={handleSwipeMap}
            >
              {activeMap ? (
                <>
                  <Image
                    src={mapAssetPath(activeMap)}
                    alt={mapDisplayName(activeMap, {})}
                    fill
                    className="object-cover opacity-85"
                    sizes="(max-width: 1280px) 100vw, 70vw"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-950/45 via-transparent to-slate-950/55" />
                </>
              ) : null}

              <div className="absolute inset-0 overflow-hidden">
                {(viewMode === 'mix' || viewMode === 'heatmap') ? (
                  <div
                    className="absolute inset-0 grid"
                    style={{
                      gridTemplateColumns: `repeat(${payload.data.gridSize || 40}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${payload.data.gridSize || 40}, minmax(0, 1fr))`,
                      zIndex: 10,
                    }}
                  >
                    {visibleHeatmap.map((cell) => {
                      const rangeIndex = heatRanges.findIndex((entry) => cell.count <= entry.max)
                      const range = heatRanges[rangeIndex]
                      const opacity = heatOpacity(cell.count, minimumHeat, maxHeat)

                      return (
                        <div
                          key={`h:${cell.mapName}:${cell.xIndex}:${cell.yIndex}`}
                          style={{
                            gridColumn: cell.xIndex + 1,
                            gridRow: cell.yIndex + 1,
                            backgroundColor: range?.color ?? 'transparent',
                            borderRadius: '35%',
                            opacity,
                          }}
                          title={`Zone ${cell.xIndex}/${cell.yIndex} - ${formatNumber(cell.count)} atterrissage${cell.count > 1 ? 's' : ''} - ${range?.label ?? 'Aucune activite'}`}
                        />
                      )
                    })}
                  </div>
                ) : null}

                {showLocationBoundaries
                  ? activeLocations.map((location) => (
                      <div
                        key={`location:${location.id}`}
                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${location.xPct}%`,
                          top: `${location.yPct}%`,
                          width: `${location.radiusPct * 2}%`,
                          aspectRatio: '1',
                          border: `2px solid ${
                            selectedLocation?.id === location.id
                              ? 'rgb(103 232 249)'
                              : 'rgba(255, 255, 255, 0.88)'
                          }`,
                          borderRadius: '50%',
                          backgroundColor:
                            selectedLocation?.id === location.id
                              ? 'rgb(34 211 238 / 0.15)'
                              : 'rgb(255 255 255 / 0.05)',
                          boxShadow:
                            selectedLocation?.id === location.id
                              ? '0 0 0 2px rgb(255 255 255 / 0.8)'
                              : undefined,
                          zIndex: 15,
                        }}
                        title={location.name}
                      />
                    ))
                  : null}

                {(viewMode === 'mix' || viewMode === 'points')
                  ? filteredPoints.map((point, idx) => {
                      const pointLocation = locationForPoint(point, activeLocations)
                      const pressure = DROP_PRESSURE_LEVELS[point.pressureLevel]

                      return (
                        <DropPressureMarker
                          key={`p:${point.matchId}:${point.memberId}:${point.x}:${point.y}:${idx}`}
                          xPct={point.xPct}
                          yPct={point.yPct}
                          pressureLevel={point.pressureLevel}
                          borderColor={hashColor(`${point.memberId}:${point.memberName}`)}
                          title={`${point.memberName} · ${pointLocation?.name ?? 'Hors ville'} · ${formatNumber(point.nearbyPlayerCount250m)} joueur${point.nearbyPlayerCount250m > 1 ? 's' : ''} à moins de 250 m · ${pressure.label}`}
                        />
                      )
                    })
                  : null}
              </div>
            </DropZoneMapViewport>

            {(viewMode === 'mix' || viewMode === 'points') ? <DropPressureLegend /> : null}

            {(viewMode === 'mix' || viewMode === 'heatmap') && heatRanges.length > 0 ? (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">Densite relative</span>
                  {heatRanges.map((range) => (
                    <span key={`${range.min}-${range.max}`} className="inline-flex items-center gap-1.5">
                      <span
                        className="h-3.5 w-3.5 border border-black/15"
                        style={{ backgroundColor: range.color }}
                        aria-hidden="true"
                      />
                      <span>{range.label} {heatRangeLabel(range)}</span>
                    </span>
                  ))}
                  <span className="text-slate-500">
                    Seuil : {formatNumber(minimumHeat)} · Maximum : {formatNumber(maxHeat)} atterrissage{maxHeat > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <p className="text-sm text-slate-600">Aucune donnee drop zones pour cette periode.</p>
        )
      ) : null}
    </main>
  )
}
