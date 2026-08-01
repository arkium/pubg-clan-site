'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import { usePlayerDashboard, usePlayerMatches } from '@/hooks/usePlayerDashboard'
import PlayerStats from '@/components/dashboard/PlayerStats'
import MatchHistory from '@/components/dashboard/MatchHistory'
import SquadFrequency from '@/components/dashboard/SquadFrequency'
import ProgressionChart from '@/components/dashboard/ProgressionChart'
import ComparisonRadar from '@/components/dashboard/ComparisonRadar'
import SegmentedControl from '@/components/ui/SegmentedControl'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import PlacementBadge from '@/components/ui/PlacementBadge'
import DropPressureStatsPanel from '@/components/dashboard/DropPressureStatsPanel'
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

type TelemetryComparisonData = Record<TelemetryComparisonPeriod, TelemetryPlaystyleStats | null>


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


const COMPARISON_PERIOD_OPTIONS: Array<{ value: TelemetryComparisonPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

function getReferencePeriod(period: TelemetryComparisonPeriod): TelemetryComparisonPeriod | null {
  if (period === 'week') return 'month'
  if (period === 'month') return 'all'
  return null
}

function computeTrend(
  current: number | null,
  reference: number | null,
  lowerIsBetter: boolean
): 'up' | 'down' | 'same' | null {
  if (current === null || reference === null || reference === 0) return null
  const delta = (current - reference) / reference
  if (Math.abs(delta) < 0.05) return 'same'
  return (lowerIsBetter ? delta < 0 : delta > 0) ? 'up' : 'down'
}

function TrendBadge({ trend }: { trend: 'up' | 'down' | 'same' | null }) {
  if (trend === 'up') {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">
        ↑
      </span>
    )
  }
  if (trend === 'down') {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-[11px] font-bold text-red-600">
        ↓
      </span>
    )
  }
  if (trend === 'same') {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] text-gray-400">
        ≈
      </span>
    )
  }
  return null
}

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
  const [selectedComparisonPeriod, setSelectedComparisonPeriod] =
    useState<TelemetryComparisonPeriod>('week')
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

  const {
    stats,
    clanAverage,
    progression,
    topPerformances,
    squads,
    mapLabels,
    dropPressure,
    dropPressureRanking,
  } = data

  const comparisonRefPeriod = getReferencePeriod(selectedComparisonPeriod)
  const comparisonCurrentStats = telemetryComparison[selectedComparisonPeriod]
  const comparisonRefStats = comparisonRefPeriod ? telemetryComparison[comparisonRefPeriod] : null

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
        </section>

        {/* Stats principales */}
        <PlayerStats
          stats={stats}
          clanAverage={clanAverage}
          period={period}
          onPeriodChange={setPeriod}
        />

        <DropPressureStatsPanel
          stats={dropPressure}
          href={`/members/${memberId}/drop-zones`}
          periodLabel={period === 'week' ? 'Semaine' : period === 'month' ? 'Mois' : 'Tous'}
          ranking={dropPressureRanking}
          currentMemberId={memberId}
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

                {/* Fragger */}
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
                  <p className="px-1 text-center text-[10px] leading-tight text-gray-400">kills · KO · dégâts</p>
                </div>

                {/* Medic */}
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
                  <p className="px-1 text-center text-[10px] leading-tight text-gray-400">revives · 0% = aucun revive</p>
                </div>

                {/* Ghost */}
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
                  <p className="px-1 text-center text-[10px] leading-tight text-gray-400">100% = jamais touché par la blue zone</p>
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
            <h2 className="relative text-base font-bold tracking-wide text-white">Évolution du playstyle</h2>
            <p className="relative text-xs text-slate-400">
              Sélectionnez une période — les tendances sont calculées vs la période précédente
            </p>
          </div>

          {loadingTelemetryComparison ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : telemetryComparisonError ? (
            <p className="px-5 py-5 text-sm text-amber-700">{telemetryComparisonError}</p>
          ) : (
            <>
              {/* ── Sélecteur de période ── */}
              <div className="border-b border-gray-100 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {TELEMETRY_COMPARISON_PERIOD_LABELS[selectedComparisonPeriod]}
                    </p>
                    <p className="text-xs text-gray-500">
                      {comparisonRefPeriod
                        ? `Tendances vs ${TELEMETRY_COMPARISON_PERIOD_LABELS[comparisonRefPeriod]}`
                        : 'Période de référence — aucune comparaison disponible'}
                    </p>
                  </div>
                  <SegmentedControl
                    options={COMPARISON_PERIOD_OPTIONS}
                    value={selectedComparisonPeriod}
                    onChange={setSelectedComparisonPeriod}
                    size="sm"
                  />
                </div>
              </div>

              {/* ── Scores de profil ── */}
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                {([
                  {
                    key: 'aggressionScore',
                    roleLabel: 'Fragger',
                    label: 'Agressivité',
                    hint: 'kills · KO · dégâts infligés',
                    color: '#ef4444',
                    getVal: (s: TelemetryPlaystyleStats) => s.aggressionScore,
                  },
                  {
                    key: 'supportScore',
                    roleLabel: 'Medic',
                    label: 'Support',
                    hint: 'revives uniquement · 0% = aucun revive',
                    color: '#0ea5e9',
                    getVal: (s: TelemetryPlaystyleStats) => s.supportScore,
                  },
                  {
                    key: 'zoneDisciplineScore',
                    roleLabel: 'Ghost',
                    label: 'Zone',
                    hint: '100% = jamais touché par la blue zone',
                    color: '#10b981',
                    getVal: (s: TelemetryPlaystyleStats) => s.zoneDisciplineScore,
                  },
                ] as const).map(({ key, roleLabel, label, hint, color, getVal }) => {
                  const val = comparisonCurrentStats ? getVal(comparisonCurrentStats) : null
                  const refVal = comparisonRefStats ? getVal(comparisonRefStats) : null
                  const trend = computeTrend(val, refVal, false)
                  const delta =
                    val !== null && refVal !== null
                      ? `${val > refVal ? '+' : ''}${(val - refVal).toFixed(0)}%`
                      : null
                  return (
                    <div key={key} className="flex flex-col gap-1 px-4 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
                        {roleLabel}
                      </p>
                      <div className="flex items-end justify-between gap-1">
                        <p className="text-2xl font-black tabular-nums" style={{ color }}>
                          {val !== null ? `${val.toFixed(0)}%` : '–'}
                        </p>
                        <TrendBadge trend={trend} />
                      </div>
                      <p className="text-xs font-medium text-gray-700">{label}</p>
                      <p className="text-[10px] leading-tight text-gray-400">{hint}</p>
                      {refVal !== null ? (
                        <p className="mt-0.5 text-[10px] text-gray-400">
                          ref: {refVal.toFixed(0)}%{delta && ` (${delta})`}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[10px] text-gray-300">—</p>
                      )}
                      {val !== null && (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-1 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, val)}%`, backgroundColor: color }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── Métriques groupées ── */}
              {comparisonCurrentStats === null ? (
                <p className="px-5 py-6 text-sm text-gray-500">
                  Aucune donnée pour la période &quot;{TELEMETRY_COMPARISON_PERIOD_LABELS[selectedComparisonPeriod]}&quot;.
                </p>
              ) : (
                <div className="p-4">
                  {(() => {
                    const footDist = comparisonCurrentStats.avgOnFootDistanceMeters
                    const vehDist = comparisonCurrentStats.avgVehicleDistanceMeters
                    const totalDist = footDist + vehDist
                    const footPct = totalDist > 0 ? (footDist / totalDist) * 100 : 0
                    const vehPct = totalDist > 0 ? (vehDist / totalDist) * 100 : 0
                    const totalKm = totalDist / 10 / 1000
                    const safe = comparisonCurrentStats.avgSafeZonePresencePercent
                    const outZone = comparisonCurrentStats.avgCircleDelayPercent
                    const healHP = comparisonCurrentStats.avgHealAmount
                    const dmgTaken = comparisonCurrentStats.avgDamageTaken
                    const healRatio = dmgTaken > 0 ? Math.min(100, (healHP / dmgTaken) * 100) : 0
                    return (
                      <div className="grid gap-4 sm:grid-cols-2">

                        {/* ── Profil de mobilité ── */}
                        <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                          <div className="mb-1 flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
                                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V9h2.038A2 2 0 0115 11.1V15h.95a2.5 2.5 0 014.9 0H20a1 1 0 001-1v-3.268A3 3 0 0019.142 8.5L17 7h-4a2 2 0 00-2 2v1H4V5a1 1 0 00-1-1H3z"/>
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900">Profil de mobilité</p>
                              <p className="text-xs text-gray-400">
                                Total {totalKm.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km sur ces matchs
                              </p>
                            </div>
                          </div>
                          <div className="my-3 flex h-3 overflow-hidden rounded-full bg-gray-200">
                            <div className="bg-blue-400 transition-all duration-500" style={{ width: `${footPct}%` }} />
                            <div className="bg-pink-400 transition-all duration-500" style={{ width: `${vehPct}%` }} />
                          </div>
                          <div className="mb-3 flex gap-3 text-[11px] text-gray-400">
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                              {footPct.toFixed(0)}% à pied
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block h-2 w-2 rounded-full bg-pink-400" />
                              {vehPct.toFixed(0)}% véhicule
                            </span>
                          </div>
                          <div className="space-y-2.5 border-t border-gray-100 pt-3">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-xs text-gray-600">
                                <span aria-hidden="true">👣</span> À pied
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">{formatMeters(footDist)}</span>
                                <TrendBadge trend={computeTrend(footDist, comparisonRefStats?.avgOnFootDistanceMeters ?? null, false)} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-xs text-gray-600">
                                <span aria-hidden="true">🚗</span> Véhicule
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">{formatMeters(vehDist)}</span>
                                <TrendBadge trend={computeTrend(vehDist, comparisonRefStats?.avgVehicleDistanceMeters ?? null, false)} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-xs text-gray-600">
                                <span aria-hidden="true">⚡</span> Vitesse max
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">
                                  {formatTelemetrySpeedKph(comparisonCurrentStats.maxVehicleSpeedKph)}{' '}
                                  <span className="text-xs font-normal text-gray-400">km/h</span>
                                </span>
                                <TrendBadge trend={computeTrend(comparisonCurrentStats.maxVehicleSpeedKph, comparisonRefStats?.maxVehicleSpeedKph ?? null, false)} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600">Montées / sorties</span>
                              <span className="text-sm font-bold text-gray-900">
                                {formatTelemetryScore(comparisonCurrentStats.avgVehicleRideEvents)} / {formatTelemetryScore(comparisonCurrentStats.avgVehicleLeaveEvents)}{' '}
                                <span className="text-xs font-normal text-gray-400">/m</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* ── Gestion du cercle ── */}
                        <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                          <div className="mb-1 flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900">Gestion du cercle</p>
                              <p className="text-xs text-gray-400">{safe.toFixed(0)}% du temps en zone sûre</p>
                            </div>
                          </div>
                          <div className="my-3 flex h-3 overflow-hidden rounded-full bg-gray-200">
                            <div className="bg-emerald-400 transition-all duration-500" style={{ width: `${Math.min(100, safe)}%` }} />
                            <div className="bg-red-400 transition-all duration-500" style={{ width: `${Math.min(100 - Math.min(100, safe), Math.max(0, outZone))}%` }} />
                          </div>
                          <div className="mb-3 flex gap-3 text-[11px] text-gray-400">
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                              Safe {safe.toFixed(0)}%
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                              Hors zone {outZone.toFixed(0)}%
                            </span>
                          </div>
                          <div className="space-y-2.5 border-t border-gray-100 pt-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600">Blue zone hits</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">
                                  {formatTelemetryScore(comparisonCurrentStats.avgBlueZoneHits)}{' '}
                                  <span className="text-xs font-normal text-gray-400">evt/m</span>
                                </span>
                                <TrendBadge trend={computeTrend(comparisonCurrentStats.avgBlueZoneHits, comparisonRefStats?.avgBlueZoneHits ?? null, true)} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600">First contact</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">Phase {formatTelemetryScore(comparisonCurrentStats.avgFirstContactPhase)}</span>
                                <TrendBadge trend={computeTrend(comparisonCurrentStats.avgFirstContactPhase, comparisonRefStats?.avgFirstContactPhase ?? null, false)} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600">Retard cercle</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">{formatSeconds(comparisonCurrentStats.avgCircleDelaySeconds)}</span>
                                <TrendBadge trend={computeTrend(comparisonCurrentStats.avgCircleDelaySeconds, comparisonRefStats?.avgCircleDelaySeconds ?? null, true)} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600">Hors zone</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">{formatTelemetryPercent(outZone)}</span>
                                <TrendBadge trend={computeTrend(outZone, comparisonRefStats?.avgCircleDelayPercent ?? null, true)} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── Survie & Soins ── */}
                        <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                          <div className="mb-1 flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-500">
                              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"/>
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900">Survie &amp; Soins</p>
                              <p className="text-xs text-gray-400">
                                {healHP.toFixed(0)} HP soignés · {dmgTaken.toFixed(0)} dmg reçus
                              </p>
                            </div>
                          </div>
                          <div className="my-3 flex h-3 overflow-hidden rounded-full bg-red-100">
                            <div className="bg-rose-400 transition-all duration-500" style={{ width: `${healRatio}%` }} />
                          </div>
                          <p className="mb-3 text-[11px] text-gray-400">
                            Soins couvrent {healRatio.toFixed(0)}% des dégâts reçus
                          </p>
                          <div className="space-y-2.5 border-t border-gray-100 pt-3">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-xs text-gray-600">
                                <span aria-hidden="true">🩹</span> Soins
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">
                                  {formatTelemetryScore(comparisonCurrentStats.avgHealsUsed)}{' '}
                                  <span className="text-xs font-normal text-gray-400">/m</span>
                                  <span className="ml-1.5 text-xs text-gray-500">({healHP.toFixed(0)} HP)</span>
                                </span>
                                <TrendBadge trend={computeTrend(comparisonCurrentStats.avgHealsUsed, comparisonRefStats?.avgHealsUsed ?? null, false)} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-xs text-gray-600">
                                <span aria-hidden="true">💊</span> Boosts
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">
                                  {formatTelemetryScore(comparisonCurrentStats.avgBoostsUsed)}{' '}
                                  <span className="text-xs font-normal text-gray-400">/m</span>
                                </span>
                                <TrendBadge trend={computeTrend(comparisonCurrentStats.avgBoostsUsed, comparisonRefStats?.avgBoostsUsed ?? null, false)} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-xs text-gray-600">
                                <span aria-hidden="true">🎯</span> Dégâts reçus
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900">{formatTelemetryScore(dmgTaken)}</span>
                                <TrendBadge trend={computeTrend(dmgTaken, comparisonRefStats?.avgDamageTaken ?? null, true)} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── Contexte ── */}
                        <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                          <div className="mb-3 flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900">Contexte</p>
                              <p className="text-xs text-gray-400">
                                {comparisonCurrentStats.matchesPlayed} matchs · période {TELEMETRY_COMPARISON_PERIOD_LABELS[selectedComparisonPeriod]}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600">Positions observées</span>
                              <span className="text-sm font-bold text-gray-900">
                                {formatTelemetryScore(comparisonCurrentStats.avgPositionEvents)}{' '}
                                <span className="text-xs font-normal text-gray-400">evt/m</span>
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600">Matchs analysés</span>
                              <span className="text-sm font-bold text-gray-900">
                                {formatTelemetryCount(comparisonCurrentStats.matchesPlayed)}
                              </span>
                            </div>
                          </div>
                        </div>

                      </div>
                    )
                  })()}
                </div>
              )}
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
