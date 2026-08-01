'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import SegmentedControl from '@/components/ui/SegmentedControl'
import DropPressureStatsPanel from '@/components/dashboard/DropPressureStatsPanel'
import { useClanOverview } from '@/hooks/useClanOverview'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { ClanMatchesResponse } from '@/types/squad-matches'
import type {
  DropPressureDashboardStats,
  DropPressureRankingEntry,
  DropPressureTimelinePoint,
} from '@/types/drop-pressure'

type DiffResult = {
  pubgClanId: string
  shard: string
  pubgMembersCount: number
  pubgMemberCountFromApi: number | null
  usedFallback: boolean
  incompleteRelationships: boolean
  matched: Array<{ accountId: string; pubgName: string | null; memberId: number; displayName: string }>
  inPubgOnly: Array<{ accountId: string; pubgName: string | null }>
  inSiteOnly: Array<{ memberId: number; displayName: string; pubgAccountId: string }>
  unverified: Array<{ memberId: number; displayName: string }>
}

type OverviewPeriod = 'week' | 'month' | 'all'

type TopPerformer = {
  memberId: number
  displayName: string
  value: number
  matchesPlayed: number
} | null

type OverviewTrackedSnapshot = {
  aggregated: {
    totalKills: number
    totalDamage: number
    totalAssists: number
    totalRevives: number
    matchesPlayed: number
    matchesWon: number
    winRate: number
  }
  topPerformers: {
    kills: TopPerformer
    damage: TopPerformer
    winRate: TopPerformer
    assists?: TopPerformer
    revives?: TopPerformer
    survival?: TopPerformer
  }
}

const OVERVIEW_PERIOD_OPTIONS: Array<{ value: OverviewPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function fmtNum(value: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(value))
}

function fmtPct(value: number) {
  return `${(value * 100).toFixed(1).replace('.', ',')} %`
}

function fmtRatio(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function fmtCompactK(value: number) {
  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(1)}B`
  }

  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(1)}M`
  }

  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(1)}K`
  }

  return fmtNum(absValue)
}

function fmtDate(value: string | Date | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtRelative(value: string | Date | null) {
  if (!value) return '—'
  const diffMs = Date.now() - new Date(value).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 2) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} jour${days > 1 ? 's' : ''}`
}

