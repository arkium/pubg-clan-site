'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

import { usePlayerDashboard, usePlayerMatches } from '@/hooks/usePlayerDashboard'
import PlayerStats from '@/components/dashboard/PlayerStats'
import MatchHistory from '@/components/dashboard/MatchHistory'
import SquadFrequency from '@/components/dashboard/SquadFrequency'
import ProgressionChart from '@/components/dashboard/ProgressionChart'
import ComparisonRadar from '@/components/dashboard/ComparisonRadar'
import MemberSectionNav from '@/components/MemberSectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import PlacementBadge from '@/components/ui/PlacementBadge'
import type {
  DashboardMatchSortDirection,
  DashboardMatchSortKey,
  DashboardPeriod,
} from '@/types/dashboard'

type TelemetryPlaystyleStats = {
  aggressionScore: number
  supportScore: number
  zoneDisciplineScore: number
  avgBlueZoneHits: number
  avgFirstContactPhase: number
  avgCircleDelaySeconds: number
  avgCircleDelayPercent: number
  avgSafeZonePresencePercent: number
  avgOnFootDistanceMeters: number
  avgVehicleDistanceMeters: number
  avgDamageTaken: number
  avgHealsUsed: number
  avgHealAmount: number
  avgBoostsUsed: number
  maxVehicleSpeedKph: number
  avgVehicleRideEvents: number
  avgVehicleLeaveEvents: number
  avgPositionEvents: number
  matchesPlayed: number
}

type TelemetryComparisonPeriod = 'week' | 'month' | 'all'

type TelemetryComparisonSortKey = TelemetryComparisonPeriod

type TelemetryComparisonSortDirection = 'asc' | 'desc'

type TelemetryComparisonData = Record<TelemetryComparisonPeriod, TelemetryPlaystyleStats | null>

type TelemetryComparisonMetric = {
  key: string
  label: string
  getValue: (stats: TelemetryPlaystyleStats) => number
  format: (value: number) => string
}

type MemberTelemetryPlaystyleResponse = {
  ok: boolean
  meta?: {
    period?: DashboardPeriod
    periodKey?: string
    count?: number
  }
  data?: {
    stats?: TelemetryPlaystyleStats | null
  }
  stats?: TelemetryPlaystyleStats | null
  error?: {
    message?: string
  }
}

const TELEMETRY_COMPARISON_PERIODS: TelemetryComparisonPeriod[] = ['week', 'month', 'all']

const TELEMETRY_COMPARISON_PERIOD_LABELS: Record<TelemetryComparisonPeriod, string> = {
  week: 'Semaine',
  month: 'Mois',
  all: 'Tous',
}

function formatTelemetryScore(value: number) {
  return Math.max(0, value).toFixed(1)
}

function formatTelemetryPercent(value: number) {
  return `${formatTelemetryScore(value)}%`
}

function formatSeconds(value: number) {
  return `${Math.max(0, value).toFixed(1)} s`
}

function formatMeters(value: number) {
  return `${Math.max(0, value).toFixed(0)} m`
}

function formatTelemetryCount(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString('fr-FR')
}

