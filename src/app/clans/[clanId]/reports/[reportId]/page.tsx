'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

import ReportCharts from '@/components/report/ReportCharts'
import ReportHighlights from '@/components/report/ReportHighlights'
import ReportInsights from '@/components/report/ReportInsights'
import ReportStats from '@/components/report/ReportStats'
import { useReportDetail } from '@/hooks/useReportDetail'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { ReportChartsData, ReportProgressionData } from '@/types/reports'

function parseNumericParam(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseStringParam(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  return value
}

function getSectionContent<T>(sections: Array<{ sectionType: string; content: unknown }>, type: string) {
  const section = sections.find((item) => item.sectionType === type)
  return (section?.content as T | undefined) ?? null
}

function formatDelta(value: number, isPercent = false) {
  if (value > 0) return `+${isPercent ? (value * 100).toFixed(1) : Math.round(value)}${isPercent ? '%' : ''}`
  if (value < 0) return `${isPercent ? (value * 100).toFixed(1) : Math.round(value)}${isPercent ? '%' : ''}`
  return '0'
}

export default function ReportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseNumericParam(params.clanId), [params.clanId])
  const reportId = useMemo(() => parseStringParam(params.reportId), [params.reportId])
  const { report, sections, insights, loading, error } = useReportDetail(clanId, reportId)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  if (!clanId || !reportId) {
    return null
  }

  const charts = getSectionContent<ReportChartsData>(sections, 'charts')
  const progression = getSectionContent<ReportProgressionData>(sections, 'progression')
  const recommendations = getSectionContent<string[]>(sections, 'recommendations') ?? []

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {report.type === 'weekly' ? 'Rapport hebdomadaire' : 'Rapport mensuel'}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            {report.clanName || `Clan #${clanId}`} · {report.periodStart.slice(0, 10)}
          </h1>
          <p className="text-sm text-gray-600">
            Période {report.periodStart.slice(0, 10)} → {report.periodEnd.slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/clans/${clanId}/reports/${reportId}/export?format=pdf`}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Export PDF
          </a>
          <a
            href={`/api/clans/${clanId}/reports/${reportId}/export?format=html`}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export HTML
          </a>
          <a
            href={`mailto:?subject=Rapport PUBG clan&body=/clans/${clanId}/reports/${reportId}`}
            className="rounded border border-purple-300 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50"
          >
            Partager
          </a>
          <Link
            href={`/clans/${clanId}/reports`}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Retour liste
          </Link>
        </div>
      </div>

      {loading ? <p className="mb-6 text-sm text-gray-600">Chargement du rapport...</p> : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Matches</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{report.totalMatches}</p>
            </article>
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Kills</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{report.totalKills}</p>
            </article>
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Damage</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{Math.round(report.totalDamage)}</p>
            </article>
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Win Rate</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {(report.avgWinRate * 100).toFixed(1)}%
              </p>
            </article>
          </section>

          <ReportHighlights highlights={report.highlights} />

          {progression ? (
            <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Progression</h2>
                <span className="text-sm text-gray-500">{progression.comparisonLabel}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <article className="rounded bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Δ kills</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {formatDelta(progression.aggregateDelta.kills)}
                  </p>
                </article>
                <article className="rounded bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Δ damage</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {formatDelta(progression.aggregateDelta.damage)}
                  </p>
                </article>
                <article className="rounded bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Δ matches</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {formatDelta(progression.aggregateDelta.matches)}
                  </p>
                </article>
                <article className="rounded bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Δ WR</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {formatDelta(progression.aggregateDelta.winRate, true)}
                  </p>
                </article>
              </div>
            </section>
          ) : null}

          <ReportStats players={report.playerStats} />
          <ReportCharts charts={charts} />
          <ReportInsights insights={insights} recommendations={recommendations} />
        </div>
      ) : null}
    </main>
  )
}
