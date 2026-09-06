'use client'

/* eslint-disable @next/next/no-img-element */

import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, UsersRound } from 'lucide-react'
import { getNavIcon } from '@/lib/nav-icons'
import { useSectionNavItems } from '@/hooks/useSectionNavItems'
import SegmentedControl from '@/components/ui/SegmentedControl'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { Skeleton } from '@/components/ui/Skeleton'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import DropPressureStatsPanel from '@/components/dashboard/DropPressureStatsPanel'
import TopPerformers from '@/components/TopPerformers'
import SquadSynergies from '@/components/SquadSynergies'
import { useClanOverview } from '@/hooks/useClanOverview'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useClanMatchesCache } from '@/hooks/useClanMatchesCache'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import type { ClanMatchTypeFilter, ClanTeamModeFilter, SquadPeriod } from '@/types/squad-matches'
import type {
  DropPressureDashboardStats,
  DropPressureRankingEntry,
  DropPressureTimelinePoint,
} from '@/types/drop-pressure'



const OVERVIEW_PERIOD_OPTIONS: Array<{ value: SquadPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

const MATCH_TYPE_OPTIONS: Array<{ value: ClanMatchTypeFilter; label: string }> = [
  { value: 'official', label: 'Officiel' },
  { value: 'casual', label: 'Casual' },
  { value: 'custom', label: 'Custom' },
  { value: 'all', label: 'Tous' },
]

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function getRoleBadgeClass(roleName: string) {
  const normalizedRole = roleName.trim().toLowerCase()

  if (normalizedRole === 'owner') return 'member-role-badge member-role-badge--owner'
  if (normalizedRole === 'admin') return 'member-role-badge member-role-badge--admin'
  if (normalizedRole === 'moderator') return 'member-role-badge member-role-badge--moderator'
  if (normalizedRole === 'member') return 'member-role-badge member-role-badge--member'
  return 'member-role-badge member-role-badge--default'
}

function getAvatarInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??'
}

function MemberAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string
  avatarUrl: string | null
  className: string
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-500/20 bg-blue-500/10 text-xs font-bold text-blue-500 ${className}`}
    >
      <span aria-hidden="true">{getAvatarInitials(name)}</span>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={`Avatar de ${name}`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
    </div>
  )
}

function MedalCounts({ gold, silver, bronze }: { gold: number; silver: number; bronze: number }) {
  const medals = [
    { label: 'Or', count: gold, src: '/icons/medal-gold.svg' },
    { label: 'Argent', count: silver, src: '/icons/medal-silver.svg' },
    { label: 'Bronze', count: bronze, src: '/icons/medal-bronze.svg' },
  ]

  return (
    <div className="flex items-center justify-end gap-2">
      {medals.map((medal) => (
        <span
          key={medal.label}
          className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-gray-700"
          title={`${medal.count} médaille${medal.count > 1 ? 's' : ''} ${medal.label.toLowerCase()}`}
        >
          <Image src={medal.src} alt={`Médaille ${medal.label.toLowerCase()}`} width={16} height={16} />
          {medal.count}
        </span>
      ))}
    </div>
  )
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

function getPeriodDateRangeLabel(period: Exclude<SquadPeriod, 'all'>) {
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

function periodTitle(period: SquadPeriod) {
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
    <article className="app-panel-muted relative overflow-hidden rounded-2xl px-4 py-3">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
      <div className="relative">
        <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
          <TopPerformerIcon icon={icon} />
        </div>
        <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      {performer ? (
        <>
          <p
            className="mt-1 truncate text-sm font-semibold text-gray-900"
            title={performer.displayName}
          >
            <Link
              href={`/members/${performer.memberId}/dashboard`}
              className="transition-colors hover:text-emerald-500"
            >
              {performer.displayName}
            </Link>
          </p>
          <p className="mt-1 flex items-baseline gap-1 overflow-hidden tabular-nums">
            <span className={`text-2xl font-black leading-none ${accentClasses[tone]}`}>{formatValue(performer.value)}</span>
            {valueUnit && <span className="truncate text-xs font-medium text-gray-500">{valueUnit}</span>}
          </p>
          <p className="mt-2 text-[11px] text-gray-500">{performer.matchesPlayed} matchs</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-gray-500">—</p>
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
  const [selectedPeriod, setSelectedPeriod] = useState<SquadPeriod>('week')
  const [selectedMatchType, setSelectedMatchType] = useState<ClanMatchTypeFilter>('official')
  const [selectedMode, setSelectedMode] = useState<ClanTeamModeFilter>('all')

  const { data: cacheData, loading: cacheLoading, error: cacheError } = useClanMatchesCache(
    clanId,
    selectedPeriod,
    selectedMatchType
  )
  const clanNavItems = useSectionNavItems('clan-section', clanId, null)
    .filter(item => item.navKey !== 'clan.overview')
  const [dropPressure, setDropPressure] = useState<DropPressureDashboardStats | null>(null)
  const [dropPressureRanking, setDropPressureRanking] = useState<DropPressureRankingEntry[]>([])
  const [dropPressureTimeline, setDropPressureTimeline] = useState<DropPressureTimelinePoint[]>([])
  const [dropPressureLoading, setDropPressureLoading] = useState(false)
  const [dropPressureError, setDropPressureError] = useState('')



  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])





  useEffect(() => {
    if (!clanId) return
    let cancelled = false

    async function loadDropPressure() {
      try {
        setDropPressureLoading(true)
        setDropPressureError('')
        const response = await fetch(
          `/api/clans/${clanId}/drop-pressure-stats?period=${selectedPeriod}&matchType=${selectedMatchType}&mode=${selectedMode}`,
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
  }, [clanId, selectedPeriod, selectedMatchType, selectedMode])

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



  const performanceRoster = useMemo(() => {
    if (!data?.roster) return []
    const rosterStatsForMode = cacheData?.payload.byMode[selectedMode]?.rosterStats
    return data.roster
      .map((member) => {
        const stats = rosterStatsForMode?.find((s) => s.memberId === member.id)
        return {
          ...member,
          stats: stats ?? {
            matchesPlayed: 0,
            totalKills: 0,
            totalAssists: 0,
            totalDamage: 0,
            wins: 0,
          },
        }
      })
      .sort((a, b) => {
        if (b.stats.matchesPlayed !== a.stats.matchesPlayed) {
          return b.stats.matchesPlayed - a.stats.matchesPlayed
        }
        return b.stats.totalKills - a.stats.totalKills
      })
  }, [data?.roster, cacheData?.payload.byMode, selectedMode])

  const maxRosterMatches = performanceRoster[0]?.stats.matchesPlayed ?? 0

  const memberCountGap =
    typeof pubg?.memberCount === 'number' && typeof tracked?.membersCount === 'number'
      ? tracked.membersCount - pubg.memberCount
      : null

  const trackedCoveragePct =
    typeof pubg?.memberCount === 'number' && pubg.memberCount > 0 && typeof tracked?.membersCount === 'number'
      ? Math.min(100, Math.round((tracked.membersCount / pubg.memberCount) * 100))
      : null

  return (
    <>
    <div className="app-container app-main pb-0">
      <NavigationTrail
        currentLabel="Vue d'ensemble"
        currentHref={`/clans/${clanId}/overview`}
        fallbackParent={{ href: '/clans', label: 'Liste des clans' }}
      />

      {loading && <CardSkeleton />}

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
          <header className="app-panel relative overflow-hidden mb-6">
            {!pubg ? (
              <div className="p-6">
                <h1 className="mb-2 text-base font-semibold text-gray-900">
                  Vue d&apos;ensemble du clan
                </h1>
                <p className="text-sm text-gray-500">
                  Aucune donnée PUBG — lancez une sync stats depuis les paramètres d&apos;abord.
                </p>
              </div>
            ) : (
              <>
                <img
                  src={clan?.imageUrl || "/maps/pubg/Baltic_Main.webp"}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-[center_30%]"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/20 to-slate-900/80" />

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
                    <h1 className="text-4xl font-bold leading-tight text-white drop-shadow">
                      {pubg.name}
                    </h1>
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
                        {fmtCompactK(cacheData?.payload.globalStats.totalKills ?? 0)} kills
                      </p>
                      <p className="text-xs text-white/60">
                        {fmtCompactK(cacheData?.payload.globalStats.wins ?? 0)} wins · {fmtPct(cacheData?.payload.globalStats.winRate ?? 0)} WR
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                      <p className="text-xs uppercase tracking-wide text-white/60">Fenêtre active</p>
                      <p className="mt-1 text-xl font-bold text-white">{selectedPeriod === 'all' ? 'Historique complet' : periodTitle(selectedPeriod)}</p>
                      <p className="text-xs text-white/60">
                        {fmtNum(cacheData?.payload.globalStats.matchCount ?? 0)} matchs analysés
                      </p>
                    </div>
                  </div>

                </div>
              </>
            )}
          </header>

          {clanNavItems.length > 0 && (
            <section className="app-panel p-6 mb-6">
              <h2 className="mb-4 text-lg font-bold text-gray-900">Navigation du Clan</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {clanNavItems.map((item) => {
                  const { icon: IconComponent, colorClass } = getNavIcon(item.navKey)
                  return (
                    <Link
                      key={item.navKey}
                      href={item.href}
                      className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <IconComponent className={`w-6 h-6 mb-2 ${colorClass}`} />
                      <span className="text-sm font-semibold text-gray-900 text-center">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>

    {/* Bandeau de filtres (période + type de match + mode d'équipe) — filtre toutes les stats de la page.
        Rendu via DockingToolbar pour occuper toute la largeur une fois collé au header. */}
    {!loading && !error && data && (
      <DockingToolbar variant="panel" maxWidthClass="app-container">
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
              {tracked?.membersCount ?? 0} membres trackés
            </span>
            {cacheData?.computedAt && (
              <span>Données mises à jour le {new Date(cacheData.computedAt).toLocaleString('fr-FR')}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              options={OVERVIEW_PERIOD_OPTIONS}
              value={selectedPeriod}
              onChange={setSelectedPeriod as any}
              size="sm"
              className="shrink-0"
            />
            <SegmentedControl
              options={MATCH_TYPE_OPTIONS}
              value={selectedMatchType}
              onChange={setSelectedMatchType as any}
              size="sm"
              className="shrink-0"
            />
            <SegmentedControl
              options={[
                { value: 'all', label: 'Tous' },
                { value: 'duo', label: 'Duo' },
                { value: 'trio', label: 'Trio' },
                { value: 'squad', label: 'Squad' },
              ]}
              value={selectedMode}
              onChange={setSelectedMode as any}
              size="sm"
              className="shrink-0"
            />
          </div>
        </div>
      </DockingToolbar>
    )}

    <div className="app-container app-main pt-0">
      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Bloc 2 — Statistiques et Analyses */}
          <section className="app-panel relative overflow-hidden p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-500/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-emerald-500/10 blur-2xl" />

            <div className="relative mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Statistiques clan</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Analyse basée sur les matchs de la période sélectionnée.
                </p>
              </div>
            </div>

            {cacheError && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {cacheError}
              </div>
            )}

            {cacheLoading && (
              <div className="space-y-3">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}

            {!cacheLoading && cacheData && (
              <>
                {(() => {
                  const modePerformanceEntry =
                    selectedMode === 'all'
                      ? null
                      : cacheData.payload.modePerformance.find((mp) => mp.mode === selectedMode) ?? null

                  const displayedGlobalStats = modePerformanceEntry
                    ? {
                        totalKills: modePerformanceEntry.kills,
                        totalDamage: modePerformanceEntry.damage,
                        totalAssists: modePerformanceEntry.assists,
                        wins: modePerformanceEntry.wins,
                        matchCount: modePerformanceEntry.matches,
                        winRate:
                          modePerformanceEntry.matches > 0
                            ? modePerformanceEntry.wins / modePerformanceEntry.matches
                            : 0,
                      }
                    : cacheData.payload.globalStats

                  return (
                    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                      {[
                        {
                          label: 'Total kills',
                          value: fmtCompactK(displayedGlobalStats.totalKills),
                          tone: 'danger' as const,
                          icon: 'kills' as const,
                        },
                        {
                          label: 'Total wins',
                          value: fmtCompactK(displayedGlobalStats.wins),
                          tone: 'warning' as const,
                          icon: 'wins' as const,
                        },
                        {
                          label: 'Total damage',
                          value: fmtCompactK(displayedGlobalStats.totalDamage),
                          tone: 'success' as const,
                          icon: 'damage' as const,
                        },
                        {
                          label: 'Win rate',
                          value: fmtPct(displayedGlobalStats.winRate),
                          tone: 'primary' as const,
                          icon: 'rate' as const,
                        },
                        {
                          label: 'Moy. K+A',
                          value: fmtRatio(
                            displayedGlobalStats.matchCount > 0
                              ? (displayedGlobalStats.totalKills + displayedGlobalStats.totalAssists) /
                                  displayedGlobalStats.matchCount
                              : 0
                          ),
                          tone: 'info' as const,
                          icon: 'average' as const,
                        },
                        {
                          label: 'Matches played',
                          value: fmtCompactK(displayedGlobalStats.matchCount),
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
                  )
                })()}

                <div className="mb-8">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700">Performances par mode</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    {cacheData.payload.modePerformance
                      .filter((mp) => selectedMode === 'all' || mp.mode === selectedMode)
                      .map((mp) => (
                      <article key={mp.mode} className="app-panel overflow-hidden">
                        <header 
                          className="relative border-b border-[var(--theme-ui-border)] h-28 bg-cover bg-center bg-no-repeat"
                          style={{ backgroundImage: `url('/${mp.mode}.jpg')` }}
                        >
                          <div className="absolute bottom-3 left-3">
                            <TeamModeBadge mode={mp.mode as any} size="sm" />
                          </div>
                        </header>
                        <div className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{fmtPct(mp.matches > 0 ? mp.wins / mp.matches : 0)} WR</p>
                            <p className="text-xs text-gray-500">{mp.matches} matchs</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900">{fmtCompactK(mp.kills)}</p>
                            <p className="text-xs text-gray-500">kills</p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700">Awards du mode</h3>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                    <TopPerformerCard
                      label="Top Fragger"
                      performer={
                        cacheData.payload.byMode[selectedMode].topPerformers.kills[0]
                          ? {
                              memberId: cacheData.payload.byMode[selectedMode].topPerformers.kills[0].memberId,
                              displayName: cacheData.payload.byMode[selectedMode].topPerformers.kills[0].displayName,
                              value: cacheData.payload.byMode[selectedMode].topPerformers.kills[0].totalKills,
                              matchesPlayed: cacheData.payload.byMode[selectedMode].topPerformers.kills[0].matchesPlayed,
                            }
                          : null
                      }
                      formatValue={(v) => fmtCompactK(v)}
                      valueUnit="kills"
                      tone="danger"
                      icon="kills"
                    />
                    <TopPerformerCard
                      label="Damage Machine"
                      performer={
                        cacheData.payload.byMode[selectedMode].topPerformers.damage[0]
                          ? {
                              memberId: cacheData.payload.byMode[selectedMode].topPerformers.damage[0].memberId,
                              displayName: cacheData.payload.byMode[selectedMode].topPerformers.damage[0].displayName,
                              value: cacheData.payload.byMode[selectedMode].topPerformers.damage[0].totalDamage,
                              matchesPlayed: cacheData.payload.byMode[selectedMode].topPerformers.damage[0].matchesPlayed,
                            }
                          : null
                      }
                      formatValue={(v) => fmtCompactK(v)}
                      valueUnit="dégâts"
                      tone="warning"
                      icon="damage"
                    />
                    <TopPerformerCard
                      label="The Champion"
                      performer={
                        cacheData.payload.byMode[selectedMode].topPerformers.winRate[0]
                          ? {
                              memberId: cacheData.payload.byMode[selectedMode].topPerformers.winRate[0].memberId,
                              displayName: cacheData.payload.byMode[selectedMode].topPerformers.winRate[0].displayName,
                              value: cacheData.payload.byMode[selectedMode].topPerformers.winRate[0].winRate,
                              matchesPlayed: cacheData.payload.byMode[selectedMode].topPerformers.winRate[0].matchesPlayed,
                            }
                          : null
                      }
                      formatValue={fmtPct}
                      tone="info"
                      icon="rate"
                    />
                    <TopPerformerCard
                      label="Top Supporter"
                      performer={
                        cacheData.payload.byMode[selectedMode].topPerformers.assists[0]
                          ? {
                              memberId: cacheData.payload.byMode[selectedMode].topPerformers.assists[0].memberId,
                              displayName: cacheData.payload.byMode[selectedMode].topPerformers.assists[0].displayName,
                              value: cacheData.payload.byMode[selectedMode].topPerformers.assists[0].totalAssists,
                              matchesPlayed: cacheData.payload.byMode[selectedMode].topPerformers.assists[0].matchesPlayed,
                            }
                          : null
                      }
                      formatValue={(v) => fmtCompactK(v)}
                      valueUnit="assists"
                      tone="primary"
                      icon="assists"
                    />
                    <TopPerformerCard
                      label="Top Medic"
                      performer={
                        cacheData.payload.byMode[selectedMode].topPerformers.revives[0]
                          ? {
                              memberId: cacheData.payload.byMode[selectedMode].topPerformers.revives[0].memberId,
                              displayName: cacheData.payload.byMode[selectedMode].topPerformers.revives[0].displayName,
                              value: cacheData.payload.byMode[selectedMode].topPerformers.revives[0].totalRevives,
                              matchesPlayed: cacheData.payload.byMode[selectedMode].topPerformers.revives[0].matchesPlayed,
                            }
                          : null
                      }
                      formatValue={(v) => fmtCompactK(v)}
                      valueUnit="revives"
                      tone="success"
                      icon="revives"
                    />
                    <TopPerformerCard
                      label="Top Survivor"
                      performer={
                        cacheData.payload.byMode[selectedMode].topPerformers.survival[0]
                          ? {
                              memberId: cacheData.payload.byMode[selectedMode].topPerformers.survival[0].memberId,
                              displayName: cacheData.payload.byMode[selectedMode].topPerformers.survival[0].displayName,
                              value: cacheData.payload.byMode[selectedMode].topPerformers.survival[0].averagePlacement,
                              matchesPlayed: cacheData.payload.byMode[selectedMode].topPerformers.survival[0].matchesPlayed,
                            }
                          : null
                      }
                      formatValue={(v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v)}
                      valueUnit="place moy."
                      tone="neutral"
                      icon="survival"
                    />
                  </div>
                </div>

                <div className="mb-8">
                  <TopPerformers performers={cacheData.payload.byMode[selectedMode].topPerformers as any} />
                </div>

                {(selectedMode === 'all' || selectedMode === 'duo' || selectedMode === 'squad' || selectedMode === 'trio') && (
                  <div className="mb-4">
                    <SquadSynergies clanId={clanId} period={selectedPeriod} matchType={selectedMatchType} mode={selectedMode} synergies={cacheData.payload.byMode[selectedMode].synergies as any} />
                  </div>
                )}
              </>
            )}
          </section>

          <DropPressureStatsPanel
            stats={dropPressure}
            loading={dropPressureLoading}
            error={dropPressureError}
            ranking={dropPressureRanking}
            timeline={dropPressureTimeline}
          />



          {/* Bloc 4 — Roster des performances */}
          <section className="app-panel p-6">
            <div className="mb-5 flex items-center gap-3 border-b border-gray-200 pb-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-500">
                <UsersRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">Roster des performances</h2>
            </div>

            {/* Version Desktop / Tablette */}
            <div className="hidden max-h-[48.65rem] overflow-auto md:block app-table-shell">
              <table className="w-full text-sm">
                <thead className="app-table-head sticky top-0 z-10 whitespace-nowrap">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Joueur
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Matchs
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Victoires
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Kills
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Dégâts (Moy)
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      K+A Moy.
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Médailles
                    </th>
                    <th className="w-8 pr-3">
                      <span className="sr-only">Profil</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {performanceRoster.map((member) => (
                    <tr key={member.id} className="app-table-row transition-colors hover:bg-gray-50">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <MemberAvatar
                            name={member.displayName}
                            avatarUrl={member.avatarUrl}
                            className="h-9 w-9"
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/members/${member.id}/dashboard`}
                              className="font-semibold text-gray-900 hover:underline"
                            >
                              {member.displayName}
                            </Link>
                            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
                              <span className={getRoleBadgeClass(member.role)}>{member.role}</span>
                              {member.pubgPlayerName !== member.displayName && (
                                <span className="truncate">{member.pubgPlayerName}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="min-w-28 px-3 py-3 text-right">
                        <span className="font-semibold tabular-nums text-gray-900">{member.stats.matchesPlayed}</span>
                        <div className="mt-1.5 ml-auto h-1 w-20 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{
                              width: `${maxRosterMatches > 0 ? Math.max(3, (member.stats.matchesPlayed / maxRosterMatches) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-500">
                          {member.stats.wins}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-red-500">
                        {member.stats.totalKills}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-gray-700">
                        {member.stats.matchesPlayed > 0
                          ? Math.round(member.stats.totalDamage / member.stats.matchesPlayed)
                          : 0}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-blue-500">
                        {member.stats.matchesPlayed > 0
                          ? ((member.stats.totalKills + member.stats.totalAssists) / member.stats.matchesPlayed).toFixed(1)
                          : '0.0'}
                      </td>
                      <td className="min-w-28 px-3 py-3">
                        <MedalCounts {...member.medalCounts} />
                      </td>
                      <td className="w-8 pr-3 text-right">
                        <Link
                          href={`/members/${member.id}/dashboard`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          aria-label={`Voir le profil de ${member.displayName}`}
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Version Mobile */}
            <div className="grid gap-3 md:hidden">
              {performanceRoster.map((member) => (
                <article key={member.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-start gap-3">
                    <MemberAvatar
                      name={member.displayName}
                      avatarUrl={member.avatarUrl}
                      className="h-10 w-10"
                    />
                    <div className="min-w-0 flex-1">
                      <Link href={`/members/${member.id}/dashboard`} className="font-bold text-gray-900 hover:underline">
                        {member.displayName}
                      </Link>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5">
                        <span className={getRoleBadgeClass(member.role)}>{member.role}</span>
                        {member.pubgPlayerName !== member.displayName && (
                          <span className="truncate text-xs text-gray-500">{member.pubgPlayerName}</span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/members/${member.id}/dashboard`}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      aria-label={`Voir le profil de ${member.displayName}`}
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-500">Activité</span>
                      <span className="font-bold tabular-nums text-gray-900">
                        {member.stats.matchesPlayed} matchs
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{
                          width: `${maxRosterMatches > 0 ? Math.max(3, (member.stats.matchesPlayed / maxRosterMatches) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-4 rounded-md border border-gray-200 bg-white py-2.5 text-center">
                    <div>
                      <dd className="text-sm font-bold tabular-nums text-emerald-500">{member.stats.wins}</dd>
                      <dt className="text-[9px] font-semibold uppercase text-gray-500">Victoires</dt>
                    </div>
                    <div className="border-l border-gray-200">
                      <dd className="text-sm font-bold tabular-nums text-red-500">{member.stats.totalKills}</dd>
                      <dt className="text-[9px] font-semibold uppercase text-gray-500">Kills</dt>
                    </div>
                    <div className="border-l border-gray-200">
                      <dd className="text-sm font-bold tabular-nums text-gray-900">
                        {member.stats.matchesPlayed > 0
                          ? Math.round(member.stats.totalDamage / member.stats.matchesPlayed)
                          : 0}
                      </dd>
                      <dt className="text-[9px] font-semibold uppercase text-gray-500">Dégâts</dt>
                    </div>
                    <div className="border-l border-gray-200">
                      <dd className="text-sm font-bold tabular-nums text-blue-500">
                        {member.stats.matchesPlayed > 0
                          ? ((member.stats.totalKills + member.stats.totalAssists) / member.stats.matchesPlayed).toFixed(1)
                          : '0.0'}
                      </dd>
                      <dt className="text-[9px] font-semibold uppercase text-gray-500">K+A</dt>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                    <span className="text-[10px] font-semibold uppercase text-gray-500">Médailles</span>
                    <MedalCounts {...member.medalCounts} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
    </>
  )
}
