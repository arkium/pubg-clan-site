'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Map } from 'lucide-react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'

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

type StatTone = 'success' | 'danger' | 'info' | 'neutral'

function statToneClass(tone: StatTone) {
  if (tone === 'success') return 'text-emerald-500'
  if (tone === 'danger') return 'text-red-500'
  if (tone === 'info') return 'text-blue-500'
  return 'text-gray-900'
}

function CompactStat({
  label,
  value,
  tone,
  active = false,
}: {
  label: string
  value: string | number
  tone: StatTone
  active?: boolean
}) {
  const boxClass = active
    ? 'rounded-lg border border-[rgba(217,119,6,0.4)] bg-[rgba(217,119,6,0.12)] px-1 py-1.5 text-center'
    : 'rounded-lg bg-gray-50 px-1 py-1.5 text-center'
  const labelClass = active
    ? 'mt-1 text-[9px] font-bold uppercase leading-tight tracking-wide text-[rgb(217,119,6)]'
    : 'mt-1 text-[9px] font-semibold uppercase leading-tight tracking-wide text-gray-500'

  return (
    <div className={boxClass}>
      <p className={`text-base font-black leading-none tabular-nums ${statToneClass(tone)}`}>{value}</p>
      <p className={labelClass}>{label}</p>
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

function podiumToneClass(rank: number) {
  if (rank === 1) return 'app-podium-badge--gold'
  if (rank === 2) return 'app-podium-badge--silver'
  return 'app-podium-badge--bronze'
}

function MapCardBanner({
  mapName,
  mapLabel,
  podiumRank,
}: {
  mapName: string
  mapLabel: string
  podiumRank: number | null
}) {
  const [imgFailed, setImgFailed] = useState(false)

  if (imgFailed) {
    return (
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Carte</p>
          <h3 className="mt-1 text-xl font-semibold text-gray-900">{mapLabel}</h3>
        </div>
        {podiumRank ? (
          <span className={`app-podium-badge ${podiumToneClass(podiumRank)} shrink-0`}>#{podiumRank}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="-mx-4 -mt-4 mb-4 h-28 overflow-hidden rounded-t-2xl relative">
      <img
        src={`/maps/pubg/${mapName}.webp`}
        alt={mapLabel}
        className="h-full w-full object-cover"
        onError={() => setImgFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 px-4 pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Carte</p>
          <h3 className="text-lg font-bold leading-tight text-white drop-shadow">{mapLabel}</h3>
        </div>
        {podiumRank ? (
          <span className={`app-podium-badge ${podiumToneClass(podiumRank)} shrink-0`}>#{podiumRank}</span>
        ) : null}
      </div>
    </div>
  )
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

  const scopeLabelMap: Record<Scope, string> = {
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

  const periodLabelMap: Record<Period, string> = {
    week: 'Semaine',
    month: 'Mois',
    all: 'Tous',
  }

  const periodItems: MobileDropdownNavItem[] = [
    {
      key: 'week',
      label: 'Semaine',
      active: period === 'week',
      onSelect: () => setPeriod('week'),
    },
    {
      key: 'month',
      label: 'Mois',
      active: period === 'month',
      onSelect: () => setPeriod('month'),
    },
    {
      key: 'all',
      label: 'Tous',
      active: period === 'all',
      onSelect: () => setPeriod('all'),
    },
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

  const sortItems: MobileDropdownNavItem[] = (Object.keys(SORT_LABELS) as SortKey[]).map((key) => ({
    key,
    label: SORT_LABELS[key],
    active: sortKey === key,
    onSelect: () => setSortKey(key),
  }))

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <section className="mb-6">
        <MemberPageHeader
          title="Statistique des cartes"
          subtitle="Pilote les performances d'equipe carte par carte avec les filtres actifs."
          showBackButton={false}
          backgroundImage="/map-stats.jpg"
          icon={<Map className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />}
        />
      </section>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <MobileDropdownNav
            id={`map-stats-scope-${memberId}`}
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
            id={`map-stats-period-${memberId}`}
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

          {scope === 'member' ? (
            <MobileDropdownNav
              id={`map-stats-member-${memberId}`}
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
              id={`map-stats-best-mode-${memberId}`}
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

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Performance par carte</h2>
            <p className="text-sm text-gray-500">
              Compare rapidement les performances par carte selon la selection active en haut de page.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:min-w-[23rem]">
            <MobileDropdownNav
              id={`map-stats-sort-${memberId}`}
              label="Trier par"
              currentLabel={SORT_LABELS[sortKey]}
              items={sortItems}
              variant="compact"
              visibilityClass="block"
              className="w-full"
              leftIcon={(
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="M4.5 6.5h11M4.5 10h7.5M4.5 13.5h4"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            />

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
          <div className="map-stats-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedMapStats.map((entry, index) => {
              const podiumRank = sortKey !== 'mapLabel' && index < 3 ? index + 1 : null

              return (
                <article
                  key={entry.mapName}
                  className="map-stats-card overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-slate-50 to-gray-50 p-4 shadow-sm"
                >
                  <MapCardBanner mapName={entry.mapName} mapLabel={entry.mapLabel} podiumRank={podiumRank} />

                  <div className="grid grid-cols-4 gap-1.5">
                    <CompactStat label="Matchs" value={entry.matches} tone="neutral" active={sortKey === 'matches'} />
                    <CompactStat label="Victoires" value={entry.wins} tone="success" active={sortKey === 'wins'} />
                    <CompactStat label="Win rate" value={formatPercent(entry.winRate)} tone="success" active={sortKey === 'winRate'} />
                    <CompactStat label="Top 10" value={formatPercent(entry.top10Rate)} tone="success" active={sortKey === 'top10Rate'} />

                    <CompactStat label="Place moy." value={Math.round(entry.avgPlacement)} tone="neutral" active={sortKey === 'avgPlacement'} />
                    <CompactStat label="Kills" value={entry.totalKills} tone="danger" active={sortKey === 'totalKills'} />
                    <CompactStat label="KO" value={entry.totalKnockouts} tone="danger" active={sortKey === 'totalKnockouts'} />
                    <CompactStat label="Headshots" value={entry.totalHeadshots} tone="danger" active={sortKey === 'totalHeadshots'} />

                    <CompactStat label="Damage" value={Math.round(entry.totalDamage)} tone="neutral" active={sortKey === 'totalDamage'} />
                    <CompactStat label="Assists" value={entry.totalAssists} tone="info" active={sortKey === 'totalAssists'} />
                    <CompactStat label="Revives" value={entry.totalRevives} tone="info" active={sortKey === 'totalRevives'} />
                    <CompactStat label="Duree" value={formatDuration(entry.avgDurationSeconds)} tone="neutral" active={sortKey === 'avgDurationSeconds'} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