function getPeriodDateRangeLabel(period: Exclude<OverviewPeriod, 'all'>) {
  const now = new Date()

  if (period === 'week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    return `du ${fmtDate(monday)} au ${fmtDate(sunday)}`
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return `du ${fmtDate(start)} au ${fmtDate(end)}`
}

function periodTitle(period: OverviewPeriod) {
  if (period === 'week') return 'Semaine'
  if (period === 'month') return 'Mois'
  return 'Tous'
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ? 'text-amber-500' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}

function TopPerformerCard({
  label,
  performer,
  formatValue,
  valueUnit,
  tone,
  icon,
}: {
  label: string
  performer: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
  formatValue: (v: number) => string
  valueUnit?: string
  tone: 'danger' | 'warning' | 'info' | 'success' | 'primary' | 'neutral'
  icon: 'kills' | 'damage' | 'rate' | 'assists' | 'revives' | 'survival'
}) {
  const toneClasses = {
    danger: 'bg-rose-500/15 text-rose-400',
    warning: 'bg-amber-500/15 text-amber-400',
    info: 'bg-cyan-500/15 text-cyan-400',
    success: 'bg-emerald-500/15 text-emerald-400',
    primary: 'bg-blue-500/15 text-blue-400',
    neutral: 'bg-gray-500/15 text-gray-300',
  }

  const accentClasses = {
    danger: 'text-rose-400',
    warning: 'text-amber-400',
    info: 'text-cyan-400',
    success: 'text-emerald-400',
    primary: 'text-blue-400',
    neutral: 'text-gray-300',
  }

  return (
    <article className="app-panel-muted relative min-h-56 overflow-hidden rounded-2xl px-5 py-5 lg:min-h-44 lg:px-3 lg:py-3">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
      <div className="relative flex h-full flex-col">
        <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full lg:mb-3 lg:h-9 lg:w-9 ${toneClasses[tone]}`}>
          <TopPerformerIcon icon={icon} />
        </div>
        <p className="text-xs uppercase tracking-wide text-gray-500 lg:text-[10px]">{label}</p>
      {performer ? (
        <>
          <p
            className="mt-2 truncate text-2xl font-extrabold leading-tight text-gray-900 lg:text-xl"
            title={performer.displayName}
          >
            {performer.displayName}
          </p>
          <p className="mt-3 flex items-baseline gap-1.5 overflow-hidden tabular-nums text-4xl font-black leading-none lg:text-2xl">
            <span className={`shrink-0 ${accentClasses[tone]}`}>{formatValue(performer.value)}</span>
            {valueUnit && <span className="truncate text-3xl font-medium text-gray-500 lg:text-lg">{valueUnit}</span>}
          </p>
          <p className="mt-auto pt-3 text-sm text-gray-500 lg:text-xs">{performer.matchesPlayed} matchs</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-gray-500">—</p>
      )}
      </div>
    </article>
  )
}

function TopPerformerIcon({ icon }: { icon: 'kills' | 'damage' | 'rate' | 'assists' | 'revives' | 'survival' }) {
  if (icon === 'kills') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7l6 6" />
        <path d="M10 7L4 13" />
        <path d="M14 4l6 6" />
        <path d="M20 4l-6 6" />
      </svg>
    )
  }

  if (icon === 'damage') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    )
  }

  if (icon === 'assists') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
        <path d="M16 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M10.5 9.5l3 3" />
      </svg>
    )
  }

  if (icon === 'revives') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    )
  }

  if (icon === 'survival') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 19L19 5" />
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  )
}

type ClanKpiTone = 'danger' | 'warning' | 'success' | 'primary' | 'info' | 'neutral'
type ClanKpiIcon = 'kills' | 'wins' | 'damage' | 'rate' | 'average' | 'matches'

function ClanKpiCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone: ClanKpiTone
  icon: ClanKpiIcon
}) {
  const toneClasses: Record<ClanKpiTone, string> = {
    danger: 'bg-rose-500/15 text-rose-400',
    warning: 'bg-amber-500/15 text-amber-400',
    success: 'bg-emerald-500/15 text-emerald-400',
    primary: 'bg-blue-500/15 text-blue-400',
    info: 'bg-cyan-500/15 text-cyan-400',
    neutral: 'bg-gray-500/15 text-gray-300',
  }

  return (
    <article className="app-panel-muted relative overflow-hidden rounded-2xl px-4 py-3">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
      <div className="relative">
        <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
          <KpiIcon icon={icon} />
        </div>
        <p className="text-2xl font-black leading-none tabular-nums text-gray-900">{value}</p>
        <p className="mt-2 text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      </div>
    </article>
  )
}

function KpiIcon({ icon }: { icon: ClanKpiIcon }) {
  if (icon === 'kills') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11a3 3 0 1 1 6 0v2a3 3 0 0 1-6 0z" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
        <path d="M8 7V6a4 4 0 1 1 8 0v1" />
      </svg>
    )
  }

  if (icon === 'wins') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 4h8v3a4 4 0 0 1-8 0z" />
        <path d="M5 6h3a3 3 0 0 1-3 3z" />
        <path d="M19 6h-3a3 3 0 0 0 3 3z" />
        <path d="M12 14v4" />
        <path d="M9 21h6" />
      </svg>
    )
  }

  if (icon === 'damage') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 4v16" />
        <path d="M8 8h8" />
        <path d="M8 16h8" />
        <path d="M6 12h12" />
      </svg>
    )
  }

  if (icon === 'rate') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 19L19 5" />
        <circle cx="7" cy="7" r="2" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    )
  }

  if (icon === 'average') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="5" width="16" height="13" rx="2" />
      <path d="M9 18v2" />
      <path d="M15 18v2" />
    </svg>
  )
}

export default function ClanOverviewPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const { data, loading, error } = useClanOverview(clanId)
  const [selectedPeriod, setSelectedPeriod] = useState<OverviewPeriod>('all')
  const [periodSnapshot, setPeriodSnapshot] = useState<OverviewTrackedSnapshot | null>(null)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [periodError, setPeriodError] = useState('')
  const [dropPressure, setDropPressure] = useState<DropPressureDashboardStats | null>(null)
  const [dropPressureRanking, setDropPressureRanking] = useState<DropPressureRankingEntry[]>([])
  const [dropPressureTimeline, setDropPressureTimeline] = useState<DropPressureTimelinePoint[]>([])
  const [dropPressureLoading, setDropPressureLoading] = useState(false)
  const [dropPressureError, setDropPressureError] = useState('')

  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState('')

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  async function loadDiff() {
    if (!clanId || diffLoading) return
    try {
      setDiffLoading(true)
      setDiffError('')
      const response = await fetch(`/api/clans/${clanId}/pubg-diff`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Erreur lors du chargement du diff')
      setDiff(payload.diff as DiffResult)
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Erreur lors du chargement du diff')
    } finally {
      setDiffLoading(false)
    }
  }

  useEffect(() => {
    if (!clanId || selectedPeriod === 'all') {
      return
    }

    let cancelled = false

    async function fetchPeriodSnapshot() {
      try {
        setPeriodLoading(true)
        setPeriodError('')

        const response = await fetch(`/api/clans/${clanId}/matches?period=${selectedPeriod}`)
        const payload = (await response.json()) as ClanMatchesResponse | { error?: string }

        if (!response.ok) {
          throw new Error(payload && 'error' in payload ? payload.error ?? 'Erreur API' : 'Erreur API')
        }

        const matchesPayload = payload as ClanMatchesResponse
        const matchesWon = matchesPayload.squads.filter((match) => match.isWin).length
        const totalAssists = matchesPayload.squads.reduce((sum, match) => sum + match.totalAssists, 0)
        const totalRevives = matchesPayload.squads.reduce((sum, match) => sum + match.totalRevives, 0)

        const winRateByMember = new Map<
          number,
          { memberId: number; displayName: string; matchesPlayed: number; wins: number }
        >()

        const memberTotals = new Map<
          number,
          {
            memberId: number
            displayName: string
            matchesPlayed: number
            assists: number
            revives: number
            placementTotal: number
          }
        >()

        for (const match of matchesPayload.squads) {
          for (const member of match.members) {
            const current = winRateByMember.get(member.memberId) ?? {
              memberId: member.memberId,
              displayName: member.displayName,
              matchesPlayed: 0,
              wins: 0,
            }
            current.matchesPlayed += 1
            current.wins += match.isWin ? 1 : 0
            winRateByMember.set(member.memberId, current)

            const totals = memberTotals.get(member.memberId) ?? {
              memberId: member.memberId,
              displayName: member.displayName,
              matchesPlayed: 0,
              assists: 0,
              revives: 0,
              placementTotal: 0,
            }

            totals.matchesPlayed += 1
            totals.assists += member.assists
            totals.revives += member.revives
            totals.placementTotal += member.placement
            memberTotals.set(member.memberId, totals)
          }
        }

        const bestWinRate = Array.from(winRateByMember.values())
          .filter((row) => row.matchesPlayed > 0)
          .sort((left, right) => {
            const leftRate = left.wins / left.matchesPlayed
            const rightRate = right.wins / right.matchesPlayed
            if (rightRate !== leftRate) return rightRate - leftRate
            return right.matchesPlayed - left.matchesPlayed
          })[0]

        const topSupporter = Array.from(memberTotals.values())
          .sort((left, right) => {
            if (right.assists !== left.assists) return right.assists - left.assists
            return right.matchesPlayed - left.matchesPlayed
          })[0]

        const topMedic = Array.from(memberTotals.values())
          .sort((left, right) => {
            if (right.revives !== left.revives) return right.revives - left.revives
            return right.matchesPlayed - left.matchesPlayed
          })[0]

        const topSurvivor = Array.from(memberTotals.values())
          .filter((row) => row.matchesPlayed > 0)
          .sort((left, right) => {
            const leftAvgPlacement = left.placementTotal / left.matchesPlayed
            const rightAvgPlacement = right.placementTotal / right.matchesPlayed
            if (leftAvgPlacement !== rightAvgPlacement) return leftAvgPlacement - rightAvgPlacement
            return right.matchesPlayed - left.matchesPlayed
          })[0]

        if (!cancelled) {
          setPeriodSnapshot({
            aggregated: {
              totalKills: matchesPayload.stats.totalKills,
              totalDamage: matchesPayload.stats.totalDamage,
              totalAssists,
              totalRevives,
              matchesPlayed: matchesPayload.stats.matchCount,
              matchesWon,
              winRate: matchesPayload.stats.winRate,
            },
            topPerformers: {
              kills: matchesPayload.topPerformers.kills[0]
                ? {
                    memberId: matchesPayload.topPerformers.kills[0].memberId,
                    displayName: matchesPayload.topPerformers.kills[0].displayName,
                    value: matchesPayload.topPerformers.kills[0].totalKills,
                    matchesPlayed: matchesPayload.topPerformers.kills[0].matchesPlayed,
                  }
                : null,
              damage: matchesPayload.topPerformers.damage[0]
                ? {
                    memberId: matchesPayload.topPerformers.damage[0].memberId,
                    displayName: matchesPayload.topPerformers.damage[0].displayName,
                    value: matchesPayload.topPerformers.damage[0].totalDamage,
                    matchesPlayed: matchesPayload.topPerformers.damage[0].matchesPlayed,
                  }
                : null,
              winRate: bestWinRate
                ? {
                    memberId: bestWinRate.memberId,
                    displayName: bestWinRate.displayName,
                    value: bestWinRate.wins / bestWinRate.matchesPlayed,
                    matchesPlayed: bestWinRate.matchesPlayed,
                  }
                : null,
                assists: topSupporter
                  ? {
                      memberId: topSupporter.memberId,
                      displayName: topSupporter.displayName,
                      value: topSupporter.assists,
                      matchesPlayed: topSupporter.matchesPlayed,
                    }
                  : null,
                revives: topMedic
                  ? {
                      memberId: topMedic.memberId,
                      displayName: topMedic.displayName,
                      value: topMedic.revives,
                      matchesPlayed: topMedic.matchesPlayed,
                    }
                  : null,
                survival: topSurvivor
                  ? {
                      memberId: topSurvivor.memberId,
                      displayName: topSurvivor.displayName,
                      value: topSurvivor.placementTotal / topSurvivor.matchesPlayed,
                      matchesPlayed: topSurvivor.matchesPlayed,
                    }
                  : null,
            },
          })
        }
      } catch (err) {
        if (!cancelled) {
          setPeriodSnapshot(null)
          setPeriodError(err instanceof Error ? err.message : 'Erreur de chargement des statistiques')
        }
      } finally {
        if (!cancelled) {
          setPeriodLoading(false)
        }
      }
    }

    void fetchPeriodSnapshot()

    return () => {
      cancelled = true
    }
  }, [clanId, selectedPeriod])

  useEffect(() => {
    if (!clanId) return
    let cancelled = false

    async function loadDropPressure() {
      try {
        setDropPressureLoading(true)
        setDropPressureError('')
        const response = await fetch(
          `/api/clans/${clanId}/drop-pressure-stats?period=${selectedPeriod}`,
          { cache: 'no-store' }
        )
        const payload = (await response.json()) as {
          stats?: DropPressureDashboardStats
          ranking?: DropPressureRankingEntry[]
          timeline?: DropPressureTimelinePoint[]
          error?: string
        }
        if (!response.ok || !payload.stats) {
          throw new Error(payload.error ?? 'Impossible de charger la pression au drop')
        }
        if (!cancelled) {
          setDropPressure(payload.stats)
          setDropPressureRanking(payload.ranking ?? [])
          setDropPressureTimeline(payload.timeline ?? [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setDropPressure(null)
          setDropPressureRanking([])
          setDropPressureTimeline([])
          setDropPressureError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger la pression au drop'
          )
        }
      } finally {
        if (!cancelled) setDropPressureLoading(false)
      }
    }

    void loadDropPressure()
    return () => {
      cancelled = true
    }
  }, [clanId, selectedPeriod])

  if (!clanId) return null

  const clan = data?.clan
  const rawStats = data?.clanStats as Record<string, unknown> | null
  const pubg = rawStats?.pubg as {
    name: string
    tag: string
    clanId: string
    memberCount: number | null
  } | null
  const tracked = rawStats?.tracked as {
    membersCount: number
    aggregated: {
      totalKills: number
      totalDamage: number
      totalAssists: number
      totalRevives: number
      matchesPlayed: number
      matchesWon: number
      winRate: number
    }
    topPerformers: {
      kills: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
      damage: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
      winRate: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
      assists: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
      revives: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
      survival: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
    }
  } | null

  const activeTrackedSnapshot =
    selectedPeriod === 'all' ? tracked : periodSnapshot

  const activeTopPerformers =
    selectedPeriod === 'all'
      ? activeTrackedSnapshot?.topPerformers
      : periodSnapshot?.topPerformers ?? activeTrackedSnapshot?.topPerformers

  const activeAggregated = activeTrackedSnapshot?.aggregated
  const averageContribution =
    activeAggregated && activeAggregated.matchesPlayed > 0
      ? (activeAggregated.totalKills + activeAggregated.totalAssists) /
        activeAggregated.matchesPlayed
      : 0

  const analysisRangeLabel =
    selectedPeriod === 'all' ? 'historique complet' : getPeriodDateRangeLabel(selectedPeriod)

  const activeWindowLabel = selectedPeriod === 'all' ? 'Historique complet' : periodTitle(selectedPeriod)

  const memberCountGap =
    typeof pubg?.memberCount === 'number' && typeof tracked?.membersCount === 'number'
      ? tracked.membersCount - pubg.memberCount
      : null

  const trackedCoveragePct =
    typeof pubg?.memberCount === 'number' && pubg.memberCount > 0 && typeof tracked?.membersCount === 'number'
      ? Math.min(100, Math.round((tracked.membersCount / pubg.memberCount) * 100))
      : null

  return (
    <main className="app-container app-main">
      <header className="app-panel mb-6 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Vue d&apos;ensemble du clan</h1>
        <p className="text-sm text-gray-600">
          Données PUBG officielles, roster et comparaison des membres.
        </p>
      </header>

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}

      {error && (
        <div className="app-panel p-6 text-sm text-red-600">
          {error === 'Unauthorized'
            ? 'Vous n’avez pas la permission de voir cette page.'
            : error}
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Bloc 1 — Fiche PUBG officielle */}
          <section className="app-panel relative overflow-hidden">
            {!pubg ? (
              <div className="p-6">
                <h2 className="mb-2 text-base font-semibold text-gray-900">
                  Fiche PUBG officielle
                </h2>
                <p className="text-sm text-gray-500">
                  Aucune donnée PUBG — lancez une sync stats depuis les paramètres d&apos;abord.
                </p>
              </div>
            ) : (
              <>
                <img
                  src="/maps/pubg/Baltic_Main.webp"
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-[center_30%] opacity-70"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-black/85" />

                <div className="relative px-6 py-5">
                  {/* Identité du clan */}
                  <div className="mb-5">
                    <p className="mb-2 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                      PUBG Clan Profile
                    </p>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="rounded bg-amber-400 px-3 py-1 font-mono text-sm font-bold tracking-widest text-black">
                        [{pubg.tag}]
                      </span>
                      <span className="font-mono text-xs text-white/40">{pubg.clanId}</span>
                    </div>
                    <h2 className="text-4xl font-bold leading-tight text-white drop-shadow">
                      {pubg.name}
                    </h2>
                  </div>

                  {/* Badge sync */}
                  <div className="mt-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/60 backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      Sync {fmtRelative((rawStats?.syncedAt as string | undefined) ?? null)}
                    </span>
                  </div>

                  {/* Highlights type page hero */}
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                      <p className="text-xs uppercase tracking-wide text-white/60">Couverture roster</p>
                      <p className="mt-1 text-xl font-bold text-white">
                        {trackedCoveragePct === null ? '—' : `${trackedCoveragePct}%`}
                      </p>
                      <p className="text-xs text-white/60">
                        {tracked?.membersCount ?? '—'} / {pubg.memberCount ?? '—'} membres suivis
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                      <p className="text-xs uppercase tracking-wide text-white/60">Agrégats live</p>
                      <p className="mt-1 text-xl font-bold text-white">
                        {fmtCompactK(activeAggregated?.totalKills ?? 0)} kills
                      </p>
                      <p className="text-xs text-white/60">
                        {fmtCompactK(activeAggregated?.matchesWon ?? 0)} wins · {fmtRatio(averageContribution)} K+A moy.
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                      <p className="text-xs uppercase tracking-wide text-white/60">Fenêtre active</p>
                      <p className="mt-1 text-xl font-bold text-white">{activeWindowLabel}</p>
                      <p className="text-xs text-white/60">
                        {fmtNum(activeAggregated?.matchesPlayed ?? 0)} matchs analysés
                      </p>
                    </div>
                  </div>

                </div>
              </>
            )}
          </section>

          {/* Bloc 2 — Agrégats all-time */}
          {tracked && (
            <section className="app-panel relative overflow-hidden p-6">
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-500/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-emerald-500/10 blur-2xl" />

              <div className="relative mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Statistiques clan{' '}
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-sm font-semibold text-gray-700">
                      {tracked.membersCount} membres trackés
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Période: <span className="font-semibold text-gray-900">{periodTitle(selectedPeriod)}</span>
                    {' · '}Analyse {analysisRangeLabel}
                    {' · '}
                    <span className="font-semibold text-gray-900">
                      {fmtNum(activeTrackedSnapshot?.aggregated.matchesPlayed ?? 0)} matchs
                    </span>
                  </p>
                </div>

                <SegmentedControl
                  options={OVERVIEW_PERIOD_OPTIONS}
                  value={selectedPeriod}
                  onChange={setSelectedPeriod}
                  size="sm"
                  fullWidthOnMobile
                  className="shrink-0"
                />
              </div>

              {periodError && (
                <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {periodError}
                </div>
              )}

              {periodLoading && selectedPeriod !== 'all' && (
                <p className="mb-4 text-sm text-gray-500">Chargement des statistiques de période...</p>
              )}

              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                {[
                  {
                    label: 'Total kills',
                    value: fmtCompactK(activeAggregated?.totalKills ?? 0),
                    tone: 'danger' as const,
                    icon: 'kills' as const,
                  },
                  {
                    label: 'Total wins',
                    value: fmtCompactK(activeAggregated?.matchesWon ?? 0),
                    tone: 'warning' as const,
                    icon: 'wins' as const,
                  },
                  {
                    label: 'Total damage',
                    value: fmtCompactK(activeAggregated?.totalDamage ?? 0),
                    tone: 'success' as const,
                    icon: 'damage' as const,
                  },
                  {
                    label: 'Win rate',
                    value: fmtPct(activeAggregated?.winRate ?? 0),
                    tone: 'primary' as const,
                    icon: 'rate' as const,
                  },
                  {
                    label: 'Moy. K+A',
                    value: fmtRatio(averageContribution),
                    tone: 'info' as const,
                    icon: 'average' as const,
                  },
                  {
                    label: 'Matches played',
                    value: fmtCompactK(activeAggregated?.matchesPlayed ?? 0),
                    tone: 'neutral' as const,
                    icon: 'matches' as const,
                  },
                ].map((item) => (
                  <ClanKpiCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    tone={item.tone}
                    icon={item.icon}
                  />
                ))}
              </div>

              <h3 className="mb-3 text-sm font-semibold text-gray-700">Top performers</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <TopPerformerCard
                  label="Top Fragger"
                  performer={activeTopPerformers?.kills ?? null}
                  formatValue={(v) => fmtCompactK(v)}
                  valueUnit="kills"
                  tone="danger"
                  icon="kills"
                />
                <TopPerformerCard
                  label="Damage Machine"
                  performer={activeTopPerformers?.damage ?? null}
                  formatValue={(v) => fmtCompactK(v)}
                  valueUnit="dégâts"
                  tone="warning"
                  icon="damage"
                />
                <TopPerformerCard
                  label="The Champion"
                  performer={activeTopPerformers?.winRate ?? null}
                  formatValue={fmtPct}
                  tone="info"
                  icon="rate"
                />
                <TopPerformerCard
                  label="Top Supporter"
                  performer={activeTopPerformers?.assists ?? null}
                  formatValue={(v) => fmtCompactK(v)}
                  valueUnit="assists"
                  tone="primary"
                  icon="assists"
                />
                <TopPerformerCard
                  label="Top Medic"
                  performer={activeTopPerformers?.revives ?? null}
                  formatValue={(v) => fmtCompactK(v)}
                  valueUnit="revives"
                  tone="success"
                  icon="revives"
                />
                <TopPerformerCard
                  label="Top Survivor"
                  performer={activeTopPerformers?.survival ?? null}
                  formatValue={(v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v)}
                  valueUnit="place moy."
                  tone="neutral"
                  icon="survival"
                />
              </div>
            </section>
          )}

          <DropPressureStatsPanel
            stats={dropPressure}
            loading={dropPressureLoading}
            error={dropPressureError}
            href={`/clans/${clanId}/drop-zones`}
            periodLabel={periodTitle(selectedPeriod)}
            ranking={dropPressureRanking}
            timeline={dropPressureTimeline}
          />

          {/* Bloc 3 — Diff PUBG vs site */}
          <section className="app-panel p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Comparaison PUBG vs site</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Rapprochement entre les membres du clan PUBG officiel et ceux trackés sur le site.
                </p>
              </div>
              {!diff && clan?.pubgClanId && (
                <button
                  onClick={loadDiff}
                  disabled={diffLoading}
                  className="app-btn app-btn--md app-btn--secondary"
                >
                  {diffLoading ? 'Chargement…' : 'Comparer'}
                </button>
              )}
            </div>

            {!clan?.pubgClanId && (
              <p className="text-sm text-gray-500">
                Le clan n&apos;a pas encore de PUBG Clan ID — sync stats d&apos;abord.
              </p>
            )}

            {diffError && <p className="text-sm text-rose-600">{diffError}</p>}

            {diff && (
              <div className="space-y-5">
                {/* Résumé en chips */}
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-gray-700">
                    <span className="h-2 w-2 rounded-full bg-gray-400" />
                    {diff.pubgMemberCountFromApi ?? diff.pubgMembersCount} dans le clan PUBG
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-gray-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {diff.matched.length} trackés et confirmés
                  </span>
                  {!diff.incompleteRelationships && diff.inSiteOnly.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-rose-600">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      {diff.inSiteOnly.length} ont quitté le clan PUBG
                    </span>
                  )}
                  {diff.inPubgOnly.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-amber-600">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      {diff.inPubgOnly.length} dans PUBG, absents du site
                    </span>
                  )}
                  {diff.unverified.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-gray-500">
                      <span className="h-2 w-2 rounded-full bg-gray-400" />
                      {diff.unverified.length} compte PUBG non vérifié
                    </span>
                  )}
                  {diff.incompleteRelationships && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-gray-500"
                      title={`L'API PUBG indique ${diff.pubgMemberCountFromApi} membres mais ne fournit que ${diff.pubgMembersCount} IDs via relationships — comparaison partielle, départs non fiables`}
                    >
                      données partielles ({diff.pubgMembersCount}/{diff.pubgMemberCountFromApi} IDs)
                    </span>
                  )}
                </div>

                {/* Avertissement données partielles */}
                {diff.incompleteRelationships && (
                  <p className="text-xs text-gray-500">
                    L&apos;API PUBG indique {diff.pubgMemberCountFromApi} membres dans le clan mais
                    ne fournit que {diff.pubgMembersCount} identifiants via ses données de
                    relationship. La liste des départs ne peut pas être établie de manière fiable.
                  </p>
                )}

                {/* Ont quitté le clan PUBG — action requise */}
                {!diff.incompleteRelationships && diff.inSiteOnly.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
                      Ont quitté le clan PUBG ({diff.inSiteOnly.length}) — à archiver
                    </p>
                    <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                      {diff.inSiteOnly.map((m) => (
                        <div key={m.memberId} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                          <span className="flex-1 text-sm font-medium text-gray-900">
                            {m.displayName}
                          </span>
                          <span className="text-xs text-gray-500">{m.pubgAccountId}</span>
                          <Link
                            href={`/clans/${clanId}/settings/members`}
                            className="text-xs text-gray-500 underline hover:text-gray-700"
                          >
                            Gérer →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dans PUBG mais absents du site */}
                {diff.inPubgOnly.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                      Dans le clan PUBG mais non trackés ({diff.inPubgOnly.length}) — à ajouter
                    </p>
                    <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                      {diff.inPubgOnly.map((m) => (
                        <div key={m.accountId} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                          <span className="flex-1 text-sm font-medium text-gray-900">
                            {m.pubgName ?? m.accountId}
                          </span>
                          <span className="font-mono text-xs text-gray-500">{m.accountId}</span>
                          <Link
                            href={`/clans/${clanId}/settings/members`}
                            className="text-xs text-gray-500 underline hover:text-gray-700"
                          >
                            Ajouter →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Compte PUBG non vérifié */}
                {diff.unverified.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Compte PUBG non vérifié ({diff.unverified.length})
                    </p>
                    <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                      {diff.unverified.map((m) => (
                        <div key={m.memberId} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-gray-400" />
                          <span className="flex-1 text-sm text-gray-700">{m.displayName}</span>
                          <span className="text-xs text-gray-500">Aucun pubgAccountId</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Correspondances confirmées */}
                {diff.matched.length > 0 && (
                  <details className="group">
                    <summary className="mb-2 cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700">
                      Membres confirmés ({diff.matched.length})
                      <span className="ml-1 text-gray-400 group-open:hidden">▸ afficher</span>
                      <span className="ml-1 text-gray-400 hidden group-open:inline">▾ masquer</span>
                    </summary>
                    <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                      {diff.matched.map((m) => (
                        <div key={m.accountId} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                          <span className="flex-1 text-sm text-gray-700">{m.displayName}</span>
                          <span className="text-xs text-gray-500">{m.pubgName ?? m.accountId}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>

          {/* Bloc 4 — Roster membres actifs */}
          <section className="app-panel p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Membres actifs ({data.roster.length})
            </h2>

            <div className="app-table-shell overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="app-table-head">
                  <tr>
                    {['Membre', 'Rôle', 'Depuis', 'Compte site', 'Lien PUBG', 'Dernière sync'].map(
                      (col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 last:pr-0"
                        >
                          {col}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.roster.map((member) => (
                    <tr key={member.id} className="app-table-row">
                      <td className="px-3 py-2">
                        <Link
                          href={`/members/${member.id}`}
                          className="font-medium text-gray-900 hover:underline"
                        >
                          {member.displayName}
                        </Link>
                        {member.pubgPlayerName !== member.displayName && (
                          <p className="text-xs text-gray-400">{member.pubgPlayerName}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{member.role}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                        {fmtDate(member.joinedAt)}
                      </td>
                      <td className="px-3 py-2">
                        {member.hasAccount ? (
                          <span className="font-medium text-green-700">✓ Oui</span>
                        ) : (
                          <span className="text-gray-400">Non</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {member.pubgAccountId ? (
                          <span className="font-medium text-green-700">✓ Vérifié</span>
                        ) : (
                          <span className="text-gray-400">En attente</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                        {fmtRelative(member.lastRefreshedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
