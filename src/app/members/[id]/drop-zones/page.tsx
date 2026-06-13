'use client'

import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import MemberSectionNav from '@/components/MemberSectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'

import { mapDisplayName } from '@/lib/map-label-service'

type TelemetryPeriod = 'week' | 'month' | 'all'
type ViewMode = 'mix' | 'heatmap' | 'points'
type DropZonesScope = 'self' | 'member' | 'clan' | 'best'
type BestMode = 'duo' | 'trio' | 'squad'

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
    scope?: DropZonesScope
    scopeLabel?: string
    targetMemberId?: number | null
    bestMode?: BestMode
  }
  data: {
    member: {
      id: number
      displayName: string
      clanId: number | null
    }
    options?: {
      members?: Array<{
        id: number
        displayName: string
      }>
      bestModes?: BestMode[]
    }
    selected?: {
      memberId?: number
      targetMemberId?: number | null
      bestMode?: BestMode
      period?: TelemetryPeriod
    }
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

const VIEW_MODE_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'mix', label: 'Mixte' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'points', label: 'Points' },
]

const SCOPE_OPTIONS: Array<{ value: DropZonesScope; label: string }> = [
  { value: 'self', label: 'Le joueur' },
  { value: 'member', label: 'Un joueur specifique' },
  { value: 'clan', label: 'Le clan' },
  { value: 'best', label: 'Son meilleur duo/trio/squad' },
]

const BEST_MODE_OPTIONS: Array<{ value: BestMode; label: string }> = [
  { value: 'duo', label: 'Meilleur duo' },
  { value: 'trio', label: 'Meilleur trio' },
  { value: 'squad', label: 'Meilleur squad' },
]

