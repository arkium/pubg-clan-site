'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

import MemberSectionNav from '@/components/MemberSectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import NotificationBell from '@/components/NotificationBell'

type Scope = 'self' | 'member' | 'clan' | 'best'
type BestMode = 'duo' | 'trio' | 'squad'
type Period = 'week' | 'month' | 'all'

type MapStat = {
  mapName: string
  mapLabel: string
  matches: number
  wins: number
  winRate: number
  top10Rate: number
  avgPlacement: number
  totalKills: number
  totalKnockouts: number
  totalAssists: number
  totalDamage: number
  totalHeadshots: number
  totalRevives: number
  avgDurationSeconds: number
}

type SortKey =
  | 'mapLabel'
  | 'matches'
  | 'wins'
  | 'winRate'
  | 'top10Rate'
  | 'avgPlacement'
  | 'totalKills'
  | 'totalKnockouts'
  | 'totalAssists'
  | 'totalDamage'
  | 'totalHeadshots'
  | 'totalRevives'
  | 'avgDurationSeconds'

const SORT_LABELS: Record<SortKey, string> = {
  mapLabel: 'Carte',
  matches: 'Matchs',
  wins: 'Wins',
  winRate: 'Win rate',
  top10Rate: 'Top 10',
  avgPlacement: 'Place moyenne',
  totalKills: 'Kills',
  totalKnockouts: 'KO',
  totalAssists: 'Assists',
  totalDamage: 'Damage',
  totalHeadshots: 'Headshots',
  totalRevives: 'Revives',
  avgDurationSeconds: 'Duree moyenne',
}

type MetricTone = 'sky' | 'emerald' | 'violet' | 'amber' | 'rose'

function MetricIcon({ name }: { name: 'wins' | 'winRate' | 'top10' | 'placement' | 'kills' | 'damage' | 'ko' | 'assists' | 'headshots' | 'revives' | 'duration' }) {
  if (name === 'wins') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path d="M6 4h8v2a4 4 0 0 1-8 0V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 5H4a1 1 0 0 0-1 1v.5A2.5 2.5 0 0 0 5.5 9H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 5h2a1 1 0 0 1 1 1v.5A2.5 2.5 0 0 1 14.5 9H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 10v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7.5 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'winRate') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path d="M10 3v7l4.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }

  if (name === 'top10') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path d="m10 3 1.7 3.4 3.8.6-2.7 2.6.6 3.8-3.4-1.8-3.4 1.8.6-3.8L4.5 7l3.8-.6L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'placement') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path d="M4 15h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M6 15V9h2v6M11 15V5h2v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'kills') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <circle cx="10" cy="10" r="4.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'damage') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path d="M11 2 5.5 10H10L9 18l5.5-8H10l1-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'ko') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path d="M5 11.5 8 8.5l2 2 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 15h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'assists') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path d="M6.5 11c1 0 1.8-.8 1.8-1.8S7.5 7.5 6.5 7.5s-1.8.8-1.8 1.7S5.5 11 6.5 11ZM13.5 11c1 0 1.8-.8 1.8-1.8s-.8-1.7-1.8-1.7-1.8.8-1.8 1.7.8 1.8 1.8 1.8Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.8 15c.7-1.8 2-2.7 3.9-2.7 1.1 0 2 .3 2.8.9.8-.6 1.7-.9 2.8-.9 1.9 0 3.2.9 3.9 2.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'headshots') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="1.4" fill="currentColor" />
      </svg>
    )
  }

  if (name === 'revives') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path d="M10 16s-5-2.8-5-7a2.8 2.8 0 0 1 5-1.7A2.8 2.8 0 0 1 15 9c0 4.2-5 7-5 7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 7.5v3M8.5 9h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.5v3.8l2.5 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function metricToneClasses(tone: MetricTone) {
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (tone === 'violet') return 'border-violet-200 bg-violet-50 text-violet-700'
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (tone === 'rose') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

