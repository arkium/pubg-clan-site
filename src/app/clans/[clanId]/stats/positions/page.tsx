'use client'

import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'

import { mapDisplayName } from '@/lib/map-label-service'
import { isGameLabel } from '@/lib/phase-label-service'

type TelemetryPeriod = 'week' | 'month' | 'all'
type HeatmapCategory = 'mouvement' | 'combat' | 'equipe'
type HeatmapView =
  | 'predilection'
  | 'rotation'
  | 'rotation-lines'
  | 'kill'
  | 'shot'
  | 'damage'
  | 'knockout'
  | 'revive'
  | 'vehicle'
  | 'death'
type HeatmapViewSelection = HeatmapView | 'all'
type HeatmapRole = 'a' | 'b'
type PhaseFilter = 'all' | number

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
  selectedPhase: PhaseFilter
  maps: Array<{
    mapName: string
    matches: number
  }>
  members: MemberOption[]
  phases: number[]
  positions: HeatmapCell[]
  rotations: HeatmapCell[]
  trajectoryLines: TrajectoryLine[]
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
  note: string | null
}

const PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tout' },
]

const CATEGORY_OPTIONS: Array<{ value: HeatmapCategory; label: string }> = [
  { value: 'mouvement', label: 'Mouvement' },
  { value: 'combat', label: 'Combat' },
  { value: 'equipe', label: 'Équipe' },
]

const VIEW_OPTIONS_BY_CATEGORY: Record<HeatmapCategory, Array<{ value: HeatmapView; label: string }>> = {
  mouvement: [
    { value: 'predilection', label: 'Prédilection' },
    { value: 'rotation', label: 'Rotation' },
    { value: 'rotation-lines', label: 'Lignes' },
  ],
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
  mouvement: 'predilection',
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
    case 'predilection': return '0, 206, 255'
    case 'rotation':
    case 'rotation-lines': return '126, 92, 255'
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
  if (!roleOptions) return VIEW_OPTIONS_BY_CATEGORY.mouvement.find(o => o.value === view)?.label
    ?? VIEW_OPTIONS_BY_CATEGORY.combat.find(o => o.value === view)?.label
    ?? VIEW_OPTIONS_BY_CATEGORY.equipe.find(o => o.value === view)?.label
    ?? view
  return roleOptions[role === 'a' ? 0 : 1].label
}

function pointSize(ratio: number) {
  return 10 + ratio * 34
}

function opacityFor(ratio: number) {
  return 0.18 + ratio * 0.8
}

function phaseLabelFrom(value: PhaseFilter, labels: Record<string, string>) {
  if (value === 'all') return 'Toutes les phases'
  return isGameLabel(Number(value), labels)
}

function pickCells(payload: PositionsHeatmapResponse, view: HeatmapView, role: HeatmapRole): HeatmapCell[] {
  switch (view) {
    case 'predilection': return payload.positions
    case 'rotation': return payload.rotations
    case 'rotation-lines': return []
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
      },
      { key: 'vehicle', label: 'Véhicule', color: dotColor('vehicle'), cells: payload.vehicles ?? [] },
      { key: 'death', label: 'Mort', color: dotColor('death'), cells: payload.deaths ?? [] },
    ]
  }
  return [] as HeatmapLayer[]
}

