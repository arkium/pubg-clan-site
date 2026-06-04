'use client'

import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
import SegmentedControl from '@/components/ui/SegmentedControl'

type TelemetryPeriod = 'week' | 'month' | 'all'

type HeatmapMapRow = {
  mapName: string
  matches: number
  killEvents: number
  positionEvents: number
}

type HeatmapResponse = {
  ok: boolean
  clanId: number
  period: TelemetryPeriod
  periodKey: string
  selectedMap: string | null
  totalMatches: number
  maps: HeatmapMapRow[]
  note: string | null
}

const PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

const MAP_LABELS: Record<string, string> = {
  Baltic_Main: 'Erangel',
  Savage_Main: 'Sanhok',
  Desert_Main: 'Miramar',
  DihorOtok_Main: 'Vikendi',
  Range_Main: 'Camp Jackal',
  Summerland_Main: 'Karakin',
  Tiger_Main: 'Taego',
  Kiki_Main: 'Deston',
  Chimera_Main: 'Paramo',
  Heaven_Main: 'Haven',
  Neon_Main: 'Rondo',
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatNumber(value: number) {
  return value.toLocaleString('fr-FR')
}

function formatRatio(value: number) {
  return value.toFixed(2)
}

function mapDisplayName(mapName: string) {
  return MAP_LABELS[mapName] ?? mapName
}

function mapAssetPath(mapName: string) {
  return `/maps/pubg/${mapName}.webp`
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export default function ClanTelemetryHeatmapKillsPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [mapName, setMapName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<HeatmapResponse | null>(null)

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

        const response = await fetch(`/api/clans/${clanId}/telemetry/heatmap?${query.toString()}`, {
          cache: 'no-store',
        })

        const data = (await response.json()) as HeatmapResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Impossible de charger la heatmap telemetry')
        }

        if (!cancelled) {
          const nextPayload = data as HeatmapResponse
          setPayload(nextPayload)

          const selected = nextPayload.selectedMap ?? ''
          if (selected !== mapName) {
            setMapName(selected)
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setPayload(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger la heatmap telemetry'
          )
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
  }, [clanId, period, mapName])

  const totalKillEvents = useMemo(
    () => (payload?.maps ?? []).reduce((sum, row) => sum + row.killEvents, 0),
    [payload]
  )
  const totalPositionEvents = useMemo(
    () => (payload?.maps ?? []).reduce((sum, row) => sum + row.positionEvents, 0),
    [payload]
  )
  const maxKillEvents = useMemo(
    () => (payload?.maps ?? []).reduce((max, row) => Math.max(max, row.killEvents), 0),
    [payload]
  )

  if (!clanId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">Clan invalide.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Heatmap kills clan</h1>
            <p className="text-sm text-gray-600">Vue map-level pour preparer la couche geospatiale detaillee.</p>
            <ClanSectionNav clanId={clanId} />
          </div>
        </div>
      </header>

      <section className="mb-6 rounded border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Periode</p>
            <SegmentedControl
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              size="sm"
              fullWidthOnMobile
              className="w-full sm:w-auto"
            />
          </div>

          <label className="min-w-[14rem] flex-1 text-sm text-gray-700 md:max-w-xs" htmlFor="telemetry-map-filter">
            Carte
            <select
              id="telemetry-map-filter"
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              value={mapName}
              onChange={(event) => setMapName(event.target.value)}
            >
              <option value="">Toutes les cartes</option>
              {(payload?.maps ?? []).map((entry) => (
                <option key={entry.mapName} value={entry.mapName}>
                  {mapDisplayName(entry.mapName)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loading ? <p className="mb-4 text-sm text-gray-600">Chargement de la heatmap telemetry...</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && payload?.note ? (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {payload.note}
        </p>
      ) : null}

      {!loading && !error && payload ? (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Matchs</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{formatNumber(payload.totalMatches)}</p>
            </article>
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Kill events</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{formatNumber(totalKillEvents)}</p>
            </article>
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Position events</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{formatNumber(totalPositionEvents)}</p>
            </article>
          </section>

          <section className="mb-6">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Intensite par carte</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {payload.maps.map((row) => {
                const intensity = maxKillEvents > 0 ? row.killEvents / maxKillEvents : 0
                const intensityPercent = Math.round(clamp(intensity, 0, 1) * 100)
                const killsPerMatch = row.matches > 0 ? row.killEvents / row.matches : 0
                const isSelected = mapName === row.mapName

                return (
                  <button
                    key={`card:${row.mapName}`}
                    type="button"
                    onClick={() => setMapName((previous) => (previous === row.mapName ? '' : row.mapName))}
                    className={`group overflow-hidden rounded-xl border text-left shadow-sm transition hover:shadow-md ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-200'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div
                      className="relative h-28"
                      style={{
                        backgroundImage: `linear-gradient(120deg, rgba(8,26,59,0.86), rgba(13,89,138,0.65)), url('${mapAssetPath(row.mapName)}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                      <div className="relative flex h-full items-end justify-between px-3 py-2 text-white">
                        <div>
                          <p className="text-base font-semibold">{mapDisplayName(row.mapName)}</p>
                          <p className="text-xs text-white/85">{formatNumber(row.matches)} matchs</p>
                        </div>
                        <p className="rounded-full bg-black/35 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                          {intensityPercent}%
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 px-3 py-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600"
                          style={{ width: `${intensityPercent}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <p>
                          <span className="block text-[10px] uppercase tracking-wide text-gray-500">Kill events</span>
                          <span className="font-semibold text-gray-900">{formatNumber(row.killEvents)}</span>
                        </p>
                        <p>
                          <span className="block text-[10px] uppercase tracking-wide text-gray-500">Kills/match</span>
                          <span className="font-semibold text-gray-900">{formatRatio(killsPerMatch)}</span>
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {payload.maps.length > 0 ? (
            <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Carte</th>
                      <th className="px-3 py-2 text-right">Matchs</th>
                      <th className="px-3 py-2 text-right">Kill events</th>
                      <th className="px-3 py-2 text-right">Position events</th>
                      <th className="px-3 py-2 text-right">Kills / match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.maps.map((row) => {
                      const killsPerMatch = row.matches > 0 ? row.killEvents / row.matches : 0

                      return (
                        <tr key={row.mapName} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{mapDisplayName(row.mapName)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.matches)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.killEvents)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.positionEvents)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatRatio(killsPerMatch)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <p className="text-sm text-gray-600">Aucune donnee heatmap pour cette periode.</p>
          )}
        </>
      ) : null}
    </main>
  )
}
