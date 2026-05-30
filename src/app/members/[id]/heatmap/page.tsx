'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

import MemberSectionNav from '@/components/MemberSectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'

type HeatmapScope = 'self' | 'member' | 'clan' | 'best'
type BestMode = 'duo' | 'trio' | 'squad'
type HeatmapPeriod = 'week' | 'month' | 'all'

type HeatmapCell = {
  day: string
  dayIndex: number
  hour: number
  count: number
}

type HeatmapPayload = {
  scope: HeatmapScope
  scopeLabel: string
  options: {
    members: Array<{
      id: number
      displayName: string
    }>
    bestModes: BestMode[]
    mapNames: string[]
    mapLabels: Record<string, string>
  }
  selected: {
    memberId: number
    targetMemberId: number | null
    bestMode: BestMode
    period: HeatmapPeriod
    mapName: string
  }
  matchCount: number
  heatmap: HeatmapCell[]
  maxCellCount: number
  error?: string
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function cellTone(count: number, max: number) {
  if (count <= 0 || max <= 0) {
    return 'bg-slate-100'
  }

  const ratio = count / max

  if (ratio < 0.2) return 'bg-cyan-100'
  if (ratio < 0.4) return 'bg-cyan-200'
  if (ratio < 0.6) return 'bg-cyan-300'
  if (ratio < 0.8) return 'bg-cyan-400'
  return 'bg-cyan-500'
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, '0')}h`
}

export default function MemberHeatmapPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [scope, setScope] = useState<HeatmapScope>('self')
  const [targetMemberId, setTargetMemberId] = useState<number | null>(null)
  const [bestMode, setBestMode] = useState<BestMode>('duo')
  const [period, setPeriod] = useState<HeatmapPeriod>('all')
  const [mapName, setMapName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<HeatmapPayload | null>(null)

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadHeatmap() {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          scope,
          bestMode,
          period,
        })

        if (scope === 'member' && targetMemberId) {
          params.set('targetMemberId', String(targetMemberId))
        }

        if (mapName) {
          params.set('mapName', mapName)
        }

        const response = await fetch(`/api/members/${memberId}/activity-heatmap?${params.toString()}`)
        const data = (await response.json()) as HeatmapPayload

        if (!response.ok) {
          throw new Error(data.error ?? 'Impossible de charger la heatmap')
        }

        if (!cancelled) {
          setPayload(data)
          if (scope === 'member' && data.selected.targetMemberId) {
            setTargetMemberId(data.selected.targetMemberId)
          }
          setPeriod(data.selected.period)
          setMapName(data.selected.mapName)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger la heatmap')
          setPayload(null)
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
  }, [bestMode, mapName, memberId, period, scope, targetMemberId])

  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">ID joueur invalide.</p>
      </main>
    )
  }

  const countsByDay = new Map<number, number>()
  const countsByDayHour = new Map<string, number>()
  for (const cell of payload?.heatmap ?? []) {
    countsByDay.set(cell.dayIndex, (countsByDay.get(cell.dayIndex) ?? 0) + cell.count)
    countsByDayHour.set(`${cell.dayIndex}-${cell.hour}`, cell.count)
  }

  function getCellCount(dayIndex: number, hour: number) {
    return countsByDayHour.get(`${dayIndex}-${hour}`) ?? 0
  }

  const scopeLabelMap: Record<HeatmapScope, string> = {
    self: 'Le joueur',
    member: 'Un joueur specifique',
    clan: 'Le clan',
    best: 'Son meilleur duo/trio/squad',
  }

  const scopeItems: MobileDropdownNavItem[] = [
    {
      key: 'self',
      label: 'Le joueur',
      active: scope === 'self',
      onSelect: () => {
        setScope('self')
        setTargetMemberId(null)
      },
    },
    {
      key: 'member',
      label: 'Un joueur specifique',
      active: scope === 'member',
      onSelect: () => {
        setScope('member')
      },
    },
    {
      key: 'clan',
      label: 'Le clan',
      active: scope === 'clan',
      onSelect: () => {
        setScope('clan')
        setTargetMemberId(null)
      },
    },
    {
      key: 'best',
      label: 'Son meilleur duo/trio/squad',
      active: scope === 'best',
      onSelect: () => {
        setScope('best')
        setTargetMemberId(null)
      },
    },
  ]

  const periodLabelMap: Record<HeatmapPeriod, string> = {
    week: '7 jours',
    month: '30 jours',
    all: 'Tout',
  }

  const periodItems: MobileDropdownNavItem[] = [
    {
      key: 'week',
      label: '7 jours',
      active: period === 'week',
      onSelect: () => setPeriod('week'),
    },
    {
      key: 'month',
      label: '30 jours',
      active: period === 'month',
      onSelect: () => setPeriod('month'),
    },
    {
      key: 'all',
      label: 'Tout',
      active: period === 'all',
      onSelect: () => setPeriod('all'),
    },
  ]

  const selectedMapLabel =
    mapName === '' ? 'Toutes' : (payload?.options.mapLabels?.[mapName] ?? mapName)

  const mapItems: MobileDropdownNavItem[] = [
    {
      key: 'all',
      label: 'Toutes',
      active: mapName === '',
      onSelect: () => setMapName(''),
    },
    ...(payload?.options.mapNames ?? []).map((entry) => ({
      key: entry,
      label: payload?.options.mapLabels?.[entry] ?? entry,
      active: mapName === entry,
      onSelect: () => setMapName(entry),
    })),
  ]

  const selectedMemberId = targetMemberId ?? payload?.selected.targetMemberId ?? memberId
  const selectedMemberLabel =
    (payload?.options.members ?? []).find((entry) => entry.id === selectedMemberId)?.displayName ??
    `Joueur #${selectedMemberId}`

  const memberItems: MobileDropdownNavItem[] = (payload?.options.members ?? []).map((entry) => ({
    key: String(entry.id),
    label: entry.displayName,
    active: selectedMemberId === entry.id,
    onSelect: () => setTargetMemberId(entry.id),
  }))

  const bestModeLabelMap: Record<BestMode, string> = {
    duo: 'Meilleur duo',
    trio: 'Meilleur trio',
    squad: 'Meilleur squad',
  }

  const bestModeItems: MobileDropdownNavItem[] = [
    {
      key: 'duo',
      label: 'Meilleur duo',
      active: bestMode === 'duo',
      onSelect: () => setBestMode('duo'),
    },
    {
      key: 'trio',
      label: 'Meilleur trio',
      active: bestMode === 'trio',
      onSelect: () => setBestMode('trio'),
    },
    {
      key: 'squad',
      label: 'Meilleur squad',
      active: bestMode === 'squad',
      onSelect: () => setBestMode('squad'),
    },
  ]

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <MemberPageHeader
          title="Calendrier d'activite"
          subtitle="Repartition de l'activite par jour et par heure."
          showBackButton={false}
          framed={false}
        />
        <MemberSectionNav memberId={memberId} framed={false} showMemberIdentity={false} />
      </section>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <MobileDropdownNav
            id={`heatmap-scope-${memberId}`}
            label="Filtre"
            currentLabel={scopeLabelMap[scope]}
            items={scopeItems}
            variant="compact"
            visibilityClass="block"
            className="w-full sm:min-w-[11rem] sm:flex-1 md:w-fit md:flex-none md:max-w-full"
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

          <MobileDropdownNav
            id={`heatmap-period-${memberId}`}
            label="Periode"
            currentLabel={periodLabelMap[period]}
            items={periodItems}
            variant="compact"
            visibilityClass="block"
            className="w-full sm:min-w-[11rem] sm:flex-1 md:w-fit md:flex-none md:max-w-full"
            leftIcon={(
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <path
                  d="M6 2.5h1.5V4H12V2.5h1.5V4h2A1.5 1.5 0 0 1 17 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4h1.5V2.5Zm9.5 6h-11"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          />

          <MobileDropdownNav
            id={`heatmap-map-${memberId}`}
            label="Carte PUBG"
            currentLabel={selectedMapLabel}
            items={mapItems}
            variant="compact"
            visibilityClass="block"
            className="w-full sm:min-w-[11rem] sm:flex-1 md:w-fit md:flex-none md:max-w-full"
            leftIcon={(
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <path
                  d="M3.5 5.5 8 4l4 1.5L16.5 4v10.5L12 16l-4-1.5-4.5 1.5V5.5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          />

          {scope === 'member' ? (
            <MobileDropdownNav
              id={`heatmap-member-${memberId}`}
              label="Joueur"
              currentLabel={selectedMemberLabel}
              items={memberItems}
              variant="compact"
              visibilityClass="block"
              className="w-full sm:min-w-[11rem] sm:flex-1 md:w-fit md:flex-none md:max-w-full"
              leftIcon={(
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="M10 10.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm-5.5 5.3a5.5 5.5 0 0 1 11 0"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            />
          ) : null}

          {scope === 'best' ? (
            <MobileDropdownNav
              id={`heatmap-best-mode-${memberId}`}
              label="Formation"
              currentLabel={bestModeLabelMap[bestMode]}
              items={bestModeItems}
              variant="compact"
              visibilityClass="block"
              className="w-full sm:min-w-[11rem] sm:flex-1 md:w-fit md:flex-none md:max-w-full"
              leftIcon={(
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="M4.5 15.5h11M4.5 10h11M4.5 4.5h11"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            />
          ) : null}

          <div className="w-full rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-center text-sm text-cyan-900">
            <p className="mt-1 font-medium">{payload?.scopeLabel ?? 'Chargement...'}</p>
            <p className="mt-1 text-xs text-cyan-800">{payload?.matchCount ?? 0} match(s) utilises</p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="text-sm text-gray-500">Chargement de la heatmap...</p>
        ) : !payload || payload.heatmap.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune activite disponible pour ce filtre.</p>
        ) : (
          <div className="space-y-4">
            <div className="md:hidden">
              <div className="mb-2 grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-1">
                <div />
                {DAY_LABELS.map((dayLabel, dayIndex) => (
                  <div key={`mobile-day-head-${dayLabel}`} className="text-center text-[10px] text-gray-500">
                    <div className="font-semibold text-gray-600">{dayLabel}</div>
                    <div>{countsByDay.get(dayIndex) ?? 0}</div>
                  </div>
                ))}
              </div>

              {Array.from({ length: 24 }, (_, hour) => (
                <div key={`mobile-hour-${hour}`} className="mb-1 grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-1">
                  <div className="flex items-center justify-end pr-1 text-[10px] text-gray-500">{hourLabel(hour)}</div>

                  {DAY_LABELS.map((dayLabel, dayIndex) => {
                    const count = getCellCount(dayIndex, hour)

                    return (
                      <div
                        key={`mobile-${dayLabel}-${hour}`}
                        className={`h-5 rounded ${cellTone(count, payload.maxCellCount)}`}
                        title={`${dayLabel} ${hourLabel(hour)}: ${count} match(s)`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <div className="w-full">
                <div className="mb-2 grid grid-cols-[72px_repeat(24,minmax(0,1fr))] gap-1 lg:grid-cols-[90px_repeat(24,minmax(0,1fr))]">
                  <div />
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={`hour-head-${hour}`} className="text-center text-[10px] text-gray-500">
                      {hour % 2 === 0 ? hourLabel(hour) : ''}
                    </div>
                  ))}
                </div>

                {DAY_LABELS.map((dayLabel, dayIndex) => (
                  <div
                    key={`day-${dayLabel}`}
                    className="mb-1 grid grid-cols-[72px_repeat(24,minmax(0,1fr))] gap-1 lg:grid-cols-[90px_repeat(24,minmax(0,1fr))]"
                  >
                    <div className="flex items-center justify-between pr-1 text-[11px] text-gray-700 lg:pr-2 lg:text-xs">
                      <span className="font-semibold">{dayLabel}</span>
                      <span className="text-[9px] text-gray-500 lg:text-[10px]">{countsByDay.get(dayIndex) ?? 0}</span>
                    </div>

                    {Array.from({ length: 24 }, (_, hour) => {
                      const count = getCellCount(dayIndex, hour)

                      return (
                        <div
                          key={`${dayLabel}-${hour}`}
                          className={`h-5 rounded lg:h-6 ${cellTone(count, payload.maxCellCount)}`}
                          title={`${dayLabel} ${hourLabel(hour)}: ${count} match(s)`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Faible</span>
              <div className="h-3 w-6 rounded bg-slate-100" />
              <div className="h-3 w-6 rounded bg-cyan-100" />
              <div className="h-3 w-6 rounded bg-cyan-200" />
              <div className="h-3 w-6 rounded bg-cyan-300" />
              <div className="h-3 w-6 rounded bg-cyan-400" />
              <div className="h-3 w-6 rounded bg-cyan-500" />
              <span>Forte</span>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
