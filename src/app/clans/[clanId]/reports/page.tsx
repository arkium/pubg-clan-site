'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
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
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rapports du clan</h1>
            <p className="text-sm text-gray-600">Historique hebdomadaire et mensuel des performances.</p>
            <ClanSectionNav clanId={clanId} />
          </div>
        </div>
      </header>

      <section className="mb-6 rounded border border-gray-200 bg-white p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Type de rapport</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as ReportFilterType[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`clan-section-nav-link inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition ${
                type === value ? 'clan-section-nav-link--active shadow-sm' : ''
              }`}
            >
              {TYPE_LABELS[value]}
            </button>
          ))}
        </div>
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
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Voir détail
              </Link>
              <a
                href={`/api/clans/${clanId}/reports/${latestReport.id}/export?format=html`}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                    >
                      Voir détail
                    </Link>
                    <a
                      href={`/api/clans/${clanId}/reports/${report.id}/export?format=html`}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Exporter
                    </a>
                    <a
                      href={`mailto:?subject=Rapport PUBG clan&body=${encodeURIComponent(
                        `/clans/${clanId}/reports/${report.id}`
                      )}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
