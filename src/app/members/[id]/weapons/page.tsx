'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import MemberSectionNav from '@/components/MemberSectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'

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

const PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
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

  const podiumByWeapon = useMemo(() => {
    const rows = payload?.rows ?? []
    const topByKills = [...rows]
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
  }, [payload?.rows])

  const sortedRows = useMemo(() => {
    const rows = payload?.rows ?? []
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
  }, [payload?.rows, sortDirection, sortKey])

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
          title="Armes telemetry"
          subtitle="Top armes, headshots et distance moyenne sur la periode selectionnee."
          showBackButton={false}
          framed={false}
        />
        <MemberSectionNav memberId={memberId} framed={false} showMemberIdentity={false} />
      </section>

      <section className="mb-6 rounded border border-gray-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Periode</p>
        <SegmentedControl
          options={PERIOD_OPTIONS.map((option) => ({
            ...option,
            disabled: loading,
          }))}
          value={period}
          onChange={setPeriod}
          size="sm"
          fullWidthOnMobile
          className="w-full sm:w-auto"
        />
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
          <section className="app-panel p-4">
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
                        Precision{sortLabel('accuracy')}
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
                  {sortedRows.map((row) => {
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
          </section>
        ) : (
          <section className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p>Aucune donnee armes pour cette periode.</p>
            {payload?.member.clanId ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/clans/${payload.member.clanId}/settings/cron`}
                  className="app-btn app-btn--sm app-btn--secondary"
                >
                  Ouvrir Ops Cron
                </Link>
                <Link
                  href={`/clans/${payload.member.clanId}/telemetry/recoveries`}
                  className="app-btn app-btn--sm app-btn--secondary"
                >
                  Voir Recoveries telemetry
                </Link>
              </div>
            ) : null}
          </section>
        )
      ) : null}
    </main>
  )
}
