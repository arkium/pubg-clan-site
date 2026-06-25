'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useSquadMatches } from '@/hooks/useSquadMatches'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { SquadPeriod } from '@/types/squad-matches'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  return date.toLocaleDateString('fr-FR', { dateStyle: 'full' })
}

export default function TelemetryMatchesPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const [period, setPeriod] = useState<SquadPeriod>('week')

  const { sessions, loading, error } = useSquadMatches(clanId, period)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  const sessionsWithTelemetry = useMemo(() => {
    return sessions.map((session) => {
      const telemetryCount = session.matches.filter((m) => m.telemetry?.status === 'success').length
      const pendingCount = session.matches.length - telemetryCount
      return { ...session, telemetryCount, pendingCount }
    })
  }, [sessions])

  if (!clanId) return null

  return (
    <main className="app-container app-main">
      <section className="app-panel mb-4 p-4">
        <SettingsPageHeader
          title="Télémétrie — Soirées"
          subtitle="Soirées de jeu et état de récupération télémétrie par session."
        />
      </section>

      <section className="app-panel mb-5 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Période</p>
        <SegmentedControl
          options={[
            { value: 'week', label: 'Semaine' },
            { value: 'month', label: 'Mois' },
            { value: 'month-1', label: 'Mois-1' },
            { value: 'month-2', label: 'Mois-2' },
          ]}
          value={period}
          onChange={setPeriod}
          size="sm"
          wrap
          fullWidthOnMobile
        />
      </section>

      {loading ? <p className="mb-4 text-sm text-slate-600">Chargement des soirées...</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        sessionsWithTelemetry.length > 0 ? (
          <section className="space-y-3">
            {sessionsWithTelemetry.map((session) => {
              const allSynced = session.pendingCount === 0
              const noneSynced = session.telemetryCount === 0
              const sessionHref = `/clans/${clanId}/telemetry/matches/session/${session.date}?period=${period}`

              return (
                <Link
                  key={session.date}
                  href={sessionHref}
                  className="app-panel flex items-center justify-between gap-4 p-4 transition hover:bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{formatDateLabel(session.date)}</p>
                    <p className="text-xs text-slate-500">{session.date}</p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-xs text-slate-500">Matchs</p>
                      <p className="text-lg font-bold tabular-nums text-slate-900">{session.matches.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Télémétrie</p>
                      <p className={`text-lg font-bold tabular-nums ${allSynced ? 'text-emerald-600' : noneSynced ? 'text-amber-600' : 'text-sky-600'}`}>
                        {session.telemetryCount}/{session.matches.length}
                      </p>
                    </div>
                    <span className={`hidden sm:inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${
                      allSynced
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : noneSynced
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-sky-200 bg-sky-50 text-sky-800'
                    }`}>
                      {allSynced ? 'Complet' : noneSynced ? 'À récupérer' : 'Partiel'}
                    </span>
                    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true">
                      <path fill="currentColor" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </section>
        ) : (
          <section className="app-panel p-8 text-center">
            <p className="text-sm text-slate-600">Aucune soirée trouvée pour cette période.</p>
          </section>
        )
      ) : null}
    </main>
  )
}