function MetricTile({
  label,
  value,
  icon,
  tone,
  compact = false,
}: {
  label: string
  value: string | number
  icon: 'wins' | 'winRate' | 'top10' | 'placement' | 'kills' | 'damage' | 'ko' | 'assists' | 'headshots' | 'revives' | 'duration'
  tone: MetricTone
  compact?: boolean
}) {
  return (
    <div className={`map-stats-metric-tile rounded-xl border px-3 py-3 ${compact ? 'min-h-[5.5rem]' : 'min-h-[6.4rem]'} ${metricToneClasses(tone)}`}>
      <div className="mb-2 flex items-center justify-start gap-2 text-left">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current/20 bg-white/70">
          <MetricIcon name={icon} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
      </div>
      <p className={`mt-1 text-center font-semibold ${compact ? 'text-base' : 'text-lg'}`}>{value}</p>
    </div>
  )
}

type MapStatsPayload = {
  scope: Scope
  scopeLabel: string
  options: {
    members: Array<{
      id: number
      displayName: string
    }>
    bestModes: BestMode[]
  }
  selected: {
    memberId: number
    targetMemberId: number | null
    bestMode: BestMode
    period: Period
  }
  totals: {
    rows: number
    maps: number
  }
  mapStats: MapStat[]
  bestCompositions: Array<{
    mode: BestMode
    label: string
    teamMembers: string[]
    matches: number
    wins: number
    winRate: number
    avgPlacement: number
  }>
  error?: string
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remaining = total % 60
  return `${minutes}m ${String(remaining).padStart(2, '0')}s`
}

function modeIcon(mode: BestMode) {
  if (mode === 'duo') {
    return {
      iconPath: '/icons/squads/duo.svg',
      iconAlt: 'Logo duo',
      tone: 'bg-sky-100 text-sky-700',
    }
  }

  if (mode === 'trio') {
    return {
      iconPath: '/icons/squads/trio.svg',
      iconAlt: 'Logo trio',
      tone: 'bg-violet-100 text-violet-700',
    }
  }

  return {
    iconPath: '/icons/squads/squad.svg',
    iconAlt: 'Logo squad',
    tone: 'bg-emerald-100 text-emerald-700',
  }
}

function modeCardTone(mode: BestMode) {
  if (mode === 'duo') {
    return {
      card: 'border-sky-200 bg-sky-50 text-sky-800',
      title: 'text-sky-900',
      playersWrap: 'border-sky-200 bg-white/80',
      playerPill: 'border-sky-200 bg-white text-sky-900',
      metric: 'border-sky-200 bg-white/85',
      metricValue: 'text-sky-900',
    }
  }

  if (mode === 'trio') {
    return {
      card: 'border-violet-200 bg-violet-50 text-violet-800',
      title: 'text-violet-900',
      playersWrap: 'border-violet-200 bg-white/80',
      playerPill: 'border-violet-200 bg-white text-violet-900',
      metric: 'border-violet-200 bg-white/85',
      metricValue: 'text-violet-900',
    }
  }

  return {
    card: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    title: 'text-emerald-900',
    playersWrap: 'border-emerald-200 bg-white/80',
    playerPill: 'border-emerald-200 bg-white text-emerald-900',
    metric: 'border-emerald-200 bg-white/85',
    metricValue: 'text-emerald-900',
  }
}

function compactScopeLabel(label: string) {
  return label
    .replace(/^Stats cartes de\s+/i, '')
    .replace(/^Stats cartes du\s+/i, '')
}

function readInitialSortPreference(): { key: SortKey; dir: 'asc' | 'desc' } {
  if (typeof window === 'undefined') {
    return { key: 'matches' as SortKey, dir: 'desc' as 'asc' | 'desc' }
  }

  const raw = window.localStorage.getItem('member-map-stats-sort')
  if (!raw) {
    return { key: 'matches' as SortKey, dir: 'desc' as 'asc' | 'desc' }
  }

  try {
    const parsed = JSON.parse(raw) as {
      key?: SortKey
      dir?: 'asc' | 'desc'
    }

    const dir: 'asc' | 'desc' = parsed.dir === 'asc' ? 'asc' : 'desc'

    return {
      key: parsed.key ?? 'matches',
      dir,
    }
  } catch {
    return { key: 'matches' as SortKey, dir: 'desc' as 'asc' | 'desc' }
  }
}

