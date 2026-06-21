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
import SectionNav from '@/components/SectionNav'
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
  const km = Math.max(0, value) / 10 / 1000
  return `${km.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

function formatTelemetrySpeedKph(value: number) {
  const kph = Math.max(0, value) / 10
  return kph.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
    format: formatTelemetrySpeedKph,
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

function ArcGauge({ value, color, size = 88 }: { value: number; color: string; size?: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  const arc = c * 0.75
  const fill = arc * Math.min(1, Math.max(0, value / 100))
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
      <g transform="rotate(135 40 40)">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(148,163,184,0.22)"
          strokeWidth="7" strokeDasharray={`${arc} ${c - arc}`} strokeLinecap="round" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color}
          strokeWidth="7" strokeDasharray={`${fill} ${c - fill}`} strokeLinecap="round" />
      </g>
    </svg>
  )
}

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
          <SectionNav section="member-section" />
        </section>

        {/* Stats principales */}
        <PlayerStats
          stats={stats}
          clanAverage={clanAverage}
          period={period}
          onPeriodChange={setPeriod}
        />

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Header sombre PUBG-style */}
          <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-4">
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full border border-white/5" />
            <div className="pointer-events-none absolute -right-1 top-1 h-14 w-14 rounded-full border border-white/5" />
            <div className="pointer-events-none absolute -left-5 -bottom-5 h-20 w-20 rounded-full border border-white/5" />
            <h2 className="relative text-base font-bold tracking-wide text-white">Playstyle &amp; Discipline Zone</h2>
            <p className="relative text-xs text-slate-400">
              Analyse télémétrie · même période que les stats principales
            </p>
          </div>

          {loadingTelemetry ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : telemetryError ? (
            <p className="px-5 py-5 text-sm text-amber-700">{telemetryError}</p>
          ) : telemetryStats ? (
            <div className="divide-y divide-gray-100">

              {/* ── 3 jauges arc ── */}
              <div className="grid grid-cols-3 divide-x divide-gray-100">

                {/* Agression */}
                <div className="flex flex-col items-center gap-1 px-2 py-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Fragger</p>
                  <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
                    <ArcGauge value={telemetryStats.aggressionScore} color="#ef4444" size={88} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                      <svg viewBox="0 0 100 100" className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" aria-hidden="true">
                        <circle cx="50" cy="50" r="42" strokeWidth="5"/>
                        <circle cx="50" cy="50" r="16" strokeWidth="5"/>
                        <circle cx="50" cy="50" r="4" fill="currentColor" stroke="none"/>
                        <line x1="50" y1="3" x2="50" y2="29" strokeWidth="5" strokeLinecap="round"/>
                        <line x1="50" y1="71" x2="50" y2="97" strokeWidth="5" strokeLinecap="round"/>
                        <line x1="3" y1="50" x2="29" y2="50" strokeWidth="5" strokeLinecap="round"/>
                        <line x1="71" y1="50" x2="97" y2="50" strokeWidth="5" strokeLinecap="round"/>
                      </svg>
                      <span className="text-sm font-bold leading-none text-red-600">
                        {telemetryStats.aggressionScore.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-700">Agressivité</p>
                </div>

                {/* Support */}
                <div className="flex flex-col items-center gap-1 px-2 py-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sky-500">Medic</p>
                  <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
                    <ArcGauge value={telemetryStats.supportScore} color="#0ea5e9" size={88} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                      <svg viewBox="0 0 100 100" className="h-5 w-5 text-sky-500" fill="currentColor" aria-hidden="true">
                        <rect x="6" y="22" width="88" height="65" rx="10" opacity="0.18"/>
                        <rect x="6" y="22" width="88" height="65" rx="10" fill="none" stroke="currentColor" strokeWidth="5"/>
                        <rect x="36" y="6" width="28" height="25" rx="6" fill="none" stroke="currentColor" strokeWidth="5"/>
                        <rect x="42" y="39" width="16" height="34" rx="4"/>
                        <rect x="33" y="48" width="34" height="16" rx="4"/>
                      </svg>
                      <span className="text-sm font-bold leading-none text-sky-600">
                        {telemetryStats.supportScore.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-700">Support</p>
                </div>

                {/* Zone */}
                <div className="flex flex-col items-center gap-1 px-2 py-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Ghost</p>
                  <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
                    <ArcGauge value={telemetryStats.zoneDisciplineScore} color="#10b981" size={88} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                      <svg viewBox="0 0 100 100" className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" aria-hidden="true">
                        <circle cx="50" cy="50" r="44" strokeWidth="4" opacity="0.25"/>
                        <circle cx="50" cy="50" r="30" strokeWidth="5" opacity="0.55"/>
                        <circle cx="50" cy="50" r="16" strokeWidth="6" opacity="0.8"/>
                        <circle cx="50" cy="50" r="5" fill="currentColor" stroke="none"/>
                      </svg>
                      <span className="text-sm font-bold leading-none text-emerald-700">
                        {telemetryStats.zoneDisciplineScore.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-700">Discipline Zone</p>
                </div>
              </div>

              {/* ── Gestion du cercle ── */}
              <div className="px-5 py-4">
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Gestion du cercle</p>

                {/* Barre safe / hors zone */}
                <div className="mb-1.5 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="bg-emerald-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, telemetryStats.avgSafeZonePresencePercent)}%` }}
                  />
                  <div
                    className="bg-red-400 transition-all duration-500"
                    style={{ width: `${Math.min(100 - telemetryStats.avgSafeZonePresencePercent, telemetryStats.avgCircleDelayPercent)}%` }}
                  />
                </div>
                <div className="mb-3 flex gap-4 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                    Safe {formatTelemetryPercent(telemetryStats.avgSafeZonePresencePercent)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                    Hors zone {formatTelemetryPercent(telemetryStats.avgCircleDelayPercent)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Blue zone hits</p>
                    <p className="mt-0.5 text-sm font-bold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgBlueZoneHits)}
                      <span className="ml-1 text-[10px] font-normal text-gray-400">evt/m</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">First contact</p>
                    <p className="mt-0.5 text-sm font-bold text-gray-900">
                      Phase {formatTelemetryScore(telemetryStats.avgFirstContactPhase)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Retard cercle</p>
                    <p className="mt-0.5 text-sm font-bold text-gray-900">
                      {formatSeconds(telemetryStats.avgCircleDelaySeconds)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Positions obs.</p>
                    <p className="mt-0.5 text-sm font-bold text-gray-900">
                      {formatTelemetryScore(telemetryStats.avgPositionEvents)}
                      <span className="ml-1 text-[10px] font-normal text-gray-400">evt/m</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Mobilité + Survie ── */}
              <div className="grid divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">

                {/* Mobilité */}
                <div className="px-5 py-4">
                  <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                      <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
                      <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-5h2.038A2 2 0 0115 11.1V15h.95a2.5 2.5 0 014.9 0H20a1 1 0 001-1v-3.268A3 3 0 0019.142 8.5L17 7h-4a2 2 0 00-2 2v1H4V5a1 1 0 00-1-1H3z"/>
                    </svg>
                    Mobilité
                  </p>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="text-base leading-none">👣</span> À pied
                      </span>
                      <span className="text-xs font-semibold text-gray-900">{formatMeters(telemetryStats.avgOnFootDistanceMeters)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="text-base leading-none">🚗</span> Véhicule
                      </span>
                      <span className="text-xs font-semibold text-gray-900">{formatMeters(telemetryStats.avgVehicleDistanceMeters)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="text-base leading-none">⚡</span> Vitesse max
                      </span>
                      <span className="text-xs font-semibold text-gray-900">{formatTelemetrySpeedKph(telemetryStats.maxVehicleSpeedKph)} <span className="text-gray-400">km/h</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Montées / sorties</span>
                      <span className="text-xs font-semibold text-gray-900">
                        {formatTelemetryScore(telemetryStats.avgVehicleRideEvents)} / {formatTelemetryScore(telemetryStats.avgVehicleLeaveEvents)}
                        <span className="ml-1 text-gray-400">/m</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Survie */}
                <div className="px-5 py-4">
                  <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"/>
                    </svg>
                    Survie
                  </p>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="text-base leading-none">🩹</span> Soins
                      </span>
                      <span className="text-xs font-semibold text-gray-900">
                        {formatTelemetryScore(telemetryStats.avgHealsUsed)} <span className="text-gray-400">/m</span>
                        <span className="ml-2 text-gray-500">({formatTelemetryScore(telemetryStats.avgHealAmount)} HP)</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="text-base leading-none">💊</span> Boosts
                      </span>
                      <span className="text-xs font-semibold text-gray-900">{formatTelemetryScore(telemetryStats.avgBoostsUsed)} <span className="text-gray-400">/m</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="text-base leading-none">🎯</span> Dégâts reçus
                      </span>
                      <span className="text-xs font-semibold text-gray-900">{formatTelemetryScore(telemetryStats.avgDamageTaken)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-2.5">
                <p className="text-[11px] text-gray-400">{telemetryStats.matchesPlayed} matchs analysés sur la période</p>
              </div>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-600">Aucune donnée télémétry playstyle pour cette période.</p>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Header sombre */}
          <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-4">
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full border border-white/5" />
            <div className="pointer-events-none absolute right-10 -bottom-4 h-14 w-14 rounded-full border border-white/5" />
            <div className="pointer-events-none absolute -left-4 -bottom-4 h-16 w-16 rounded-full border border-white/5" />
            <h2 className="relative text-base font-bold tracking-wide text-white">Comparaison multi-périodes</h2>
            <p className="relative text-xs text-slate-400">Clique sur une colonne pour trier · Tendance S/M = semaine vs mois</p>
          </div>

          {loadingTelemetryComparison ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : telemetryComparisonError ? (
            <p className="px-5 py-5 text-sm text-amber-700">{telemetryComparisonError}</p>
          ) : (
            <>
              {/* ── Mini score cards ── */}
              <div className="border-b border-gray-100 px-5 py-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Scores de profil</p>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    {
                      label: 'Agressivité', color: '#ef4444',
                      bg: 'bg-red-50', textClass: 'text-red-700', borderClass: 'border-red-100',
                      getVal: (s: TelemetryPlaystyleStats) => s.aggressionScore,
                    },
                    {
                      label: 'Support', color: '#0ea5e9',
                      bg: 'bg-sky-50', textClass: 'text-sky-700', borderClass: 'border-sky-100',
                      getVal: (s: TelemetryPlaystyleStats) => s.supportScore,
                    },
                    {
                      label: 'Zone', color: '#10b981',
                      bg: 'bg-emerald-50', textClass: 'text-emerald-700', borderClass: 'border-emerald-100',
                      getVal: (s: TelemetryPlaystyleStats) => s.zoneDisciplineScore,
                    },
                  ] as const).map(({ label, color, bg, textClass, borderClass, getVal }) => {
                    const vals: Record<TelemetryComparisonPeriod, number | null> = {
                      week: telemetryComparison.week ? getVal(telemetryComparison.week) : null,
                      month: telemetryComparison.month ? getVal(telemetryComparison.month) : null,
                      all: telemetryComparison.all ? getVal(telemetryComparison.all) : null,
                    }
                    const maxVal = Math.max(...Object.values(vals).filter((v): v is number => v !== null), 0)
                    return (
                      <div key={label} className={`rounded-lg border ${borderClass} ${bg} p-2.5`}>
                        <p className={`mb-2 text-[10px] font-bold uppercase tracking-wide ${textClass}`}>{label}</p>
                        <div className="space-y-1.5">
                          {TELEMETRY_COMPARISON_PERIODS.map((period) => {
                            const val = vals[period]
                            const pct = maxVal > 0 && val !== null ? (val / maxVal) * 100 : 0
                            return (
                              <div key={period}>
                                <div className="mb-0.5 flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500">{TELEMETRY_COMPARISON_PERIOD_LABELS[period]}</span>
                                  <span className={`text-xs font-bold ${textClass}`}>
                                    {val !== null ? `${val.toFixed(0)}%` : 'N/D'}
                                  </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-white/70">
                                  <div
                                    className="h-1.5 rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%`, backgroundColor: color }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── Table avec sparkbars ── */}
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th scope="col" className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:w-44">
                        Métrique
                      </th>
                      {TELEMETRY_COMPARISON_PERIODS.map((period) => {
                        const isActive = telemetryComparisonSortKey === period
                        const arrow = isActive ? (telemetryComparisonSortDirection === 'desc' ? '↓' : '↑') : ''
                        return (
                          <th scope="col" key={period} className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => toggleTelemetryComparisonSort(period)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                                isActive
                                  ? 'bg-slate-900 text-white shadow-sm'
                                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                              }`}
                            >
                              {TELEMETRY_COMPARISON_PERIOD_LABELS[period]}
                              <span className="w-2 text-center">{arrow}</span>
                            </button>
                          </th>
                        )
                      })}
                      <th scope="col" className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        S/M
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {telemetryComparisonRows.map((row) => {
                      const rawVals = TELEMETRY_COMPARISON_PERIODS
                        .map((p) => row.values[p])
                        .filter((v): v is number => v !== null)
                      const maxVal = rawVals.length > 0 ? Math.max(...rawVals) : 0

                      const weekVal = row.values.week
                      const monthVal = row.values.month
                      let trend: 'up' | 'down' | 'same' | null = null
                      if (weekVal !== null && monthVal !== null && monthVal !== 0) {
                        const delta = (weekVal - monthVal) / monthVal
                        trend = Math.abs(delta) < 0.05 ? 'same' : delta > 0 ? 'up' : 'down'
                      }
                      const lowerIsBetter = ['avgBlueZoneHits', 'avgCircleDelaySeconds', 'avgCircleDelayPercent', 'avgDamageTaken'].includes(row.metric.key)
                      if (lowerIsBetter) {
                        if (trend === 'up') trend = 'down'
                        else if (trend === 'down') trend = 'up'
                      }

                      const scoreBarColors: Record<string, string> = {
                        aggressionScore: '#ef4444',
                        supportScore: '#0ea5e9',
                        zoneDisciplineScore: '#10b981',
                      }
                      const barColor = scoreBarColors[row.metric.key] ?? '#6366f1'
                      const isScoreRow = row.metric.key in scoreBarColors

                      return (
                        <tr
                          key={row.metric.key}
                          className={`transition-colors hover:bg-gray-50/70 ${isScoreRow ? 'bg-gray-50/40' : ''}`}
                        >
                          <th scope="row" className={`px-5 py-2.5 text-left text-xs ${isScoreRow ? 'font-bold text-gray-800' : 'font-medium text-gray-600'}`}>
                            {row.metric.label}
                          </th>
                          {TELEMETRY_COMPARISON_PERIODS.map((period) => {
                            const val = row.values[period]
                            const pct = maxVal > 0 && val !== null ? (val / maxVal) * 100 : 0
                            const isActive = telemetryComparisonSortKey === period
                            return (
                              <td
                                key={`${row.metric.key}:${period}`}
                                className={`px-3 py-2.5 ${isActive ? 'bg-slate-50/60' : ''}`}
                              >
                                <div
                                  className={`text-xs font-semibold ${isScoreRow ? 'font-bold' : 'text-gray-800'}`}
                                  style={{ color: isScoreRow ? barColor : undefined }}
                                >
                                  {val === null ? <span className="text-gray-300">N/D</span> : row.metric.format(val)}
                                </div>
                                {val !== null && maxVal > 0 && (
                                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
                                    <div
                                      className="h-1 rounded-full transition-all duration-500"
                                      style={{ width: `${pct}%`, backgroundColor: barColor, opacity: isScoreRow ? 1 : 0.6 }}
                                    />
                                  </div>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2.5 text-center">
                            {trend === 'up' && (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">↑</span>
                            )}
                            {trend === 'down' && (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[11px] font-bold text-red-600">↓</span>
                            )}
                            {trend === 'same' && (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[11px] text-gray-400">≈</span>
                            )}
                            {trend === null && <span className="text-gray-200 text-xs">–</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