function parseMemberId(value: string | string[] | undefined) {
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

export default function MemberDropZonesPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [viewMode, setViewMode] = useState<ViewMode>('mix')
  const [scope, setScope] = useState<DropZonesScope>('self')
  const [targetMemberId, setTargetMemberId] = useState<number | null>(null)
  const [bestMode, setBestMode] = useState<BestMode>('duo')
  const [selectedMap, setSelectedMap] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<DropZonesResponse | null>(null)

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadDropZones() {
      try {
        setLoading(true)
        setError('')

        const query = new URLSearchParams({
          period,
          scope,
          bestMode,
        })

        if (scope === 'member' && targetMemberId) {
          query.set('targetMemberId', String(targetMemberId))
        }

        const response = await fetch(`/api/members/${memberId}/telemetry/drop-zones?${query.toString()}`, {
          cache: 'no-store',
        })
        const data = (await response.json()) as DropZonesResponse | { error?: unknown }

        if (!response.ok || !('data' in data)) {
          throw new Error(extractErrorMessage(data, 'Impossible de charger les drop zones du membre'))
        }

        if (!cancelled) {
          const nextPayload = data as DropZonesResponse
          setPayload(nextPayload)

          const apiScope = nextPayload.meta.scope
          if (apiScope && apiScope !== scope) {
            setScope(apiScope)
          }

          const apiBestMode = nextPayload.data.selected?.bestMode ?? nextPayload.meta.bestMode
          if (apiBestMode) {
            setBestMode(apiBestMode)
          }

          const apiTargetMemberId =
            nextPayload.data.selected?.targetMemberId ?? nextPayload.meta.targetMemberId ?? null
          if ((apiScope ?? scope) === 'member') {
            setTargetMemberId(apiTargetMemberId)
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setPayload(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger les drop zones du membre'
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
  }, [bestMode, memberId, period, scope, targetMemberId])

  const scopeLabelMap = useMemo<Record<DropZonesScope, string>>(
    () => Object.fromEntries(SCOPE_OPTIONS.map((entry) => [entry.value, entry.label])) as Record<
      DropZonesScope,
      string
    >,
    []
  )

  const bestModeLabelMap = useMemo<Record<BestMode, string>>(
    () => Object.fromEntries(BEST_MODE_OPTIONS.map((entry) => [entry.value, entry.label])) as Record<
      BestMode,
      string
    >,
    []
  )

  const memberOptions = payload?.data.options?.members ?? []
  const selectedMemberOption = memberOptions.find((entry) => entry.id === targetMemberId)

  const maps = useMemo(() => {
    const names = new Set<string>()
    for (const point of payload?.data.points ?? []) {
      names.add(point.mapName)
    }
    return Array.from(names).sort((left, right) => left.localeCompare(right, 'fr-FR'))
  }, [payload?.data.points])

  const activeMap = selectedMap && maps.includes(selectedMap) ? selectedMap : maps[0] || ''

  const filteredPoints = useMemo(() => {
    return (payload?.data.points ?? []).filter((point) => point.mapName === activeMap)
  }, [activeMap, payload?.data.points])

  const filteredHeatmap = useMemo(() => {
    return (payload?.data.heatmap ?? []).filter((cell) => cell.mapName === activeMap)
  }, [activeMap, payload?.data.heatmap])

  const maxHeat = useMemo(() => {
    return filteredHeatmap.reduce((max, cell) => Math.max(max, cell.count), 0)
  }, [filteredHeatmap])

  const displayedMatchCount = useMemo(() => {
    return new Set(filteredPoints.map((point) => point.matchId)).size
  }, [filteredPoints])

  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">ID joueur invalide.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <MemberPageHeader
          title="Drop zones"
          subtitle="Positions d'atterrissage du joueur (points + zones d'influence) selon la période."
          showBackButton={false}
          framed={false}
        />
        <MemberSectionNav memberId={memberId} framed={false} showMemberIdentity={false} />
      </section>

      <section className="app-panel mb-5 p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <MobileDropdownNav
              id="member-drop-zones-scope-filter"
              label="Filtre"
              currentLabel={scopeLabelMap[scope]}
              items={SCOPE_OPTIONS.map((option) => ({
                key: `scope-${option.value}`,
                label: option.label,
                active: scope === option.value,
                onSelect: () => {
                  setScope(option.value)
                  if (option.value !== 'member') {
                    setTargetMemberId(null)
                  }
                },
              }))}
              visibilityClass=""
              className="w-full"
              leftIcon={(
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="M4 5.5h12M6.5 10h7M8.5 14.5h3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            />
          </div>

          {scope === 'member' ? (
            <div className="min-w-0">
              <MobileDropdownNav
                id="member-drop-zones-target-member-filter"
                label="Joueur"
                currentLabel={selectedMemberOption?.displayName ?? 'Selectionner'}
                items={memberOptions.map((entry) => ({
                  key: `member-${entry.id}`,
                  label: entry.displayName,
                  active: targetMemberId === entry.id,
                  onSelect: () => setTargetMemberId(entry.id),
                }))}
                visibilityClass=""
                className="w-full"
              />
            </div>
          ) : null}

          {scope === 'best' ? (
            <div className="min-w-0">
              <MobileDropdownNav
                id="member-drop-zones-best-mode-filter"
                label="Formation"
                currentLabel={bestModeLabelMap[bestMode]}
                items={BEST_MODE_OPTIONS.map((option) => ({
                  key: `best-${option.value}`,
                  label: option.label,
                  active: bestMode === option.value,
                  onSelect: () => setBestMode(option.value),
                }))}
                visibilityClass=""
                className="w-full"
              />
            </div>
          ) : null}

          <div className="min-w-0">
            <MobileDropdownNav
              id="member-drop-zones-period-filter"
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
              id="member-drop-zones-view-filter"
              label="Affichage"
              currentLabel={
                VIEW_MODE_OPTIONS.find((option) => option.value === viewMode)?.label ?? 'Selectionner'
              }
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
              id="member-drop-zones-map-filter"
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
        </div>
      </section>

      {loading ? <p className="mb-4 text-sm text-slate-600">Chargement des drop zones...</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        maps.length > 0 && payload ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="font-medium text-slate-800">Filtre: {payload?.meta.scopeLabel ?? scopeLabelMap[scope]}</span>
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
                    sizes="100vw"
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
                        className="absolute h-2.5 w-2.5 rounded-full border border-white bg-cyan-400 shadow"
                        style={{
                          left: `${point.xPct}%`,
                          top: `${point.yPct}%`,
                          transform: 'translate(-50%, -50%)',
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