export default function MemberMapStatsPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [scope, setScope] = useState<Scope>('self')
  const [targetMemberId, setTargetMemberId] = useState<number | null>(null)
  const [bestMode, setBestMode] = useState<BestMode>('duo')
  const [period, setPeriod] = useState<Period>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<MapStatsPayload | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>(() => readInitialSortPreference().key)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => readInitialSortPreference().dir)

  useEffect(() => {
    localStorage.setItem(
      'member-map-stats-sort',
      JSON.stringify({
        key: sortKey,
        dir: sortDir,
      })
    )
  }, [sortDir, sortKey])

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const query = new URLSearchParams({
          scope,
          bestMode,
          period,
        })

        if (scope === 'member' && targetMemberId) {
          query.set('targetMemberId', String(targetMemberId))
        }

        const response = await fetch(`/api/members/${memberId}/map-stats?${query.toString()}`)
        const data = (await response.json()) as MapStatsPayload

        if (!response.ok) {
          throw new Error(data.error ?? 'Impossible de charger les stats par carte')
        }

        if (!cancelled) {
          setPayload(data)
          if (scope === 'member' && data.selected.targetMemberId) {
            setTargetMemberId(data.selected.targetMemberId)
          }
          setPeriod(data.selected.period)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger les stats par carte'
          )
          setPayload(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [bestMode, memberId, period, scope, targetMemberId])

  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">ID joueur invalide.</p>
      </main>
    )
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDir('desc')
  }

  const sortedMapStats = [...(payload?.mapStats ?? [])].sort((left, right) => {
    const leftValue = left[sortKey]
    const rightValue = right[sortKey]

    if (leftValue === rightValue) {
      return 0
    }

    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
      const result = leftValue.localeCompare(rightValue)
      return sortDir === 'asc' ? result : -result
    }

    const result = Number(leftValue) - Number(rightValue)
    return sortDir === 'asc' ? result : -result
  })

  const bestCompositionCards =
    scope === 'best'
      ? (payload?.bestCompositions ?? []).filter((entry) => entry.mode === bestMode)
      : payload?.bestCompositions ?? []

  const bestCompositionsTitle =
    scope === 'best'
      ? `Team Play ${bestMode === 'duo' ? 'Duo' : bestMode === 'trio' ? 'Trio' : 'Squad'}`
      : 'Team Play Duo/Trio/Squad'

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <div className="mb-6">
        <MemberPageHeader
          title="Statistique des cartes"
          subtitle="Pilote les performances d'equipe carte par carte avec les filtres actifs."
          actions={<NotificationBell memberId={memberId} />}
        />
      </div>

      <MemberSectionNav memberId={memberId} />

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Filtre</span>
            <select
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as Scope
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
              onChange={(event) => setPeriod(event.target.value as Period)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="week">7 jours</option>
              <option value="month">30 jours</option>
              <option value="all">Tout</option>
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

          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-center text-sm text-cyan-900 md:col-start-5 md:justify-self-end md:min-w-[16rem]">
            <p className="font-medium">{payload?.scopeLabel ? compactScopeLabel(payload.scopeLabel) : 'Chargement...'}</p>
            <p className="mt-1 text-xs text-cyan-800">
              {payload?.totals.rows ?? 0} lignes matches · {payload?.totals.maps ?? 0} cartes
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{bestCompositionsTitle}</h2>
        <p className="mb-3 text-sm text-gray-500">
          Repere en un coup d'oeil les coequipiers avec qui ton impact est le plus fort.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {bestCompositionCards.map((entry) => {
            const visual = modeIcon(entry.mode)
            const tone = modeCardTone(entry.mode)

            return (
            <article key={entry.mode} className={`rounded-2xl border p-4 shadow-sm ${tone.card}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${visual.tone}`}>
                  <Image src={visual.iconPath} alt={visual.iconAlt} width={18} height={18} />
                  <span>{entry.label}</span>
                </span>
                <span className={`text-lg font-bold ${tone.title}`}>{formatPercent(entry.winRate)}</span>
              </div>

              <div className={`mt-3 rounded-xl border p-3 ${tone.playersWrap}`}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Composition</p>
                {entry.teamMembers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {entry.teamMembers.map((name) => (
                      <span
                        key={`${entry.mode}-${name}`}
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-semibold ${tone.playerPill}`}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Aucune composition</p>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className={`rounded-xl border p-2.5 text-center ${tone.metric}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Matchs</p>
                  <p className={`mt-1 text-lg font-bold ${tone.metricValue}`}>{entry.matches}</p>
                </div>
                <div className={`rounded-xl border p-2.5 text-center ${tone.metric}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Wins</p>
                  <p className={`mt-1 text-lg font-bold ${tone.metricValue}`}>{entry.wins}</p>
                </div>
                <div className={`rounded-xl border p-2.5 text-center ${tone.metric}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Win rate</p>
                  <p className={`mt-1 text-base font-bold ${tone.metricValue}`}>{formatPercent(entry.winRate)}</p>
                </div>
                <div className={`rounded-xl border p-2.5 text-center ${tone.metric}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Place moy.</p>
                  <p className={`mt-1 text-base font-bold ${tone.metricValue}`}>{entry.avgPlacement.toFixed(2)}</p>
                </div>
              </div>
            </article>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Performance par carte</h2>
            <p className="text-sm text-gray-500">
              Compare rapidement les performances par carte selon la selection active en haut de page.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:min-w-[23rem]">
            <label className="flex h-10 items-center gap-2 text-sm text-gray-700">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">Trier par</span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm"
              >
                {Object.entries(SORT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))}
              className="inline-flex h-10 items-center justify-center self-end rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              aria-label={sortDir === 'asc' ? 'Tri croissant actif' : 'Tri decroissant actif'}
              title={sortDir === 'asc' ? 'Tri croissant' : 'Tri decroissant'}
            >
              <span className="inline-flex items-center gap-2" aria-hidden="true">
                <span className={sortDir === 'asc' ? 'text-slate-900' : 'text-slate-400'}>↑</span>
                <span className={sortDir === 'desc' ? 'text-slate-900' : 'text-slate-400'}>↓</span>
              </span>
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Chargement des stats par carte...</p>
        ) : !payload || payload.mapStats.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune statistique disponible pour les filtres sélectionnés.</p>
        ) : (
          <div className="map-stats-grid grid grid-cols-1 gap-4 md:grid-cols-3">
            {sortedMapStats.map((entry) => (
              <article
                key={entry.mapName}
                className="map-stats-card rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-slate-50 to-gray-50 p-4 shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Carte</p>
                    <h3 className="mt-1 text-xl font-semibold text-gray-900">{entry.mapLabel}</h3>
                  </div>
                  <div className="flex min-w-[5.5rem] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-3 py-2 text-center shadow-sm ring-1 ring-slate-200/70">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Matchs</p>
                    <p className="mt-1 text-xl font-bold leading-none text-gray-900">{entry.matches}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="Wins" value={entry.wins} icon="wins" tone="amber" />
                  <MetricTile label="Win rate" value={formatPercent(entry.winRate)} icon="winRate" tone="emerald" />
                  <MetricTile label="Top 10" value={formatPercent(entry.top10Rate)} icon="top10" tone="violet" />
                  <MetricTile label="Place moy." value={Math.round(entry.avgPlacement)} icon="placement" tone="sky" />
                </div>

                <details className="mt-4 rounded-2xl border border-gray-200 bg-white/70 p-3 group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none [&::-webkit-details-marker]:hidden">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Detail performance</p>
                      <p className="mt-1 text-xs text-gray-500">Voir les metriques complementaires.</p>
                    </div>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition group-open:rotate-180">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M3.5 6L8 10.5L12.5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <MetricTile label="Kills" value={entry.totalKills} icon="kills" tone="sky" compact />
                    <MetricTile label="Damage" value={Math.round(entry.totalDamage)} icon="damage" tone="rose" compact />
                    <MetricTile label="KO" value={entry.totalKnockouts} icon="ko" tone="violet" compact />
                    <MetricTile label="Assists" value={entry.totalAssists} icon="assists" tone="emerald" compact />
                    <MetricTile label="Headshots" value={entry.totalHeadshots} icon="headshots" tone="amber" compact />
                    <MetricTile label="Revives" value={entry.totalRevives} icon="revives" tone="emerald" compact />
                  </div>
                </details>

                <div className="mt-4">
                  <MetricTile label="Duree moyenne" value={formatDuration(entry.avgDurationSeconds)} icon="duration" tone="sky" compact />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
