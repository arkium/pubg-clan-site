'use client'

import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'

import { mapDisplayName } from '@/lib/map-label-service'

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
}

type HeatmapCell = {
  mapName: string
  xIndex: number
  yIndex: number
  count: number
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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
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

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [viewMode, setViewMode] = useState<DropZonesViewMode>('mix')
  const [selectedMap, setSelectedMap] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)
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

  const filteredPoints = useMemo(() => {
    return (payload?.data.points ?? []).filter((point) => {
      if (point.mapName !== activeMap) return false
      if (selectedMemberId && point.memberId !== selectedMemberId) return false
      return true
    })
  }, [activeMap, payload?.data.points, selectedMemberId])

  const filteredHeatmap = useMemo(() => {
    return (payload?.data.heatmap ?? []).filter((cell) => cell.mapName === activeMap)
  }, [activeMap, payload?.data.heatmap])

  const maxHeat = useMemo(() => {
    return filteredHeatmap.reduce((max, cell) => Math.max(max, cell.count), 0)
  }, [filteredHeatmap])

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
            <p>Points visibles: {formatNumber(filteredPoints.length)}</p>
            <p>Cellules heatmap: {formatNumber(filteredHeatmap.length)}</p>
          </div>
        </div>
        <div className="mt-3">
          <ClanSectionNav clanId={clanId} />
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
                  onSelect: () => setSelectedMap(mapName),
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
                    onSelect: () => setSelectedMemberId(null),
                  },
                  ...members.map((entry) => ({
                    key: `member-${entry.id}`,
                    label: entry.name,
                    active: selectedMemberId === entry.id,
                    onSelect: () => setSelectedMemberId(entry.id),
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
              <span className="text-slate-600">Points visibles: {formatNumber(filteredPoints.length)}</span>
              <span className="text-slate-600">Cellules heatmap: {formatNumber(filteredHeatmap.length)}</span>
            </div>

            <div className="relative aspect-square bg-slate-950">
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
                {(viewMode === 'mix' || viewMode === 'heatmap')
                  ? filteredHeatmap.map((cell) => {
                      const ratio = maxHeat > 0 ? clamp01(cell.count / maxHeat) : 0
                      const left = ((cell.xIndex + 0.5) / (payload.data.gridSize || 40)) * 100
                      const top = ((cell.yIndex + 0.5) / (payload.data.gridSize || 40)) * 100
                      const size = 22 + ratio * 36

                      return (
                        <div
                          key={`h:${cell.mapName}:${cell.xIndex}:${cell.yIndex}`}
                          className="absolute rounded-full"
                          style={{
                            left: `${left}%`,
                            top: `${top}%`,
                            width: `${size}px`,
                            height: `${size}px`,
                            transform: 'translate(-50%, -50%)',
                            background:
                              'radial-gradient(circle, rgba(255,93,93,0.7) 0%, rgba(255,142,67,0.45) 35%, rgba(255,142,67,0) 100%)',
                            filter: 'blur(0.5px)',
                            mixBlendMode: 'screen',
                          }}
                          title={`Cellule ${cell.xIndex}/${cell.yIndex} - ${cell.count}`}
                        />
                      )
                    })
                  : null}

                {(viewMode === 'mix' || viewMode === 'points')
                  ? filteredPoints.map((point, idx) => (
                      <div
                        key={`p:${point.matchId}:${point.memberId}:${point.x}:${point.y}:${idx}`}
                        className="absolute h-2.5 w-2.5 rounded-full border border-white shadow"
                        style={{
                          left: `${point.xPct}%`,
                          top: `${point.yPct}%`,
                          transform: 'translate(-50%, -50%)',
                          backgroundColor: hashColor(`${point.memberId}:${point.memberName}`),
                        }}
                        title={`${point.memberName} - ${mapDisplayName(point.mapName, {})}`}
                      />
                    ))
                  : null}
              </div>
            </div>
          </section>
        ) : (
          <p className="text-sm text-slate-600">Aucune donnee drop zones pour cette periode.</p>
        )
      ) : null}
    </main>
  )
}