const LEGEND_BY_CATEGORY: Record<HeatmapCategory, Array<{ color: string; label: string; desc: string }>> = {
  mouvement: [
    { color: 'rgb(0,206,255)', label: 'Prédilection', desc: 'Positions échantillonnées toutes les ~10 s.' },
    { color: 'rgb(126,92,255)', label: 'Rotation', desc: 'Point médian de chaque segment de déplacement.' },
    { color: 'rgb(126,92,255)', label: 'Lignes', desc: 'Vecteurs de mouvement — direction et fréquence.' },
  ],
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

export default function ClanPositionsHeatmapPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [mapName, setMapName] = useState('')
  const [memberKey, setMemberKey] = useState('')
  const [phase, setPhase] = useState<PhaseFilter>('all')
  const [category, setCategory] = useState<HeatmapCategory>('mouvement')
  const [view, setView] = useState<HeatmapViewSelection>('predilection')
  const [role, setRole] = useState<HeatmapRole>('a')
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

          const nextMap = nextPayload.selectedMap ?? nextPayload.maps[0]?.mapName ?? ''
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
      dot: view === 'kill' || view === 'knockout',
    }]
  }, [payload, view, role, category])

  const lines = useMemo(() => {
    if (!payload || view !== 'rotation-lines') return [] as TrajectoryLine[]
    return payload.trajectoryLines
  }, [payload, view])

  const maxCellCount = useMemo(
    () => layers.reduce((globalMax, layer) => Math.max(globalMax, layer.cells.reduce((max, cell) => Math.max(max, cell.count), 0)), 0),
    [layers],
  )
  const totalCellCount = useMemo(
    () => layers.reduce((sum, layer) => sum + layer.cells.reduce((layerSum, cell) => layerSum + cell.count, 0), 0),
    [layers],
  )
  const totalRenderedCells = useMemo(() => layers.reduce((sum, layer) => sum + layer.cells.length, 0), [layers])
  const maxLineCount = useMemo(() => lines.reduce((max, line) => Math.max(max, line.count), 0), [lines])
  const totalLineCount = useMemo(() => lines.reduce((sum, line) => sum + line.count, 0), [lines])
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
  const categoryLabel = CATEGORY_OPTIONS.find((entry) => entry.value === category)?.label ?? 'Mouvement'
  const viewLabelCurrent = view === 'all'
    ? 'Tous'
    : VIEW_OPTIONS_BY_CATEGORY[category].find((entry) => entry.value === view)?.label ?? viewLabel(view, role)
  const selectedPhaseLabel = phaseLabelFrom(phase, payload?.phaseLabels ?? {})

  const periodItems = PERIOD_OPTIONS.map((entry) => ({
    key: `period-${entry.value}`,
    label: entry.label,
    active: period === entry.value,
    onSelect: () => setPeriod(entry.value),
  }))

  const mapItems = (payload?.maps ?? []).map((entry) => ({
      key: `map-${entry.mapName}`,
      label: mapDisplayName(entry.mapName, payload?.mapLabels ?? {}),
      active: mapName === entry.mapName,
      onSelect: () => setMapName(entry.mapName),
    }))

  const phaseItems = [
    {
      key: 'phase-all',
      label: 'Toutes les phases',
      active: phase === 'all',
      onSelect: () => setPhase('all'),
    },
    ...((payload?.phases ?? []).map((entry) => ({
      key: `phase-${entry}`,
      label: phaseLabelFrom(entry, payload?.phaseLabels ?? {}),
      active: phase === entry,
      onSelect: () => setPhase(entry),
    }))),
  ]

  const categoryItems = CATEGORY_OPTIONS.map((entry) => ({
    key: `category-${entry.value}`,
    label: entry.label,
    active: category === entry.value,
    onSelect: () => handleCategoryChange(entry.value),
  }))

  const canSelectAllViews = category === 'combat' || category === 'equipe'
  const viewItems = [
    ...(canSelectAllViews
      ? [{
          key: 'view-all',
          label: 'Tous',
          active: view === 'all',
          onSelect: () => handleViewChange('all'),
        }]
      : []),
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
              Mouvement, combat et équipe — filtres membre, phase et période.
            </p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-slate-100">
            <p>Carte: {selectedMapLabel}</p>
            <p>Membre: {selectedMemberLabel}</p>
            <p>Phase: {phaseLabelFrom(phase, payload?.phaseLabels ?? {})}</p>
          </div>
        </div>
        <div className="mt-3">
          <ClanSectionNav clanId={clanId} />
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
              currentLabel={mapName ? mapDisplayName(mapName, payload?.mapLabels ?? {}) : 'Aucune carte'}
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
      </section>

      {loading ? <p className="mb-4 text-sm text-slate-600">Chargement des heatmaps positions...</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && payload ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Matchs analyses: {formatNumber(analyzedMatches)}</span>
            <span className="text-slate-600">
              Points visibles: {formatNumber(view === 'rotation-lines' ? totalLineCount : totalCellCount)}
            </span>
            <span className="text-slate-600">Cellules heatmap: {formatNumber(totalRenderedCells)}</span>
            <span className="text-slate-600">
              Intensite max: {formatNumber(view === 'rotation-lines' ? maxLineCount : maxCellCount)}
            </span>
          </div>
          <div>
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
                    {payload.safeZoneOverlay ? (
                      <circle
                        cx={payload.safeZoneOverlay.x}
                        cy={payload.safeZoneOverlay.y}
                        r={payload.safeZoneOverlay.r}
                        fill="none"
                        stroke="rgba(52, 211, 153, 0.7)"
                        strokeWidth={0.5}
                        strokeDasharray="2 1.5"
                      />
                    ) : null}
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
                        const left = ((cell.xIndex + 0.5) / payload.gridSize) * 100
                        const top = ((cell.yIndex + 0.5) / payload.gridSize) * 100
                        const size = pointSize(ratio)

                        if (layer.dot) {
                          const dotSize = 5 + ratio * 10
                          return (
                            <div
                              key={`${layer.key}-${cell.xIndex}-${cell.yIndex}`}
                              className="absolute rounded-full"
                              style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                width: `${dotSize}px`,
                                height: `${dotSize}px`,
                                transform: 'translate(-50%, -50%)',
                                backgroundColor: `rgba(${layer.color}, ${0.6 + ratio * 0.4})`,
                                boxShadow: `0 0 ${3 + ratio * 5}px rgba(${layer.color}, 0.9)`,
                                mixBlendMode: 'screen',
                              }}
                              title={`${layer.label} x:${cell.xIndex} y:${cell.yIndex} c:${cell.count}`}
                            />
                          )
                        }
                        return (
                          <div
                            key={`${layer.key}-${cell.xIndex}-${cell.yIndex}`}
                            className="absolute rounded-full"
                            style={{
                              left: `${left}%`,
                              top: `${top}%`,
                              width: `${size}px`,
                              height: `${size}px`,
                              transform: 'translate(-50%, -50%)',
                              background: `radial-gradient(circle, rgba(${layer.color}, ${opacityFor(ratio)}) 0%, rgba(${layer.color}, 0.45) 35%, rgba(${layer.color}, 0) 100%)`,
                              filter: 'blur(0.6px)',
                              mixBlendMode: 'screen',
                            }}
                            title={`${layer.label} x:${cell.xIndex} y:${cell.yIndex} c:${cell.count}`}
                          />
                        )
                      })
                    })}
                  </>
                )}
              </div>

              <div className="absolute left-4 top-4 rounded-xl border border-cyan-300/35 bg-slate-950/70 px-4 py-2 text-white shadow-[0_10px_30px_rgba(15,23,42,0.45)] backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Carte visible</p>
                <p className="mt-0.5 text-lg font-bold leading-tight text-white">{selectedMapLabel}</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  )
}
