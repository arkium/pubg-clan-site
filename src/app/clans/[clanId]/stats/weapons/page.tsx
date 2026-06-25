'use client'

import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import WeaponIcon from '@/components/ui/WeaponIcon'

type TelemetryPeriod = 'week' | 'month' | 'all'

type ClanWeaponRow = {
  memberId: number
  displayName: string
  pubgPlayerName: string
  weaponName: string
  weaponLabel?: string
  weaponCategoryCode?: string
  weaponCategoryLabel?: string
  kills: number
  headshots: number
  shotsFired: number
  hitsLanded: number
  accuracy: number
  avgDistance: number
  maxDistance?: number | null
  totalDamage?: number | null
  matchCount: number
}

type ClanWeaponsResponse = {
  ok: boolean
  clanId: number
  period: TelemetryPeriod
  periodKey: string
  count: number
  matchCount?: number
  categoryLabels?: Record<string, string>
  rows: ClanWeaponRow[]
  note: string | null
}

type SortKey = 'player' | 'weapon' | 'kills' | 'headshotRate' | 'shotsFired' | 'hitsLanded' | 'accuracy' | 'avgDistance' | 'maxDistance' | 'totalDamage' | 'matchCount'
type SortDirection = 'asc' | 'desc'

const PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

const PAGE_SIZE = 10

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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatMeters(value: number) {
  return `${value.toFixed(1)} m`
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'fr-FR', { sensitivity: 'base' })
}

function compareNumber(left: number, right: number) {
  return left - right
}

export default function ClanTelemetryWeaponsPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<ClanWeaponsResponse | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('kills')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [activeCategory, setActiveCategory] = useState<string>('Toutes')
  const [activePlayer, setActivePlayer] = useState<string>('Tous')
  const [currentPage, setCurrentPage] = useState(1)

  const podiumByRowKey = useMemo(() => {
    const rows = payload?.rows ?? []
    if (rows.length === 0) {
      return new Map<string, number>()
    }

    const ranked = [...rows].sort((left, right) => {
      if (left.kills !== right.kills) {
        return right.kills - left.kills
      }

      const weaponCompare = compareText(
        left.weaponLabel ?? left.weaponName,
        right.weaponLabel ?? right.weaponName
      )
      if (weaponCompare !== 0) {
        return weaponCompare
      }

      return compareText(left.displayName, right.displayName)
    })

    const podium = new Map<string, number>()
    ranked.slice(0, 3).forEach((row, index) => {
      podium.set(`${row.memberId}:${row.weaponName}`, index + 1)
    })
    return podium
  }, [payload?.rows])

  const sortedRows = useMemo(() => {
    const rows = payload?.rows ?? []
    const factor = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((left, right) => {
      if (sortKey === 'player') {
        return compareText(left.displayName, right.displayName) * factor
      }

      if (sortKey === 'weapon') {
        return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName) * factor
      }

      if (sortKey === 'kills') {
        const compare = compareNumber(left.kills, right.kills)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName)
      }

      if (sortKey === 'headshotRate') {
        const leftRate = left.kills > 0 ? (left.headshots / left.kills) * 100 : 0
        const rightRate = right.kills > 0 ? (right.headshots / right.kills) * 100 : 0
        const compare = compareNumber(leftRate, rightRate)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName)
      }

      if (sortKey === 'shotsFired') {
        const compare = compareNumber(left.shotsFired, right.shotsFired)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName)
      }

      if (sortKey === 'hitsLanded') {
        const compare = compareNumber(left.hitsLanded, right.hitsLanded)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName)
      }

      if (sortKey === 'accuracy') {
        const compare = compareNumber(left.accuracy, right.accuracy)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName)
      }

      if (sortKey === 'avgDistance') {
        const compare = compareNumber(left.avgDistance, right.avgDistance)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName)
      }

      if (sortKey === 'totalDamage') {
        const leftValue = typeof left.totalDamage === 'number' ? left.totalDamage : -1
        const rightValue = typeof right.totalDamage === 'number' ? right.totalDamage : -1
        const compare = compareNumber(leftValue, rightValue)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName)
      }

      if (sortKey === 'maxDistance') {
        const leftValue = typeof left.maxDistance === 'number' ? left.maxDistance : -1
        const rightValue = typeof right.maxDistance === 'number' ? right.maxDistance : -1
        const compare = compareNumber(leftValue, rightValue)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName)
      }

      const compare = compareNumber(left.matchCount, right.matchCount)
      if (compare !== 0) {
        return compare * factor
      }
      return compareText(left.weaponLabel ?? left.weaponName, right.weaponLabel ?? right.weaponName)
    })
  }, [payload?.rows, sortDirection, sortKey])

  const availableCategories = useMemo(() => {
    const rows = payload?.rows ?? []
    const labels = payload?.categoryLabels ?? {}
    const seen = new Set<string>()
    const options: Array<{ value: string; label: string }> = [{ value: 'Toutes', label: 'Toutes' }]
    for (const row of rows) {
      const code = row.weaponCategoryCode ?? 'Autre'
      if (!seen.has(code)) {
        seen.add(code)
        options.push({ value: code, label: labels[code] ?? row.weaponCategoryLabel ?? code })
      }
    }
    return options
  }, [payload?.rows, payload?.categoryLabels])

  const availablePlayers = useMemo(() => {
    const rows = payload?.rows ?? []
    const seen = new Set<string>()
    for (const row of rows) {
      seen.add(row.displayName)
    }
    const sorted = [...seen].sort((a, b) => compareText(a, b))
    return [
      { value: 'Tous', label: 'Tous' },
      ...sorted.map((name) => ({ value: name, label: name })),
    ]
  }, [payload?.rows])

  const filteredRows = useMemo(() => {
    let rows = sortedRows
    if (activeCategory !== 'Toutes') {
      rows = rows.filter((row) => (row.weaponCategoryCode ?? 'Autre') === activeCategory)
    }
    if (activePlayer !== 'Tous') {
      rows = rows.filter((row) => row.displayName === activePlayer)
    }
    return rows
  }, [sortedRows, activeCategory, activePlayer])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  }, [filteredRows.length])

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    return filteredRows.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredRows, currentPage])

  const paginationRange = useMemo(() => {
    if (filteredRows.length === 0) {
      return { start: 0, end: 0 }
    }

    const start = (currentPage - 1) * PAGE_SIZE + 1
    const end = Math.min(currentPage * PAGE_SIZE, filteredRows.length)
    return { start, end }
  }, [currentPage, filteredRows.length])

  function handleSortClick(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setSortDirection(nextKey === 'player' || nextKey === 'weapon' ? 'asc' : 'desc')
  }

  function sortLabel(key: SortKey) {
    if (sortKey !== key) {
      return ''
    }

    return sortDirection === 'asc' ? ' ▲' : ' ▼'
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [period, activeCategory, activePlayer])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!clanId) {
      return
    }

    let cancelled = false

    async function loadWeapons() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/clans/${clanId}/telemetry/weapons?period=${period}`, {
          cache: 'no-store',
        })

        const data = (await response.json()) as ClanWeaponsResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Impossible de charger les stats armes telemetry')
        }

        if (!cancelled) {
          setPayload(data as ClanWeaponsResponse)
        }
      } catch (loadError) {
        if (!cancelled) {
          setPayload(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger les stats armes telemetry'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadWeapons()

    setActiveCategory('Toutes')
    setActivePlayer('Tous')
    return () => {
      cancelled = true
    }
  }, [clanId, period])

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
            <h1 className="text-2xl font-bold text-gray-900">Les armes du clan</h1>
            <p className="text-sm text-gray-600">Classement des armes par joueur sur la période sélectionnée.</p>
          </div>
        </div>
      </header>

      <section className="mb-6 space-y-4 rounded border border-gray-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <MobileDropdownNav
            id="weapon-period-dropdown"
            label="Période"
            variant="compact"
            currentLabel={PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? 'Semaine'}
            visibilityClass="block"
            items={PERIOD_OPTIONS.map((p) => ({
              key: p.value,
              label: p.label,
              active: p.value === period,
              onSelect: () => setPeriod(p.value),
            }))}
          />

          <MobileDropdownNav
            id="weapon-category-dropdown"
            label="Catégorie"
            variant="compact"
            currentLabel={availableCategories.find((c) => c.value === activeCategory)?.label ?? activeCategory}
            visibilityClass="block"
            items={availableCategories.map((c) => ({
              key: c.value,
              label: c.label,
              active: c.value === activeCategory,
              onSelect: () => setActiveCategory(c.value),
            }))}
          />

          <MobileDropdownNav
            id="weapon-player-dropdown"
            label="Joueur"
            variant="compact"
            currentLabel={activePlayer}
            visibilityClass="block"
            items={availablePlayers.map((p) => ({
              key: p.value,
              label: p.label,
              active: p.value === activePlayer,
              onSelect: () => setActivePlayer(p.value),
            }))}
          />
        </div>

        {!loading && payload?.matchCount !== undefined ? (
          <p className="text-xs text-gray-500">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
              {payload.matchCount} match{payload.matchCount !== 1 ? 's' : ''}
            </span>
            {' '}pris en compte
          </p>
        ) : null}
      </section>

      {loading ? <p className="mb-4 text-sm text-gray-600">Chargement des stats armes...</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && payload?.note ? (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {payload.note}
        </p>
      ) : null}

      {!loading && !error ? (
        payload && payload.rows.length > 0 ? (
          <section className="app-panel p-4">
            {/* Mobile : vue cartes (< md) */}
            <div className="space-y-3 md:hidden">
              {paginatedRows.map((row) => {
                const headshotRate = row.kills > 0 ? (row.headshots / row.kills) * 100 : 0
                const podiumRank = podiumByRowKey.get(`${row.memberId}:${row.weaponName}`)
                const podiumTone =
                  podiumRank === 1
                    ? 'app-podium-badge--gold'
                    : podiumRank === 2
                      ? 'app-podium-badge--silver'
                      : 'app-podium-badge--bronze'

                return (
                  <div key={`${row.memberId}:${row.weaponName}`} className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{row.displayName}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <WeaponIcon id={row.weaponName} size="sm" />
                          <p className="truncate text-sm text-gray-600">{row.weaponLabel ?? row.weaponName}</p>
                          {podiumRank ? (
                            <span className={`app-podium-badge ${podiumTone} shrink-0`}>#{podiumRank}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-2xl font-bold tabular-nums text-gray-900">{formatNumber(row.kills)}</p>
                        <p className="text-xs text-gray-500">kills</p>
                        {typeof row.totalDamage === 'number' ? (
                          <>
                            <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">{formatNumber(Math.round(row.totalDamage))}</p>
                            <p className="text-xs text-gray-500">damages</p>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="rounded bg-gray-50 px-2 py-1.5 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">HS%</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-900">{formatPercent(headshotRate)}</p>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Précision</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-900">{formatPercent(row.accuracy)}</p>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Dist. moy.</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-900">{formatMeters(row.avgDistance)}</p>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Tirs</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-900">{formatNumber(row.shotsFired)}</p>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Touches</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-900">{formatNumber(row.hitsLanded)}</p>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1.5 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Matchs</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-900">{formatNumber(row.matchCount)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop : tableau complet (md+) */}
            <div className="app-table-shell hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="app-table-head text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('player')}>
                        Joueur{sortLabel('player')}
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('weapon')}>
                        Arme{sortLabel('weapon')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('kills')}>
                        Kills{sortLabel('kills')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('headshotRate')}>
                        Headshots %{sortLabel('headshotRate')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('shotsFired')}>
                        Tirs{sortLabel('shotsFired')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('hitsLanded')}>
                        Touches{sortLabel('hitsLanded')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('accuracy')}>
                        Precision{sortLabel('accuracy')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('avgDistance')}>
                        Distance moyenne{sortLabel('avgDistance')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('totalDamage')}>
                        Damages{sortLabel('totalDamage')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('maxDistance')}>
                        Distance max{sortLabel('maxDistance')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('matchCount')}>
                        Matchs{sortLabel('matchCount')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => {
                    const headshotRate = row.kills > 0 ? (row.headshots / row.kills) * 100 : 0
                    const podiumRank = podiumByRowKey.get(`${row.memberId}:${row.weaponName}`)
                    const podiumTone =
                      podiumRank === 1
                        ? 'app-podium-badge--gold'
                        : podiumRank === 2
                          ? 'app-podium-badge--silver'
                          : 'app-podium-badge--bronze'

                    return (
                      <tr key={`${row.memberId}:${row.weaponName}`} className="app-table-row">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{row.displayName}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-900">
                          <div className="flex items-center gap-2">
                            <WeaponIcon id={row.weaponName} size="sm" />
                            <span>{row.weaponLabel ?? row.weaponName}</span>
                            {podiumRank ? (
                              <span className={`app-podium-badge ${podiumTone}`}>#{podiumRank}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(row.kills)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(headshotRate)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.shotsFired)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.hitsLanded)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(row.accuracy)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMeters(row.avgDistance)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{typeof row.totalDamage === 'number' ? formatNumber(Math.round(row.totalDamage)) : '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{typeof row.maxDistance === 'number' ? formatMeters(row.maxDistance) : '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.matchCount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filteredRows.length > PAGE_SIZE ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-sm text-gray-600">
                <p>
                  Lignes {paginationRange.start}-{paginationRange.end} sur {filteredRows.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    Premiere
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                  >
                    Precedent
                  </button>
                  <span className="tabular-nums text-xs font-semibold text-gray-500">
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Suivant
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Derniere
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <p className="text-sm text-gray-600">Aucune donnee armes pour cette periode.</p>
        )
      ) : null}
    </main>
  )
}
