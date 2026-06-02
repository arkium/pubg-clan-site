'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
import SegmentedControl from '@/components/ui/SegmentedControl'

type TelemetryPeriod = 'week' | 'month' | 'all'

type ClanWeaponRow = {
  memberId: number
  displayName: string
  pubgPlayerName: string
  weaponName: string
  kills: number
  headshots: number
  avgDistance: number
  matchCount: number
}

type ClanWeaponsResponse = {
  ok: boolean
  clanId: number
  period: TelemetryPeriod
  periodKey: string
  count: number
  rows: ClanWeaponRow[]
  note: string | null
}

const PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatMeters(value: number) {
  return `${value.toFixed(1)} m`
}

export default function ClanTelemetryWeaponsPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [period, setPeriod] = useState<TelemetryPeriod>('week')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<ClanWeaponsResponse | null>(null)

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
            <h1 className="text-2xl font-bold text-gray-900">Armes telemetry clan</h1>
            <p className="text-sm text-gray-600">Classement des armes par joueur sur la periode selectionnee.</p>
            <ClanSectionNav clanId={clanId} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/clans/${clanId}/stats`} className="app-btn app-btn--sm app-btn--secondary">
              Stats globales
            </Link>
            <Link href={`/clans/${clanId}/stats/heatmap-kills`} className="app-btn app-btn--sm app-btn--secondary">
              Heatmap kills
            </Link>
          </div>
        </div>
      </header>

      <section className="mb-6 rounded border border-gray-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Periode</p>
        <SegmentedControl
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
          size="sm"
          fullWidthOnMobile
          className="w-full sm:w-auto"
        />
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
          <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Joueur</th>
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
                      <tr key={`${row.memberId}:${row.weaponName}`} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{row.displayName}</div>
                          <div className="text-xs text-gray-500">@{row.pubgPlayerName}</div>
                        </td>
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
          <p className="text-sm text-gray-600">Aucune donnee armes pour cette periode.</p>
        )
      ) : null}
    </main>
  )
}
