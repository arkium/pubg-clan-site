'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

import MemberSectionNav from '@/components/MemberSectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import NotificationBell from '@/components/NotificationBell'

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
  for (const cell of payload?.heatmap ?? []) {
    countsByDay.set(cell.dayIndex, (countsByDay.get(cell.dayIndex) ?? 0) + cell.count)
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6">
        <MemberPageHeader
          title="Calendrier d'activite"
          subtitle="Repartition de l'activite par jour et par heure."
          actions={<NotificationBell memberId={memberId} />}
        />
      </div>

      <MemberSectionNav memberId={memberId} />

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Filtre</span>
            <select
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as HeatmapScope
                setScope(nextScope)
                if (nextScope !== 'member') {
                  setTargetMemberId(null)
                }
              }}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="self">Le joueur</option>
              <option value="member">Un joueur specifique</option>
              <option value="clan">Le clan</option>
              <option value="best">Son meilleur duo/trio/squad</option>
            </select>
          </label>

          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Periode</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as HeatmapPeriod)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="week">7 jours</option>
              <option value="month">30 jours</option>
              <option value="all">Tout</option>
            </select>
          </label>

          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Carte PUBG</span>
            <select
              value={mapName}
              onChange={(event) => setMapName(event.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Toutes</option>
              {(payload?.options.mapNames ?? []).map((entry) => (
                <option key={entry} value={entry}>
                  {payload?.options.mapLabels?.[entry] ?? entry}
                </option>
              ))}
            </select>
          </label>

          {scope === 'member' ? (
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Joueur</span>
              <select
                value={targetMemberId ?? payload?.selected.targetMemberId ?? memberId}
                onChange={(event) => setTargetMemberId(Number(event.target.value))}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {(payload?.options.members ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {scope === 'best' ? (
            <label className="text-sm text-gray-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Formation</span>
              <select
                value={bestMode}
                onChange={(event) => setBestMode(event.target.value as BestMode)}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="duo">Meilleur duo</option>
                <option value="trio">Meilleur trio</option>
                <option value="squad">Meilleur squad</option>
              </select>
            </label>
          ) : null}

          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
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
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="mb-2 grid grid-cols-[90px_repeat(24,minmax(24px,1fr))] gap-1">
                  <div />
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={`hour-head-${hour}`} className="text-center text-[10px] text-gray-500">
                      {hour % 2 === 0 ? hourLabel(hour) : ''}
                    </div>
                  ))}
                </div>

                {DAY_LABELS.map((dayLabel, dayIndex) => (
                  <div key={`day-${dayLabel}`} className="mb-1 grid grid-cols-[90px_repeat(24,minmax(24px,1fr))] gap-1">
                    <div className="flex items-center justify-between pr-2 text-xs text-gray-700">
                      <span className="font-semibold">{dayLabel}</span>
                      <span className="text-[10px] text-gray-500">{countsByDay.get(dayIndex) ?? 0}</span>
                    </div>

                    {Array.from({ length: 24 }, (_, hour) => {
                      const cell = payload.heatmap.find(
                        (entry) => entry.dayIndex === dayIndex && entry.hour === hour
                      )
                      const count = cell?.count ?? 0

                      return (
                        <div
                          key={`${dayLabel}-${hour}`}
                          className={`h-6 rounded ${cellTone(count, payload.maxCellCount)}`}
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
