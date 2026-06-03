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
  kills: number
  headshots: number
  avgDistance: number
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
          <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Arme</th>
                    <th className="px-3 py-2 text-right">Kills</th>
                    <th className="px-3 py-2 text-right">Headshots %</th>
                    <th className="px-3 py-2 text-right">Distance moyenne</th>
                    <th className="px-3 py-2 text-right">Matchs</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.rows.map((row) => {
                    const headshotRate = row.kills > 0 ? (row.headshots / row.kills) * 100 : 0

                    return (
                      <tr key={row.weaponName} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-900">{row.weaponName}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(row.kills)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(headshotRate)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMeters(row.avgDistance)}</td>
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