const TELEMETRY_COMPARISON_METRICS: TelemetryComparisonMetric[] = [
  {
    key: 'aggressionScore',
    label: 'Agressivite (%)',
    getValue: (stats) => stats.aggressionScore,
    format: formatTelemetryPercent,
  },
  {
    key: 'supportScore',
    label: 'Support (%)',
    getValue: (stats) => stats.supportScore,
    format: formatTelemetryPercent,
  },
  {
    key: 'zoneDisciplineScore',
    label: 'Discipline zone (%)',
    getValue: (stats) => stats.zoneDisciplineScore,
    format: formatTelemetryPercent,
  },
  {
    key: 'avgBlueZoneHits',
    label: 'Blue zone hits (evt/match)',
    getValue: (stats) => stats.avgBlueZoneHits,
    format: formatTelemetryScore,
  },
  {
    key: 'avgFirstContactPhase',
    label: 'First contact (phase)',
    getValue: (stats) => stats.avgFirstContactPhase,
    format: formatTelemetryScore,
  },
  {
    key: 'avgCircleDelaySeconds',
    label: 'Retard cercle (s)',
    getValue: (stats) => stats.avgCircleDelaySeconds,
    format: formatSeconds,
  },
  {
    key: 'avgCircleDelayPercent',
    label: 'Temps hors zone (%)',
    getValue: (stats) => stats.avgCircleDelayPercent,
    format: formatTelemetryPercent,
  },
  {
    key: 'avgSafeZonePresencePercent',
    label: 'Presence safe zone (%)',
    getValue: (stats) => stats.avgSafeZonePresencePercent,
    format: formatTelemetryPercent,
  },
  {
    key: 'avgOnFootDistanceMeters',
    label: 'Distance a pied',
    getValue: (stats) => stats.avgOnFootDistanceMeters,
    format: formatMeters,
  },
  {
    key: 'avgVehicleDistanceMeters',
    label: 'Distance vehicule',
    getValue: (stats) => stats.avgVehicleDistanceMeters,
    format: formatMeters,
  },
  {
    key: 'avgDamageTaken',
    label: 'Degats recus',
    getValue: (stats) => stats.avgDamageTaken,
    format: formatTelemetryScore,
  },
  {
    key: 'avgHealsUsed',
    label: 'Soins utilises (moy/match)',
    getValue: (stats) => stats.avgHealsUsed,
    format: formatTelemetryScore,
  },
  {
    key: 'avgHealAmount',
    label: 'HP soignes (moy/match)',
    getValue: (stats) => stats.avgHealAmount,
    format: formatTelemetryScore,
  },
  {
    key: 'avgBoostsUsed',
    label: 'Boosts utilises (moy/match)',
    getValue: (stats) => stats.avgBoostsUsed,
    format: formatTelemetryScore,
  },
  {
    key: 'maxVehicleSpeedKph',
    label: 'Vitesse max vehicule (km/h)',
    getValue: (stats) => stats.maxVehicleSpeedKph,
    format: formatTelemetryScore,
  },
  {
    key: 'avgVehicleRideEvents',
    label: 'Montee vehicule (evt/match)',
    getValue: (stats) => stats.avgVehicleRideEvents,
    format: formatTelemetryScore,
  },
  {
    key: 'avgVehicleLeaveEvents',
    label: 'Sortie vehicule (evt/match)',
    getValue: (stats) => stats.avgVehicleLeaveEvents,
    format: formatTelemetryScore,
  },
  {
    key: 'avgPositionEvents',
    label: 'Positions observees (evt/match)',
    getValue: (stats) => stats.avgPositionEvents,
    format: formatTelemetryScore,
  },
  {
    key: 'matchesPlayed',
    label: 'Matchs analyses',
    getValue: (stats) => stats.matchesPlayed,
    format: formatTelemetryCount,
  },
]

function getTelemetryErrorMessage(payload: unknown, fallback: string) {
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
  }

  return fallback
}

