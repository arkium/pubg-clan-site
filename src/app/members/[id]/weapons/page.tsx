'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import StickySectionNav, { type StickySectionNavItem } from '@/components/ui/StickySectionNav'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import WeaponIcon from '@/components/ui/WeaponIcon'
import { getWeaponCategory, type WeaponCategory } from '@/lib/weapons/weapon-categories'

type TelemetryPeriod = 'week' | 'month' | 'all'

type MemberWeaponRow = {
  weaponName: string
  weaponLabel?: string
  kills: number
  headshots: number
  shotsFired: number
  hitsLanded: number
  accuracy: number
  avgDistance: number
  maxDistance?: number | null
  matchCount: number
}

type MemberWeaponsResponse = {
  ok: boolean
  member: {
    id: number
    displayName: string
    clanId: number | null
  }
  period: TelemetryPeriod
  periodKey: string
  count: number
  rows: MemberWeaponRow[]
  note: string | null
}

type SortKey = 'weapon' | 'kills' | 'headshotRate' | 'shotsFired' | 'hitsLanded' | 'accuracy' | 'avgDistance' | 'maxDistance' | 'matchCount'
type SortDirection = 'asc' | 'desc'

type MemberWeaponsContractResponse = {
  ok: boolean
  meta?: {
    period?: TelemetryPeriod
    periodKey?: string
    count?: number
  }
  data?: {
    member?: {
      id: number
      displayName: string
      clanId: number | null
    }
    rows?: MemberWeaponRow[]
    note?: string | null
  }
  member?: {
    id: number
    displayName: string
    clanId: number | null
  }
  period?: TelemetryPeriod
  periodKey?: string
  count?: number
  rows?: MemberWeaponRow[]
  note?: string | null
}

type WeaponMasteryEntry = {
  id: number
  memberId: number
  weaponId: string
  weaponName: string
  kills: number
  headshots: number
  knockouts: number
  shots: number
  hits: number
  damage: number
  longestKillDistance: number
  level: number
  xpTotal: number
  tier: number
  lastRefreshedAt: string
}

type WeaponMasteryResponse = {
  memberId: number
  weapons: WeaponMasteryEntry[]
}

type MasterySortKey = 'weapon' | 'kills' | 'knockouts' | 'damage' | 'headshots' | 'longestKillDistance' | 'level'
type WeaponCategoryFilter = 'ALL' | WeaponCategory

const PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

const PAGE_SIZE = 10

const WEAPON_CATEGORY_OPTIONS: Array<{ value: WeaponCategoryFilter; label: string }> = [
  { value: 'ALL', label: 'Toutes catégories' },
  { value: 'AR', label: 'AR - Fusils d\'assaut' },
  { value: 'DMR', label: 'DMR - Fusils de précision' },
  { value: 'SR', label: 'SR - Snipers' },
  { value: 'SMG', label: 'SMG - Pistolets-mitrailleurs' },
  { value: 'LMG', label: 'LMG - Mitrailleuses' },
  { value: 'SG', label: 'SG - Fusils à pompe' },
  { value: 'PISTOL', label: 'PISTOL - Pistolets' },
  { value: 'MELEE', label: 'MELEE - Mêlée' },
  { value: 'THROWABLE', label: 'THROWABLE - Explosifs' },
  { value: 'SPECIAL', label: 'SPECIAL - Spécial' },
  { value: 'OTHER', label: 'OTHER - Autre' },
]

const MEMBER_WEAPONS_SECTION_LINKS: StickySectionNavItem[] = [
  { id: 'sec-member-weapons-mastery', label: 'Maîtrise armes', icon: 'combat' },
  { id: 'sec-member-weapons-telemetry', label: 'Stats télémétrie', icon: 'other' },
]

function parseMemberId(value: string | string[] | undefined) {
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

function formatDateTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('fr-FR')
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'fr-FR', { sensitivity: 'base' })
}

