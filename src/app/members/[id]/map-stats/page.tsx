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

function compactScopeLabel(label: string) {
  return label
    .replace(/^Stats cartes de\s+/i, '')
    .replace(/^Stats cartes du\s+/i, '')
}

function readInitialSortPreference() {
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

    return {
      key: parsed.key ?? 'matches',
      dir: parsed.dir === 'asc' ? 'asc' : 'desc',
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

  function renderSortIndicator(key: SortKey) {
    if (sortKey !== key) {
      return <span className="ml-1 text-gray-300">↕</span>
    }

    return <span className="ml-1 text-cyan-700">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const bestCompositionCards =
    scope === 'best'
      ? (payload?.bestCompositions ?? []).filter((entry) => entry.mode === bestMode)
      : payload?.bestCompositions ?? []

  const bestCompositionsTitle =
    scope === 'best'
      ? `Meilleure composition (${bestMode === 'duo' ? 'Duo' : bestMode === 'trio' ? 'Trio' : 'Squad'})`
      : 'Meilleurs duo/trio/squad'

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <div className="mb-6">
        <MemberPageHeader
          title="Statistiques par carte"
          subtitle="Toutes les stats de match agrégées par carte, avec filtres avancés."
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

          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
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
        <div className="grid gap-3 md:grid-cols-3">
          {bestCompositionCards.map((entry) => {
            const visual = modeIcon(entry.mode)

            return (
            <article key={entry.mode} className="rounded border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${visual.tone}`}>
                  <Image src={visual.iconPath} alt={visual.iconAlt} width={16} height={16} />
                  <span>{entry.label}</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {entry.teamMembers.length > 0 ? entry.teamMembers.join(', ') : 'Aucune composition'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700">
                <p>Matchs: {entry.matches}</p>
                <p>Wins: {entry.wins}</p>
                <p>Win rate: {formatPercent(entry.winRate)}</p>
                <p>Place moy.: {entry.avgPlacement.toFixed(2)}</p>
              </div>
            </article>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Statistiques par carte</h2>

        {loading ? (
          <p className="text-sm text-gray-500">Chargement des stats par carte...</p>
        ) : !payload || payload.mapStats.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune statistique disponible pour les filtres sélectionnés.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="border border-gray-200 px-3 py-2 text-left">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('mapLabel')}>
                      Carte
                      {renderSortIndicator('mapLabel')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('matches')}>
                      Matchs
                      {renderSortIndicator('matches')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('wins')}>
                      Wins
                      {renderSortIndicator('wins')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('winRate')}>
                      Win rate
                      {renderSortIndicator('winRate')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('top10Rate')}>
                      Top 10
                      {renderSortIndicator('top10Rate')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right" title="Place moyenne">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('avgPlacement')}>
                      #
                      {renderSortIndicator('avgPlacement')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('totalKills')}>
                      Kills
                      {renderSortIndicator('totalKills')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('totalKnockouts')}>
                      KO
                      {renderSortIndicator('totalKnockouts')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('totalAssists')}>
                      Assists
                      {renderSortIndicator('totalAssists')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('totalDamage')}>
                      Damage
                      {renderSortIndicator('totalDamage')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('totalHeadshots')}>
                      Headshots
                      {renderSortIndicator('totalHeadshots')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('totalRevives')}>
                      Revives
                      {renderSortIndicator('totalRevives')}
                    </button>
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center" onClick={() => handleSort('avgDurationSeconds')}>
                      Duree moy.
                      {renderSortIndicator('avgDurationSeconds')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedMapStats.map((entry) => (
                  <tr key={entry.mapName} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2 font-medium text-gray-900">{entry.mapLabel}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{entry.matches}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{entry.wins}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{formatPercent(entry.winRate)}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{formatPercent(entry.top10Rate)}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{Math.round(entry.avgPlacement)}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{entry.totalKills}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{entry.totalKnockouts}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{entry.totalAssists}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{Math.round(entry.totalDamage)}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{entry.totalHeadshots}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{entry.totalRevives}</td>
                    <td className="border border-gray-200 px-3 py-2 text-right">{formatDuration(entry.avgDurationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
