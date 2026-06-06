'use client'

import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
import AppSelectField from '@/components/ui/AppSelectField'
import SegmentedControl from '@/components/ui/SegmentedControl'

import { mapDisplayName } from '@/lib/map-label-service'

type TelemetryPeriod = 'week' | 'month' | 'all'
type HeatmapView = 'predilection' | 'rotation' | 'rotation-lines' | 'death'
type PhaseFilter = 'all' | number

type HeatmapCell = {
  xIndex: number
  yIndex: number
  count: number
}

type MemberOption = {
  memberKey: string
  memberLabel: string
  points: number
}

type TrajectoryLine = {
  fromX: number
  fromY: number
  toX: number
  toY: number
  count: number
}

type PositionsHeatmapResponse = {
  ok: boolean
  clanId: number
  period: TelemetryPeriod
  periodKey: string
  selectedMap: string | null
  selectedMapLabel: string | null
  selectedMemberKey: string | null
  selectedPhase: PhaseFilter
  view: HeatmapView
  maps: Array<{
    mapName: string
    matches: number
    positionPoints: number
    rotationPoints: number
    deathPoints: number
  }>
  members: MemberOption[]
  phases: number[]
  positions: HeatmapCell[]
  rotations: HeatmapCell[]
  trajectoryLines: TrajectoryLine[]
  deaths: HeatmapCell[]
  gridSize: number
  mapLabels: Record<string, string>
  note: string | null
}

const PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tout' },
]

const VIEW_OPTIONS: Array<{ value: HeatmapView; label: string }> = [
  { value: 'predilection', label: 'Predilection' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'rotation-lines', label: 'Rotation lignes' },
  { value: 'death', label: 'Mort' },
]

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

function dotColor(view: HeatmapView) {
  if (view === 'death') {
    return '255, 84, 106'
  }
  if (view === 'rotation' || view === 'rotation-lines') {
    return '126, 92, 255'
  }
  return '0, 206, 255'
}

function pointSize(ratio: number) {
  return 10 + ratio * 34
}

function opacityFor(ratio: number) {
  return 0.18 + ratio * 0.8
}

function phaseLabel(value: PhaseFilter) {
  return value === 'all' ? 'Toutes' : `Phase ${value}`
}

export default function ClanPositionsHeatmapPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [mapName, setMapName] = useState('')
  const [memberKey, setMemberKey] = useState('')
  const [phase, setPhase] = useState<PhaseFilter>('all')
  const [view, setView] = useState<HeatmapView>('predilection')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<PositionsHeatmapResponse | null>(null)

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

        const response = await fetch(`/api/clans/${clanId}/telemetry/positions?${query.toString()}`, {
          cache: 'no-store',
        })
        const data = (await response.json()) as PositionsHeatmapResponse | { error?: { message?: string } }

        if (!response.ok) {
          const fallback = 'Impossible de charger les heatmaps positions'
          const message = typeof data === 'object' && data && 'error' in data ? data.error?.message ?? fallback : fallback
          throw new Error(message)
        }

        if (!cancelled) {
          const nextPayload = data as PositionsHeatmapResponse
          setPayload(nextPayload)

          const nextMap = nextPayload.selectedMap ?? ''
          if (nextMap !== mapName) {
            setMapName(nextMap)
          }

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

  const cells = useMemo(() => {
    if (!payload) {
      return [] as HeatmapCell[]
    }

    if (view === 'rotation') {
      return payload.rotations
    }

    if (view === 'rotation-lines') {
      return [] as HeatmapCell[]
    }

    if (view === 'death') {
      return payload.deaths
    }

    return payload.positions
  }, [payload, view])

  const lines = useMemo(() => {
    if (!payload || view !== 'rotation-lines') {
      return [] as TrajectoryLine[]
    }

    return payload.trajectoryLines
  }, [payload, view])

  const maxCellCount = useMemo(() => {
    return cells.reduce((max, cell) => Math.max(max, cell.count), 0)
  }, [cells])

  const totalCellCount = useMemo(() => cells.reduce((sum, cell) => sum + cell.count, 0), [cells])
  const maxLineCount = useMemo(() => lines.reduce((max, line) => Math.max(max, line.count), 0), [lines])
  const totalLineCount = useMemo(() => lines.reduce((sum, line) => sum + line.count, 0), [lines])

  const selectedMapLabel =
    payload?.selectedMap ? mapDisplayName(payload.selectedMap, payload.mapLabels) : 'Aucune carte'

  const selectedMemberLabel =
    memberKey.length > 0
      ? payload?.members.find((entry) => entry.memberKey === memberKey)?.memberLabel ?? memberKey
      : 'Tous les membres'

  if (!clanId) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">Clan invalide.</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <header className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-5 py-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Heatmaps positions clan</h1>
            <p className="mt-1 text-sm text-slate-200">
              Zones de predilection, rotations et zones de mort avec filtres membre et phase.
            </p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-slate-100">
            <p>Carte: {selectedMapLabel}</p>
            <p>Membre: {selectedMemberLabel}</p>
            <p>Phase: {phaseLabel(phase)}</p>
          </div>
        </div>
        <div className="mt-3">
          <ClanSectionNav clanId={clanId} />
        </div>
      </header>

      <section className="app-panel mb-5 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Periode</p>
            <SegmentedControl
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              size="sm"
              wrap
              className="w-full"
            />
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vue</p>
            <SegmentedControl
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
              size="sm"
              wrap
              className="w-full"
            />
          </div>

          <AppSelectField
            id="positions-map-filter"
            label="Carte"
            value={mapName}
            onChange={setMapName}
            options={[
              { value: '', label: 'Toutes les cartes' },
              ...(payload?.maps ?? []).map((entry) => ({
                value: entry.mapName,
                label: mapDisplayName(entry.mapName, payload?.mapLabels ?? {}),
              })),
            ]}
          />

          <AppSelectField
            id="positions-phase-filter"
            label="Phase cercle"
            value={String(phase)}
            onChange={(value) => {
              if (value === 'all') {
                setPhase('all')
                return
              }

              const parsed = Number(value)
              setPhase(Number.isInteger(parsed) && parsed > 0 ? parsed : 'all')
            }}
            options={[
              { value: 'all', label: 'Toutes les phases' },
              ...(payload?.phases ?? []).map((entry) => ({
                value: String(entry),
                label: `Phase ${entry}`,
              })),
            ]}
          />
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="app-panel p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Cartes</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(payload?.maps.length ?? 0)}</p>
        </article>
        <article className="app-panel p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Elements visibles</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatNumber(view === 'rotation-lines' ? totalLineCount : totalCellCount)}
          </p>
        </article>
        <article className="app-panel p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {view === 'rotation-lines' ? 'Lignes' : 'Cellules'}
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatNumber(view === 'rotation-lines' ? lines.length : cells.length)}
          </p>
        </article>
        <article className="app-panel p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {view === 'rotation-lines' ? 'Max ligne' : 'Max cellule'}
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatNumber(view === 'rotation-lines' ? maxLineCount : maxCellCount)}
          </p>
        </article>
      </section>

      {loading ? <p className="mb-4 text-sm text-slate-600">Chargement des heatmaps positions...</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && payload?.note ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {payload.note}
        </p>
      ) : null}

      {!loading && !error && payload ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="relative aspect-square bg-slate-950">
              {payload.selectedMap ? (
                <>
                  <Image
                    src={mapAssetPath(payload.selectedMap)}
                    alt={selectedMapLabel}
                    fill
                    className="object-cover opacity-85"
                    sizes="(max-width: 1280px) 100vw, 70vw"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-950/45 via-transparent to-slate-950/55" />
                </>
              ) : null}

              <div className="absolute inset-0 overflow-hidden">
                {view === 'rotation-lines' ? (
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {lines.map((line, index) => {
                      const ratio = maxLineCount > 0 ? clamp01(line.count / maxLineCount) : 0
                      return (
                        <g key={`${line.fromX}-${line.fromY}-${line.toX}-${line.toY}-${index}`}>
                          <line
                            x1={line.fromX}
                            y1={line.fromY}
                            x2={line.toX}
                            y2={line.toY}
                            stroke="rgba(174, 122, 255, 0.88)"
                            strokeWidth={0.3 + ratio * 0.7}
                            strokeLinecap="round"
                            opacity={0.2 + ratio * 0.75}
                          />
                          <circle cx={line.toX} cy={line.toY} r={0.14 + ratio * 0.22} fill="rgba(240, 219, 255, 0.9)" />
                        </g>
                      )
                    })}
                  </svg>
                ) : (
                  cells.map((cell) => {
                    const ratio = maxCellCount > 0 ? clamp01(cell.count / maxCellCount) : 0
                    const left = ((cell.xIndex + 0.5) / payload.gridSize) * 100
                    const top = ((cell.yIndex + 0.5) / payload.gridSize) * 100
                    const size = pointSize(ratio)
                    const color = dotColor(view)

                    return (
                      <div
                        key={`${cell.xIndex}-${cell.yIndex}`}
                        className="absolute rounded-full"
                        style={{
                          left: `${left}%`,
                          top: `${top}%`,
                          width: `${size}px`,
                          height: `${size}px`,
                          transform: 'translate(-50%, -50%)',
                          background: `radial-gradient(circle, rgba(${color}, ${opacityFor(ratio)}) 0%, rgba(${color}, 0.45) 35%, rgba(${color}, 0) 100%)`,
                          filter: 'blur(0.6px)',
                          mixBlendMode: 'screen',
                        }}
                        title={`x:${cell.xIndex} y:${cell.yIndex} c:${cell.count}`}
                      />
                    )
                  })
                )}
              </div>

              <div className="absolute bottom-3 left-3 rounded-lg border border-white/20 bg-black/45 px-3 py-2 text-xs text-white">
                <p>
                  {view === 'predilection'
                    ? 'Predilection'
                    : view === 'rotation'
                      ? 'Rotation'
                      : view === 'rotation-lines'
                        ? 'Rotation lignes'
                      : 'Mort'}
                </p>
                <p>
                  Intensite max: {formatNumber(view === 'rotation-lines' ? maxLineCount : maxCellCount)}
                </p>
              </div>
            </div>

            <aside className="border-t border-slate-200 bg-slate-50 p-4 xl:border-l xl:border-t-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Membre par membre</h2>
                <label className="text-xs text-slate-600" htmlFor="positions-member-filter">
                  Filtre
                  <select
                    id="positions-member-filter"
                    className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    value={memberKey}
                    onChange={(event) => setMemberKey(event.target.value)}
                  >
                    <option value="">Tous</option>
                    {payload.members.map((entry) => (
                      <option key={entry.memberKey} value={entry.memberKey}>
                        {entry.memberLabel}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                {payload.members.slice(0, 12).map((entry) => {
                  const active = memberKey === entry.memberKey
                  return (
                    <button
                      key={entry.memberKey}
                      type="button"
                      onClick={() => setMemberKey(active ? '' : entry.memberKey)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        active
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{entry.memberLabel}</span>
                        <span className="text-xs text-slate-500">{formatNumber(entry.points)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phases disponibles</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase('all')}
                    className={`rounded-full border px-2 py-1 text-xs ${
                      phase === 'all'
                        ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    Toutes
                  </button>
                  {payload.phases.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => setPhase(entry)}
                      className={`rounded-full border px-2 py-1 text-xs ${
                        phase === entry
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {`P${entry}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Legend</p>
                <p className="mt-1">Plus le halo est large et intense, plus la cellule est frequentee.</p>
                <p className="mt-1">Rotation: milieux de segments. Rotation lignes: trajectoires vectorielles.</p>
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </main>
  )
}