function compareNumber(left: number, right: number) {
  return left - right
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  if ('error' in payload) {
    const errorValue = (payload as { error?: unknown }).error
    if (typeof errorValue === 'string' && errorValue.trim()) {
      return errorValue
    }

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

function normalizeWeaponsPayload(
  payload: MemberWeaponsContractResponse,
  fallbackPeriod: TelemetryPeriod
): MemberWeaponsResponse | null {
  const period = payload.meta?.period ?? payload.period ?? fallbackPeriod
  const periodKey = payload.meta?.periodKey ?? payload.periodKey
  const count = payload.meta?.count ?? payload.count
  const member = payload.data?.member ?? payload.member
  const rows = payload.data?.rows ?? payload.rows
  const note = payload.data?.note ?? payload.note ?? null

  if (!member || !periodKey || typeof count !== 'number' || !Array.isArray(rows)) {
    return null
  }

  return {
    ok: true,
    member,
    period,
    periodKey,
    count,
    rows,
    note,
  }
}

export default function MemberWeaponsPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<MemberWeaponsResponse | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('kills')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedCategory, setSelectedCategory] = useState<WeaponCategoryFilter>('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [masteryRows, setMasteryRows] = useState<WeaponMasteryEntry[]>([])
  const [masteryLoading, setMasteryLoading] = useState(true)
  const [masteryRefreshing, setMasteryRefreshing] = useState(false)
  const [masteryError, setMasteryError] = useState('')
  const [masterySortKey, setMasterySortKey] = useState<MasterySortKey>('kills')
  const [masterySortDirection, setMasterySortDirection] = useState<SortDirection>('desc')
  const [masteryCurrentPage, setMasteryCurrentPage] = useState(1)

  const periodLabel = useMemo(() => {
    return PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Semaine'
  }, [period])

  const latestMasteryRefreshAt = useMemo(() => {
    if (masteryRows.length === 0) {
      return null
    }

    let latest: string | null = null
    let latestTime = -Infinity

    for (const row of masteryRows) {
      const timestamp = new Date(row.lastRefreshedAt).getTime()
      if (!Number.isNaN(timestamp) && timestamp > latestTime) {
        latestTime = timestamp
        latest = row.lastRefreshedAt
      }
    }

    return latest
  }, [masteryRows])

  const podiumByWeapon = useMemo(() => {
    const rows = payload?.rows ?? []
    const filteredRows =
      selectedCategory === 'ALL'
        ? rows
        : rows.filter((row) => getWeaponCategory(row.weaponLabel ?? row.weaponName) === selectedCategory)
    const topByKills = [...filteredRows]
      .sort((left, right) => {
        if (right.kills !== left.kills) {
          return right.kills - left.kills
        }

        return (left.weaponLabel ?? left.weaponName).localeCompare(
          right.weaponLabel ?? right.weaponName,
          'fr-FR',
          { sensitivity: 'base' }
        )
      })
      .slice(0, 3)

    return new Map(topByKills.map((row, index) => [row.weaponName, index + 1]))
  }, [payload?.rows, selectedCategory])

  const filteredRows = useMemo(() => {
    const rows = payload?.rows ?? []
    if (selectedCategory === 'ALL') {
      return rows
    }

    return rows.filter((row) => getWeaponCategory(row.weaponLabel ?? row.weaponName) === selectedCategory)
  }, [payload?.rows, selectedCategory])

  const sortedRows = useMemo(() => {
    const rows = filteredRows
    const factor = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((left, right) => {
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
  }, [filteredRows, sortDirection, sortKey])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  }, [sortedRows.length])

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    return sortedRows.slice(startIndex, startIndex + PAGE_SIZE)
  }, [sortedRows, currentPage])

  const paginationRange = useMemo(() => {
    if (sortedRows.length === 0) {
      return { start: 0, end: 0 }
    }

    const start = (currentPage - 1) * PAGE_SIZE + 1
    const end = Math.min(currentPage * PAGE_SIZE, sortedRows.length)
    return { start, end }
  }, [currentPage, sortedRows.length])

  function handleSortClick(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setSortDirection(nextKey === 'weapon' ? 'asc' : 'desc')
  }

  function sortLabel(key: SortKey) {
    if (sortKey !== key) {
      return ''
    }

    return sortDirection === 'asc' ? ' ▲' : ' ▼'
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [period, selectedCategory])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const sortedMasteryRows = useMemo(() => {
    const rows =
      selectedCategory === 'ALL'
        ? masteryRows
        : masteryRows.filter((row) => getWeaponCategory(row.weaponName) === selectedCategory)
    const factor = masterySortDirection === 'asc' ? 1 : -1

    return [...rows].sort((left, right) => {
      if (masterySortKey === 'weapon') {
        return compareText(left.weaponName, right.weaponName) * factor
      }

      if (masterySortKey === 'kills') {
        const compare = compareNumber(left.kills, right.kills)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponName, right.weaponName)
      }

      if (masterySortKey === 'headshots') {
        const compare = compareNumber(left.headshots, right.headshots)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponName, right.weaponName)
      }

      if (masterySortKey === 'knockouts') {
        const compare = compareNumber(left.knockouts, right.knockouts)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponName, right.weaponName)
      }

      if (masterySortKey === 'damage') {
        const compare = compareNumber(left.damage, right.damage)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponName, right.weaponName)
      }

      if (masterySortKey === 'longestKillDistance') {
        const compare = compareNumber(left.longestKillDistance, right.longestKillDistance)
        if (compare !== 0) {
          return compare * factor
        }
        return compareText(left.weaponName, right.weaponName)
      }

      const compare = compareNumber(left.level, right.level)
      if (compare !== 0) {
        return compare * factor
      }
      return compareText(left.weaponName, right.weaponName)
    })
  }, [masteryRows, masterySortDirection, masterySortKey, selectedCategory])

  const totalMasteryPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedMasteryRows.length / PAGE_SIZE))
  }, [sortedMasteryRows.length])

  const paginatedMasteryRows = useMemo(() => {
    const startIndex = (masteryCurrentPage - 1) * PAGE_SIZE
    return sortedMasteryRows.slice(startIndex, startIndex + PAGE_SIZE)
  }, [masteryCurrentPage, sortedMasteryRows])

  const masteryPaginationRange = useMemo(() => {
    if (sortedMasteryRows.length === 0) {
      return { start: 0, end: 0 }
    }

    const start = (masteryCurrentPage - 1) * PAGE_SIZE + 1
    const end = Math.min(masteryCurrentPage * PAGE_SIZE, sortedMasteryRows.length)
    return { start, end }
  }, [masteryCurrentPage, sortedMasteryRows.length])

  function handleMasterySortClick(nextKey: MasterySortKey) {
    if (masterySortKey === nextKey) {
      setMasterySortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setMasterySortKey(nextKey)
    setMasterySortDirection(nextKey === 'weapon' ? 'asc' : 'desc')
  }

  function masterySortLabel(key: MasterySortKey) {
    if (masterySortKey !== key) {
      return ''
    }

    return masterySortDirection === 'asc' ? ' ▲' : ' ▼'
  }

  useEffect(() => {
    setMasteryCurrentPage(1)
  }, [masterySortKey, masterySortDirection, selectedCategory])

  useEffect(() => {
    if (masteryCurrentPage > totalMasteryPages) {
      setMasteryCurrentPage(totalMasteryPages)
    }
  }, [masteryCurrentPage, totalMasteryPages])

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadWeaponMastery() {
      try {
        setMasteryLoading(true)
        setMasteryError('')

        const response = await fetch(`/api/members/${memberId}/weapon-mastery`, {
          cache: 'no-store',
        })

        const payload = (await response.json()) as WeaponMasteryResponse | { error?: string }

        if (!response.ok || !('weapons' in payload) || !Array.isArray(payload.weapons)) {
          throw new Error(
            'error' in payload && typeof payload.error === 'string'
              ? payload.error
              : 'Impossible de charger la maitrise armes'
          )
        }

        if (!cancelled) {
          setMasteryRows(payload.weapons)
        }
      } catch (error) {
        if (!cancelled) {
          setMasteryRows([])
          setMasteryError(
            error instanceof Error ? error.message : 'Impossible de charger la maitrise armes'
          )
        }
      } finally {
        if (!cancelled) {
          setMasteryLoading(false)
        }
      }
    }

    void loadWeaponMastery()

    return () => {
      cancelled = true
    }
  }, [memberId, reloadNonce])

  async function refreshWeaponMastery() {
    if (!memberId) {
      return
    }

    try {
      setMasteryRefreshing(true)
      setMasteryError('')

      const response = await fetch(`/api/members/${memberId}/weapon-mastery`, {
        method: 'POST',
      })
      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Rafraîchissement de la maîtrise impossible')
      }

      setReloadNonce((current) => current + 1)
    } catch (error) {
      setMasteryError(
        error instanceof Error ? error.message : 'Rafraîchissement de la maîtrise impossible'
      )
    } finally {
      setMasteryRefreshing(false)
    }
  }

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadWeapons() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/members/${memberId}/telemetry/weapons?period=${period}`, {
          cache: 'no-store',
        })

        const data = (await response.json()) as MemberWeaponsContractResponse

        if (!response.ok) {
          throw new Error(extractErrorMessage(data, 'Impossible de charger les stats armes du membre'))
        }

        const normalized = normalizeWeaponsPayload(data, period)

        if (!normalized) {
          throw new Error('Format de reponse telemetry invalide')
        }

        if (!cancelled) {
          setPayload(normalized)
        }
      } catch (loadError) {
        if (!cancelled) {
          setPayload(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger les stats armes du membre'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadWeapons()

    return () => {
      cancelled = true
    }
  }, [memberId, period, reloadNonce])

  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">ID joueur invalide.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <MemberPageHeader
          title="Vos armes"
          subtitle="Top armes, headshots et distance moyenne sur la période sélectionnée."
          showBackButton={false}
          framed={false}
        />

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <MobileDropdownNav
              id="member-weapons-period-filter"
              label="Période"
              currentLabel={PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Sélectionner'}
              items={PERIOD_OPTIONS.map((option) => ({
                key: `period-${option.value}`,
                label: option.label,
                active: period === option.value,
                onSelect: () => setPeriod(option.value),
              }))}
              visibilityClass=""
              className="w-full"
            />
          </div>

          <div className="min-w-0">
            <MobileDropdownNav
              id="member-weapons-category-filter"
              label="Catégorie"
              currentLabel={WEAPON_CATEGORY_OPTIONS.find((option) => option.value === selectedCategory)?.label ?? 'Sélectionner'}
              items={WEAPON_CATEGORY_OPTIONS.map((option) => ({
                key: `category-${option.value}`,
                label: option.label,
                active: selectedCategory === option.value,
                onSelect: () => setSelectedCategory(option.value),
              }))}
              visibilityClass=""
              className="w-full"
            />
          </div>
        </div>
      </section>

      <StickySectionNav
        ariaLabel="Navigation des sections armes"
        items={MEMBER_WEAPONS_SECTION_LINKS}
        topClassName="top-24"
        activeOffset={260}
        className="mb-6"
      />

      <section id="sec-member-weapons-mastery" className="mb-6 app-panel scroll-mt-40 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Maîtrise armes (carrière)</h2>
            <p className="text-sm text-gray-600">
              Source PUBG weapon mastery : kills, neutralisations, dégâts, headshots, distance et niveau global par arme.
            </p>
            {latestMasteryRefreshAt ? (
              <p className="mt-1 text-xs text-gray-500">
                Dernière synchro : {formatDateTime(latestMasteryRefreshAt)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="app-btn app-btn--sm app-btn--secondary"
            disabled={masteryLoading || masteryRefreshing}
            onClick={() => {
              void refreshWeaponMastery()
            }}
          >
            {masteryRefreshing ? 'Rafraîchissement...' : 'Rafraîchir'}
          </button>
        </div>

        {masteryError ? (
          <p className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {masteryError}
          </p>
        ) : null}

        {masteryLoading ? (
          <p className="text-sm text-gray-600">Chargement de la maitrise armes...</p>
        ) : null}

        {!masteryLoading && masteryRows.length === 0 ? (
          <p className="text-sm text-gray-600">Aucune donnée de maîtrise disponible.</p>
        ) : null}

        {!masteryLoading && masteryRows.length > 0 ? (
          <>
            <div className="app-table-shell overflow-x-auto">
              <table className="min-w-full text-sm">
              <thead className="app-table-head text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2">
                    <button type="button" className="font-semibold" onClick={() => handleMasterySortClick('weapon')}>
                      Arme{masterySortLabel('weapon')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" className="font-semibold" onClick={() => handleMasterySortClick('kills')}>
                      Kills{masterySortLabel('kills')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" className="font-semibold" onClick={() => handleMasterySortClick('knockouts')}>
                      Neutralisations{masterySortLabel('knockouts')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" className="font-semibold" onClick={() => handleMasterySortClick('damage')}>
                      Dégâts{masterySortLabel('damage')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-semibold"
                      title="Coups en tête portés avec cette arme (donnée API PUBG), pas des kills en headshot"
                      onClick={() => handleMasterySortClick('headshots')}
                    >
                      Headshots{masterySortLabel('headshots')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" className="font-semibold" onClick={() => handleMasterySortClick('longestKillDistance')}>
                      Distance{masterySortLabel('longestKillDistance')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" className="font-semibold" onClick={() => handleMasterySortClick('level')}>
                      Niveau{masterySortLabel('level')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedMasteryRows.map((row) => {
                  return (
                    <tr key={row.weaponId} className="app-table-row">
                      <td className="px-3 py-2 text-gray-900">
                        <div className="flex items-center gap-2">
                          <WeaponIcon id={row.weaponId} label={row.weaponName} size="sm" />
                          <span>{row.weaponName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(row.kills)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.knockouts)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(Math.round(row.damage))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.headshots)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMeters(row.longestKillDistance)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.level)}</td>
                    </tr>
                  )
                })}
              </tbody>
              </table>
            </div>

            {sortedMasteryRows.length > PAGE_SIZE ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-sm text-gray-600">
                <p>
                  Lignes {masteryPaginationRange.start}-{masteryPaginationRange.end} sur {sortedMasteryRows.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setMasteryCurrentPage(1)}
                    disabled={masteryCurrentPage === 1}
                  >
                    Premiere
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setMasteryCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={masteryCurrentPage === 1}
                  >
                    Precedent
                  </button>
                  <span className="tabular-nums text-xs font-semibold text-gray-500">
                    Page {masteryCurrentPage} / {totalMasteryPages}
                  </span>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setMasteryCurrentPage((page) => Math.min(totalMasteryPages, page + 1))}
                    disabled={masteryCurrentPage === totalMasteryPages}
                  >
                    Suivant
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setMasteryCurrentPage(totalMasteryPages)}
                    disabled={masteryCurrentPage === totalMasteryPages}
                  >
                    Derniere
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {loading ? <p className="mb-4 text-sm text-gray-600">Chargement des stats armes...</p> : null}
      {error ? (
        <section className="mb-4 rounded border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setReloadNonce((current) => current + 1)}
            className="app-btn app-btn--sm app-btn--secondary mt-3"
          >
            Reessayer
          </button>
        </section>
      ) : null}
      {!loading && !error && payload?.note ? (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {payload.note}
        </p>
      ) : null}

      {!loading && !error ? (
        payload && payload.rows.length > 0 ? (
          <section id="sec-member-weapons-telemetry" className="app-panel scroll-mt-40 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Stats armes (télémétrie)</h2>
              <p className="text-sm text-gray-600">
                Période active : {periodLabel}. Performance détaillée par arme sur la catégorie sélectionnée.
              </p>
            </div>
            <div className="app-table-shell overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="app-table-head text-left text-xs uppercase tracking-wide">
                  <tr>
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
                        Précision{sortLabel('accuracy')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="font-semibold" onClick={() => handleSortClick('avgDistance')}>
                        Distance moyenne{sortLabel('avgDistance')}
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
                    const podiumRank = podiumByWeapon.get(row.weaponName)
                    const podiumTone =
                      podiumRank === 1
                        ? 'app-podium-badge--gold'
                        : podiumRank === 2
                          ? 'app-podium-badge--silver'
                          : 'app-podium-badge--bronze'

                    return (
                      <tr key={row.weaponName} className="app-table-row">
                        <td className="px-3 py-2 text-gray-900">
                          <div className="flex items-center gap-2">
                            <WeaponIcon id={row.weaponName} size="sm" />
                            <span>{row.weaponLabel ?? row.weaponName}</span>
                            {podiumRank ? (
                              <span className={`app-podium-badge ${podiumTone}`}>
                                #{podiumRank}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(row.kills)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(headshotRate)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.shotsFired)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.hitsLanded)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(row.accuracy)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMeters(row.avgDistance)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{typeof row.maxDistance === 'number' ? formatMeters(row.maxDistance) : '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.matchCount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {sortedRows.length > PAGE_SIZE ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-sm text-gray-600">
                <p>
                  Lignes {paginationRange.start}-{paginationRange.end} sur {sortedRows.length}
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
        ) : null
      ) : null}
    </main>
  )
}
