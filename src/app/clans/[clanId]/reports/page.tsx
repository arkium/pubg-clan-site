'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ReportHighlights from '@/components/report/ReportHighlights'
import { useReports } from '@/hooks/useReports'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { ReportFilterType } from '@/types/reports'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const TYPE_LABELS: Record<ReportFilterType, string> = {
  all: 'Tous',
  weekly: 'Semaine',
  monthly: 'Mois',
}

export default function ClanReportsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const [type, setType] = useState<ReportFilterType>('all')
  const { reports, totalCount, loading, error } = useReports(clanId, type)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  if (!clanId) {
    return null
  }

  const latestReport = reports[0]

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapports du clan</h1>
          <p className="text-sm text-gray-600">Historique hebdomadaire et mensuel des performances.</p>
        </div>
        <Link
          href={`/clans/${clanId}/leaderboard`}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Voir le classement
        </Link>
      </div>

      <section className="mb-6 rounded border border-gray-200 bg-white p-4">
        <label className="text-sm text-gray-700">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Type de rapport
          </span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ReportFilterType)}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {(Object.keys(TYPE_LABELS) as ReportFilterType[]).map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading ? <p className="mb-6 text-sm text-gray-600">Chargement des rapports...</p> : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && latestReport ? (
        <section className="mb-6 rounded border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Preview du dernier rapport
              </p>
              <h2 className="text-lg font-semibold text-gray-900">
                {latestReport.type === 'weekly' ? 'Rapport hebdo' : 'Rapport mensuel'} ·{' '}
                {latestReport.periodStart.slice(0, 10)}
              </h2>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/clans/${clanId}/reports/${latestReport.id}`}
                className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Voir détail
              </Link>
              <a
                href={`/api/clans/${clanId}/reports/${latestReport.id}/export?format=html`}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Exporter
              </a>
            </div>
          </div>
          <ReportHighlights highlights={latestReport.highlights} />
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Historique</h2>
            <span className="text-xs text-gray-500">{totalCount} rapport(s)</span>
          </div>

          {reports.length === 0 ? (
            <p className="text-sm text-gray-600">
              Aucun rapport généré pour l’instant. Les cron jobs créeront les prochains rapports
              automatiquement.
            </p>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <article
                  key={report.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-100 p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {report.type === 'weekly' ? 'Hebdo' : 'Mensuel'} ·{' '}
                      {report.periodStart.slice(0, 10)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {report.totalMatches} matchs · {report.totalKills} kills ·{' '}
                      {(report.avgWinRate * 100).toFixed(1)}% WR
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/clans/${clanId}/reports/${report.id}`}
                      className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Voir détail
                    </Link>
                    <a
                      href={`/api/clans/${clanId}/reports/${report.id}/export?format=html`}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Exporter
                    </a>
                    <a
                      href={`mailto:?subject=Rapport PUBG clan&body=${encodeURIComponent(
                        `/clans/${clanId}/reports/${report.id}`
                      )}`}
                      className="rounded border border-purple-300 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50"
                    >
                      Partager
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </main>
  )
}
