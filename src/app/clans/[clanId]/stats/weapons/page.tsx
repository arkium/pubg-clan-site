'use client'

import { Crosshair } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { DockingToolbar } from '@/components/ui/DockingToolbar'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'
import WeaponIcon from '@/components/ui/WeaponIcon'
import VehicleIcon from '@/components/ui/VehicleIcon'
import { weaponIconUrl, vehicleIconUrl } from '@/lib/pubg-assets'
import { isVehicleKey } from '@/lib/pubg-assets/vehicle-detection'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import RankCell from '@/components/ui/RankCell'
import SortableTh from '@/components/ui/SortableTh'
import { useTableSort } from '@/hooks/useTableSort'

type TelemetryPeriod = StandardPeriod

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

const PAGE_SIZE = 10

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'kills', label: 'Kills' },
  { value: 'totalDamage', label: 'Dégâts' },
  { value: 'headshotRate', label: 'HS%' },
  { value: 'accuracy', label: 'Précision' },
  { value: 'avgDistance', label: 'Dist. moy.' },
  { value: 'shotsFired', label: 'Tirs' },
  { value: 'hitsLanded', label: 'Touches' },
  { value: 'matchCount', label: 'Matchs' },
]

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

const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function formatPercent(value: number) {
  return `${oneDecimal.format(value)} %`
}

function formatMeters(value: number) {
  return `${oneDecimal.format(value)} m`
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'fr-FR', { sensitivity: 'base' })
}

function compareNumber(left: number, right: number) {
  return left - right
}

function WeaponWatermark({ weaponName }: { weaponName: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return null
  }

  return (
    <img
      src={isVehicleKey(weaponName) ? vehicleIconUrl(weaponName) : weaponIconUrl(weaponName)}
      alt=""
      aria-hidden="true"
      className="pubg-icon-filter pointer-events-none absolute -right-4 -top-4 h-32 w-32 rotate-[-12deg] object-contain opacity-80"
      onError={() => setFailed(true)}
    />
  )
}

export default function ClanTelemetryWeaponsPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<ClanWeaponsResponse | null>(null)
  // Tri par les en-têtes (docs/TODO/refonte-ui.md §4.B) ; joueur et arme commencent de A à Z.
  const {
    sortKey,
    sortDir: sortDirection,
    onSort: handleSortClick,
    colTint,
    setSort,
  } = useTableSort<SortKey>('kills', 'desc', (key) => (key === 'player' || key === 'weapon' ? 'asc' : 'desc'))
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

  function selectSortDescending(key: SortKey) {
    setSort({ key, direction: 'desc' })
  }

  const sortHeader = { sortKey, sortDir: sortDirection, onSort: handleSortClick }

  function sortedCellClass(key: SortKey) {
    return `px-[9px] py-2 text-right tabular-nums ${sortKey === key ? 'font-bold text-gray-900' : 'text-gray-700'}`
  }

  // Carte mobile : la tuile du critère trié prend l'accent, comme la colonne triée du tableau.
  function statTileClass(key: SortKey) {
    return sortKey === key
      ? 'rounded border border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] px-1.5 py-1 text-center'
      : 'rounded bg-gray-50 px-2 py-1.5 text-center'
  }

  function statLabelClass(key: SortKey) {
    return sortKey === key
      ? 'text-[9px] font-bold uppercase tracking-wide text-[var(--theme-ui-accent-text)] whitespace-nowrap'
      : 'text-[10px] font-medium uppercase tracking-wide text-gray-500'
  }

  function statValueClass(key: SortKey) {
    return sortKey === key
      ? 'text-xs font-extrabold tabular-nums text-[var(--theme-ui-accent-text)] whitespace-nowrap'
      : 'text-sm font-semibold tabular-nums text-gray-900'
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
    if (!clanId || !periodReady) {
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
  }, [clanId, period, periodReady])

  if (!clanId) {
    return (
      <div className="app-container app-main flex-1">
      <NavigationTrail
        currentLabel="Armes du clan"
        currentHref={`/clans/${clanId}/stats/weapons`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />
        <p className="text-sm text-red-600">Clan invalide.</p>
      </div>
    )
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Armes du clan"
          currentHref={`/clans/${clanId}/stats/weapons`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/weapons.jpg')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Crosshair className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Les armes du clan</h1>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
              Classement des armes par joueur.
            </p>
          </div>
        </header>
      </div>

      <DockingToolbar ariaLabel="Filtres des armes du clan">
        {({ isSticky, compact }) => (
          <div className="flex w-full flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
              {!isSticky && !loading && payload?.matchCount !== undefined ? (
                <p className="text-xs text-gray-500">
                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                    {payload.matchCount} match{payload.matchCount !== 1 ? 's' : ''}
                  </span>
                  {' '}pris en compte
                </p>
              ) : null}
            </div>

            {!compact && (
              <div className="grid gap-3 sm:grid-cols-3">
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

                <MobileDropdownNav
                  id="weapon-sort-dropdown"
                  label="Trier par (décroissant)"
                  variant="compact"
                  currentLabel={SORT_OPTIONS.find((s) => s.value === sortKey)?.label ?? 'Kills'}
                  visibilityClass="md:hidden"
                  items={SORT_OPTIONS.map((s) => ({
                    key: s.value,
                    label: s.label,
                    active: s.value === sortKey && sortDirection === 'desc',
                    onSelect: () => selectSortDescending(s.value),
                  }))}
                />
              </div>
            )}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter">
        {loading && !payload ? <p className="mb-4 text-sm text-gray-600">Chargement des stats armes...</p> : null}
        {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
        {!error && payload?.note ? (
          <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {payload.note}
          </p>
        ) : null}

        {/* Rechargement : les résultats précédents restent affichés, estompés (la page ne se replie pas). */}
        {!error && (!loading || payload) ? (
          payload && payload.rows.length > 0 ? (
            <section aria-busy={loading} className={`app-panel p-4${loading ? ' opacity-60' : ''}`}>
              {/* Mobile : vue cartes (< md) */}
              <div className="space-y-3 md:hidden">
                {paginatedRows.map((row) => {
                  const headshotRate = row.kills > 0 ? (row.headshots / row.kills) * 100 : 0
                  const podiumRank = podiumByRowKey.get(`${row.memberId}:${row.weaponName}`)

                  return (
                    <div
                      key={`${row.memberId}:${row.weaponName}`}
                      className="relative overflow-hidden app-panel p-3"
                    >
                      <WeaponWatermark weaponName={row.weaponName} />
                      <div className="relative">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-base font-semibold text-gray-900">{row.weaponLabel ?? row.weaponName}</p>
                              {podiumRank ? <RankCell rank={podiumRank} size="xs" /> : null}
                            </div>
                            <p className="mt-0.5 truncate text-sm text-gray-600">{row.displayName}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          <div className={statTileClass('kills')}>
                            <p className={statLabelClass('kills')}>Kills</p>
                            <p className={statValueClass('kills')}>{formatNumber(row.kills)}</p>
                          </div>
                          <div className={statTileClass('totalDamage')}>
                            <p className={statLabelClass('totalDamage')}>Dégâts</p>
                            <p className={statValueClass('totalDamage')}>
                              {typeof row.totalDamage === 'number' ? formatNumber(Math.round(row.totalDamage)) : '-'}
                            </p>
                          </div>
                          <div className={statTileClass('headshotRate')}>
                            <p className={statLabelClass('headshotRate')}>HS%</p>
                            <p className={statValueClass('headshotRate')}>{formatPercent(headshotRate)}</p>
                          </div>
                          <div className={statTileClass('accuracy')}>
                            <p className={statLabelClass('accuracy')}>Précision</p>
                            <p className={statValueClass('accuracy')}>{formatPercent(row.accuracy)}</p>
                          </div>
                          <div className={statTileClass('avgDistance')}>
                            <p className={statLabelClass('avgDistance')}>Dist. moy.</p>
                            <p className={statValueClass('avgDistance')}>{formatMeters(row.avgDistance)}</p>
                          </div>
                          <div className={statTileClass('shotsFired')}>
                            <p className={statLabelClass('shotsFired')}>Tirs</p>
                            <p className={statValueClass('shotsFired')}>{formatNumber(row.shotsFired)}</p>
                          </div>
                          <div className={statTileClass('hitsLanded')}>
                            <p className={statLabelClass('hitsLanded')}>Touches</p>
                            <p className={statValueClass('hitsLanded')}>{formatNumber(row.hitsLanded)}</p>
                          </div>
                          <div className={statTileClass('matchCount')}>
                            <p className={statLabelClass('matchCount')}>Matchs</p>
                            <p className={statValueClass('matchCount')}>{formatNumber(row.matchCount)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop : tableau complet (md+) */}
              <div className="app-table-shell hidden overflow-x-auto md:block">
                <table className="min-w-full text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <SortableTh {...sortHeader} column="player" align="left" className="pl-3">Joueur</SortableTh>
                      <SortableTh {...sortHeader} column="weapon" align="left">Arme</SortableTh>
                      <SortableTh {...sortHeader} column="kills">Kills</SortableTh>
                      <SortableTh {...sortHeader} column="headshotRate" title="Part des kills en headshot">Headshots</SortableTh>
                      <SortableTh {...sortHeader} column="shotsFired">Tirs</SortableTh>
                      <SortableTh {...sortHeader} column="hitsLanded">Touches</SortableTh>
                      <SortableTh {...sortHeader} column="accuracy">Précision</SortableTh>
                      <SortableTh {...sortHeader} column="avgDistance" title="Distance moyenne des kills">Dist. moy.</SortableTh>
                      <SortableTh {...sortHeader} column="totalDamage">Dégâts</SortableTh>
                      <SortableTh {...sortHeader} column="maxDistance" title="Kill le plus lointain">Dist. max</SortableTh>
                      <SortableTh {...sortHeader} column="matchCount" className="pr-3">Matchs</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row) => {
                      const headshotRate = row.kills > 0 ? (row.headshots / row.kills) * 100 : 0
                      const podiumRank = podiumByRowKey.get(`${row.memberId}:${row.weaponName}`)

                      return (
                        <tr key={`${row.memberId}:${row.weaponName}`} className="app-table-row">
                          <td className="py-2 pl-3 pr-[9px]" style={{ backgroundColor: colTint('player') }}>
                            <div className="font-medium text-gray-900">{row.displayName}</div>
                          </td>
                          <td className="px-[9px] py-2 text-gray-900" style={{ backgroundColor: colTint('weapon') }}>
                            <div className="flex items-center gap-3">
                              {isVehicleKey(row.weaponName) ? (
                                <VehicleIcon id={row.weaponName} size="3xl" />
                              ) : (
                                <WeaponIcon id={row.weaponName} size="2xl" />
                              )}
                              <span>{row.weaponLabel ?? row.weaponName}</span>
                              {podiumRank ? <RankCell rank={podiumRank} size="xs" /> : null}
                            </div>
                          </td>
                          <td className={sortedCellClass('kills')} style={{ backgroundColor: colTint('kills') }}>{formatNumber(row.kills)}</td>
                          <td className={sortedCellClass('headshotRate')} style={{ backgroundColor: colTint('headshotRate') }}>{formatPercent(headshotRate)}</td>
                          <td className={sortedCellClass('shotsFired')} style={{ backgroundColor: colTint('shotsFired') }}>{formatNumber(row.shotsFired)}</td>
                          <td className={sortedCellClass('hitsLanded')} style={{ backgroundColor: colTint('hitsLanded') }}>{formatNumber(row.hitsLanded)}</td>
                          <td className={sortedCellClass('accuracy')} style={{ backgroundColor: colTint('accuracy') }}>{formatPercent(row.accuracy)}</td>
                          <td className={sortedCellClass('avgDistance')} style={{ backgroundColor: colTint('avgDistance') }}>{formatMeters(row.avgDistance)}</td>
                          <td className={sortedCellClass('totalDamage')} style={{ backgroundColor: colTint('totalDamage') }}>{typeof row.totalDamage === 'number' ? formatNumber(Math.round(row.totalDamage)) : '-'}</td>
                          <td className={sortedCellClass('maxDistance')} style={{ backgroundColor: colTint('maxDistance') }}>{typeof row.maxDistance === 'number' ? formatMeters(row.maxDistance) : '-'}</td>
                          <td className={`${sortedCellClass('matchCount')} pr-3`} style={{ backgroundColor: colTint('matchCount') }}>{formatNumber(row.matchCount)}</td>
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
                  <div className="app-pagination">
                    <button
                      type="button"
                      className="app-pagination-button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      aria-label="Page précédente"
                      title="Page précédente"
                    >
                      ←
                    </button>
                    <span className="app-pagination-label">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="app-pagination-button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      aria-label="Page suivante"
                      title="Page suivante"
                    >
                      →
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <p className="text-sm text-gray-600">Aucune donnée d’arme pour cette période.</p>
          )
        ) : null}
      </div>
    </div>
  )
}