export default function DashboardPage() {
  const params = useParams()
  const memberId = params?.id ? Number(params.id) : null

  const [period, setPeriod] = useState<DashboardPeriod>('week')
  const [matchPeriod, setMatchPeriod] = useState<DashboardPeriod>('week')
  const [matchOffset, setMatchOffset] = useState(0)
  const [matchSortKey, setMatchSortKey] = useState<DashboardMatchSortKey>('pubgCreatedAt')
  const [matchSortDir, setMatchSortDir] = useState<DashboardMatchSortDirection>('desc')
  const [telemetryStats, setTelemetryStats] = useState<TelemetryPlaystyleStats | null>(null)
  const [loadingTelemetry, setLoadingTelemetry] = useState(false)
  const [telemetryError, setTelemetryError] = useState('')
  const [telemetryComparison, setTelemetryComparison] = useState<TelemetryComparisonData>({
    week: null,
    month: null,
    all: null,
  })
  const [loadingTelemetryComparison, setLoadingTelemetryComparison] = useState(false)
  const [telemetryComparisonError, setTelemetryComparisonError] = useState('')
  const [telemetryComparisonSortKey, setTelemetryComparisonSortKey] =
    useState<TelemetryComparisonSortKey>('week')
  const [telemetryComparisonSortDirection, setTelemetryComparisonSortDirection] =
    useState<TelemetryComparisonSortDirection>('desc')
  const MATCH_LIMIT = 10

  const { data, loading, error } = usePlayerDashboard(memberId, period)
  const {
    data: matchData,
    loading: matchLoading,
  } = usePlayerMatches(memberId, matchPeriod, MATCH_LIMIT, matchOffset, matchSortKey, matchSortDir)

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadTelemetryPlaystyle() {
      try {
        setLoadingTelemetry(true)
        setTelemetryError('')

        const response = await fetch(`/api/members/${memberId}/telemetry/playstyle?period=${period}`, {
          cache: 'no-store',
        })

        const payload = (await response.json()) as MemberTelemetryPlaystyleResponse

        if (!response.ok) {
          throw new Error(
            getTelemetryErrorMessage(payload, 'Impossible de charger la telemetrie playstyle du joueur')
          )
        }

        if (!cancelled) {
          setTelemetryStats(payload.data?.stats ?? payload.stats ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setTelemetryStats(null)
          setTelemetryError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger la telemetrie playstyle du joueur'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingTelemetry(false)
        }
      }
    }

    void loadTelemetryPlaystyle()

    return () => {
      cancelled = true
    }
  }, [memberId, period])

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadTelemetryComparison() {
      try {
        setLoadingTelemetryComparison(true)
        setTelemetryComparisonError('')

        const settled = await Promise.allSettled(
          TELEMETRY_COMPARISON_PERIODS.map(async (comparisonPeriod) => {
            const response = await fetch(
              `/api/members/${memberId}/telemetry/playstyle?period=${comparisonPeriod}`,
              {
                cache: 'no-store',
              }
            )

            const payload = (await response.json()) as MemberTelemetryPlaystyleResponse

            if (!response.ok) {
              throw new Error(
                getTelemetryErrorMessage(
                  payload,
                  `Impossible de charger la telemetrie playstyle (${TELEMETRY_COMPARISON_PERIOD_LABELS[comparisonPeriod]})`
                )
              )
            }

            return {
              period: comparisonPeriod,
              stats: payload.data?.stats ?? payload.stats ?? null,
            }
          })
        )

        if (cancelled) {
          return
        }

        const nextComparison: TelemetryComparisonData = {
          week: null,
          month: null,
          all: null,
        }

        const errors: string[] = []

        for (const result of settled) {
          if (result.status === 'fulfilled') {
            nextComparison[result.value.period] = result.value.stats
          } else {
            const reason =
              result.reason instanceof Error
                ? result.reason.message
                : 'Erreur de chargement telemetry comparaison'
            errors.push(reason)
          }
        }

        setTelemetryComparison(nextComparison)

        if (errors.length > 0 && errors.length < TELEMETRY_COMPARISON_PERIODS.length) {
          setTelemetryComparisonError('Certaines periodes de comparaison n\'ont pas pu etre chargees.')
        } else if (errors.length === TELEMETRY_COMPARISON_PERIODS.length) {
          setTelemetryComparisonError('Impossible de charger la comparaison telemetry.')
        }
      } catch (loadError) {
        if (!cancelled) {
          setTelemetryComparison({
            week: null,
            month: null,
            all: null,
          })
          setTelemetryComparisonError(
            loadError instanceof Error ? loadError.message : 'Impossible de charger la comparaison telemetry.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingTelemetryComparison(false)
        }
      }
    }

    void loadTelemetryComparison()

    return () => {
      cancelled = true
    }
  }, [memberId])

  const telemetryComparisonRows = useMemo(() => {
    const rows = TELEMETRY_COMPARISON_METRICS.map((metric) => ({
      metric,
      values: {
        week: telemetryComparison.week ? metric.getValue(telemetryComparison.week) : null,
        month: telemetryComparison.month ? metric.getValue(telemetryComparison.month) : null,
        all: telemetryComparison.all ? metric.getValue(telemetryComparison.all) : null,
      },
    }))

    const direction = telemetryComparisonSortDirection === 'asc' ? 1 : -1

    return rows.sort((left, right) => {
      const leftValue = left.values[telemetryComparisonSortKey] ?? Number.NEGATIVE_INFINITY
      const rightValue = right.values[telemetryComparisonSortKey] ?? Number.NEGATIVE_INFINITY

      if (leftValue === rightValue) {
        return left.metric.label.localeCompare(right.metric.label, 'fr-FR')
      }

      return (leftValue - rightValue) * direction
    })
  }, [telemetryComparison, telemetryComparisonSortDirection, telemetryComparisonSortKey])

  function toggleTelemetryComparisonSort(nextKey: TelemetryComparisonSortKey) {
    if (telemetryComparisonSortKey === nextKey) {
      setTelemetryComparisonSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }

    setTelemetryComparisonSortKey(nextKey)
    setTelemetryComparisonSortDirection('desc')
  }

  if (!memberId) {
    return (
      <div className="app-page-surface min-h-screen p-8">
        <p className="text-red-600">ID joueur invalide.</p>
      </div>
    )
  }

  if (loading && !data.member.id) {
    return (
      <div className="app-page-surface flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-page-surface min-h-screen p-8">
        <p className="text-red-600">Erreur : {error}</p>
        <Link href="/members" className="mt-2 inline-block text-blue-600 hover:underline">
          ← Retour aux membres
        </Link>
      </div>
    )
  }

  const { stats, clanAverage, progression, topPerformances, squads, mapLabels } = data

  return (
    <div className="app-page-surface min-h-screen">
      {/* Content */}
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <MemberPageHeader
            title="Tableau de bord"
            subtitle="Vue synthese des performances du joueur."
            showBackButton={false}
            framed={false}
          />
          <MemberSectionNav memberId={memberId} framed={false} showMemberIdentity={false} />
        </section>

        {/* Stats principales */}
        <PlayerStats
          stats={stats}
          clanAverage={clanAverage}
          period={period}
          onPeriodChange={setPeriod}
        />

        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Playstyle et discipline zone</h2>
            <p className="text-xs text-gray-500">Meme periode que les stats principales.</p>
          </div>

          {loadingTelemetry ? (
            <p className="px-4 py-5 text-sm text-gray-600">Chargement de la telemetrie playstyle...</p>
          ) : null}

          {!loadingTelemetry && telemetryError ? (
            <p className="px-4 py-5 text-sm text-amber-700">{telemetryError}</p>
          ) : null}

          {!loadingTelemetry && !telemetryError ? (
            telemetryStats ? (
              <div className="space-y-4 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <article className="rounded border border-red-200 bg-red-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-red-700">Agressivite (%)</p>
                    <p className="mt-1 text-xl font-semibold text-red-900">
                      {formatTelemetryPercent(telemetryStats.aggressionScore)}
                    </p>
                  </article>
                  <article className="rounded border border-sky-200 bg-sky-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-sky-700">Support (%)</p>
                    <p className="mt-1 text-xl font-semibold text-sky-900">
                      {formatTelemetryPercent(telemetryStats.supportScore)}
                    </p>
                  </article>
                  <article className="rounded border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-emerald-700">Discipline zone (%)</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-900">
                      {formatTelemetryPercent(telemetryStats.zoneDisciplineScore)}
                    </p>
                  </article>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Blue zone hits moyens (evt / match)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgBlueZoneHits)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">First contact moyen (phase)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgFirstContactPhase)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Retard cercle moyen (s)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatSeconds(telemetryStats.avgCircleDelaySeconds)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Temps hors zone moyen (%)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryPercent(telemetryStats.avgCircleDelayPercent)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Presence safe zone moyenne (%)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryPercent(telemetryStats.avgSafeZonePresencePercent)}
                    </p>
                  </article>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Distance a pied moyenne</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatMeters(telemetryStats.avgOnFootDistanceMeters)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Distance vehicule moyenne</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatMeters(telemetryStats.avgVehicleDistanceMeters)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Degats recus moyens</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgDamageTaken)}
                    </p>
                  </article>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Soins utilises (moy / match)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgHealsUsed)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">HP soignes (moy / match)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgHealAmount)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Boosts utilises (moy / match)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgBoostsUsed)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Vitesse max vehicule (km/h)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.maxVehicleSpeedKph)}
                    </p>
                  </article>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Montee vehicule (evt / match)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgVehicleRideEvents)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Sortie vehicule (evt / match)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgVehicleLeaveEvents)}
                    </p>
                  </article>
                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Positions observees (evt / match)</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgPositionEvents)}
                    </p>
                  </article>
                </div>

                <p className="text-xs text-gray-500">
                  Matchs analyses sur la periode: {telemetryStats.matchesPlayed}
                </p>
              </div>
            ) : (
              <p className="px-4 py-5 text-sm text-gray-600">
                Aucune donnee telemetry playstyle pour cette periode.
              </p>
            )
          ) : null}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Comparaison telemetry multi-periodes</h2>
            <p className="text-xs text-gray-500">Tri: clique sur Semaine, Mois ou Tous.</p>
          </div>

          {loadingTelemetryComparison ? (
            <p className="px-4 py-5 text-sm text-gray-600">Chargement de la comparaison telemetry...</p>
          ) : null}

          {!loadingTelemetryComparison && telemetryComparisonError ? (
            <p className="px-4 py-5 text-sm text-amber-700">{telemetryComparisonError}</p>
          ) : null}

          {!loadingTelemetryComparison && !telemetryComparisonError ? (
            <div className="overflow-x-auto px-2 py-2 sm:px-4 sm:py-4">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th scope="col" className="px-3 py-2">Metrique</th>
                    {TELEMETRY_COMPARISON_PERIODS.map((comparisonPeriod) => {
                      const isActive = telemetryComparisonSortKey === comparisonPeriod
                      const arrow =
                        isActive && telemetryComparisonSortDirection === 'desc' ? '↓' : isActive ? '↑' : ''

                      return (
                        <th scope="col" key={comparisonPeriod} className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleTelemetryComparisonSort(comparisonPeriod)}
                            className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${
                              isActive ? 'bg-slate-100 font-semibold text-slate-800' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                            title={`Trier par ${TELEMETRY_COMPARISON_PERIOD_LABELS[comparisonPeriod]}`}
                          >
                            <span>{TELEMETRY_COMPARISON_PERIOD_LABELS[comparisonPeriod]}</span>
                            <span className="w-3 text-center">{arrow}</span>
                          </button>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {telemetryComparisonRows.map((row) => (
                    <tr key={row.metric.key} className="border-b border-gray-100 last:border-b-0">
                      <th scope="row" className="px-3 py-2 text-left font-medium text-gray-900">
                        {row.metric.label}
                      </th>
                      {TELEMETRY_COMPARISON_PERIODS.map((comparisonPeriod) => {
                        const value = row.values[comparisonPeriod]
                        return (
                          <td key={`${row.metric.key}:${comparisonPeriod}`} className="px-3 py-2 text-gray-700">
                            {value === null ? 'N/D' : row.metric.format(value)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {/* Progression + Radar */}
        <div className="grid gap-6 md:grid-cols-2">
          <ProgressionChart progression={progression} />
          <ComparisonRadar stats={stats} clanAverage={clanAverage} />
        </div>

        {/* Squad frequency + Top performances */}
        <div className="grid gap-6 md:grid-cols-2">
          <SquadFrequency squads={squads} />

          {/* Top performances */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-900">Meilleures performances</h2>
              <p className="text-xs text-gray-500">Top 5 par kills</p>
            </div>
            {topPerformances.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">
                Aucun match enregistré pour l&apos;instant.
              </p>
            ) : (
              <ul>
                {topPerformances.map((m, i) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 border-t border-gray-200 px-4 py-3 first:border-t-0"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {m.kills} kills · {Math.round(m.damageDealt)} dmg
                      </p>
                      <p className="text-xs text-gray-500">
                        <PlacementBadge placement={m.placement} className="mr-1 align-middle" />
                        {mapLabels[m.mapName] ?? m.mapName} ·{' '}
                        {new Date(m.pubgCreatedAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    {m.placement === 1 && (
                      <span className="text-lg" title="Victoire">
                        🏆
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Match history */}
        <MatchHistory
          matches={matchData.matches}
          totalCount={matchData.totalCount}
          mapLabels={matchData.mapLabels}
          period={matchPeriod}
          onPeriodChange={(p) => {
            setMatchPeriod(p)
            setMatchOffset(0)
          }}
          limit={MATCH_LIMIT}
          offset={matchOffset}
          onOffsetChange={setMatchOffset}
          sortKey={matchSortKey}
          sortDir={matchSortDir}
          onSortChange={(nextSortKey, nextSortDir) => {
            setMatchSortKey(nextSortKey)
            setMatchSortDir(nextSortDir)
            setMatchOffset(0)
          }}
          loading={matchLoading}
        />
      </div>
    </div>
  )
}
