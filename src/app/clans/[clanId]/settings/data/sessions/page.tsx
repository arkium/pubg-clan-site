'use client'

import { CalendarDays, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

import DataSectionHeader from '@/components/clan-settings/DataSectionHeader'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSquadMatches } from '@/hooks/useSquadMatches'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { MATCH_PERIODS } from '@/lib/period'

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

/** État de la télémétrie d'une soirée : couleur et libellé de la pastille (jetons de jeu de la charte). */
const SESSION_STATUS = {
  complete: { label: 'Complète', color: 'var(--game-pos)', background: 'var(--game-pos-soft)' },
  partial: { label: 'Partielle', color: 'var(--game-sky)', background: 'var(--game-sky-soft)' },
  none: { label: 'À récupérer', color: 'var(--game-warn)', background: 'var(--game-warn-soft)' },
} as const

/**
 * Soirées de télémétrie du clan (onglet de « Données », SuperUser seul), selon la charte UI (docs/ui/index.html) :
 * chaque soirée de la période avec la part de ses parties analysées ; une soirée ouvre son panneau d'exploitation.
 */
export default function TelemetrySessionsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(MATCH_PERIODS, 'week')

  const { sessions, loading: sessionsLoading, error } = useSquadMatches(periodReady ? clanId : null, period)
  const loading = sessionsLoading || !periodReady

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
  const analysed = sessionsWithTelemetry.reduce((sum, session) => sum + session.telemetryCount, 0)
  const total = sessionsWithTelemetry.reduce((sum, session) => sum + session.matches.length, 0)

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter flex flex-col gap-4">
        <DataSectionHeader
          clanId={clanId}
          title="Soirées"
          subtitle="Soirées de jeu du clan, état de leur télémétrie et panneau d’exploitation de chaque soirée."
          icon={CalendarDays}
          currentHref={`/clans/${clanId}/settings/data/sessions`}
          pills={
            total > 0
              ? [
                  <>
                    <span className="t-num">{analysed}</span>/<span className="t-num">{total}</span> parties analysées
                  </>,
                ]
              : []
          }
        />
      </div>

      <DockingToolbar ariaLabel="Période des soirées">
        <PeriodFilter periods={MATCH_PERIODS} value={period} onChange={setPeriod} />
      </DockingToolbar>

      <div className="app-container app-gutter">
        {loading && sessionsWithTelemetry.length === 0 ? (
          <div className="flex flex-col gap-2.5">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : null}
        {error ? <p className="t-body t-neg m-0 mb-4">{error}</p> : null}

        {/* Rechargement : les résultats précédents restent affichés, estompés (la page ne se replie pas). */}
        {!error && (!loading || sessionsWithTelemetry.length > 0) ? (
          sessionsWithTelemetry.length > 0 ? (
            <ul aria-busy={loading} className={`m-0 flex list-none flex-col gap-2.5 p-0 ${loading ? 'opacity-60' : ''}`}>
              {sessionsWithTelemetry.map((session) => {
                const status =
                  SESSION_STATUS[session.pendingCount === 0 ? 'complete' : session.telemetryCount === 0 ? 'none' : 'partial']
                return (
                  <li key={session.date}>
                    <Link
                      href={`/clans/${clanId}/settings/data/sessions/${session.date}?period=${period}`}
                      className="app-panel flex items-center justify-between gap-4 p-3.5 transition-colors hover:bg-gray-50"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="t-card-title first-letter:uppercase">{formatDateLabel(session.date)}</span>
                        <span className="t-meta">{session.date}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-4 text-right">
                        <span className="flex flex-col">
                          <span className="t-label">Matchs</span>
                          <span className="t-hero t-hero--sm text-gray-900">{session.matches.length}</span>
                        </span>
                        <span className="flex flex-col">
                          <span className="t-label">Télémétrie</span>
                          <span className="t-hero t-hero--sm" style={{ color: status.color }}>
                            {session.telemetryCount}/{session.matches.length}
                          </span>
                        </span>
                        <span
                          className="hidden rounded-full px-2.5 py-0.5 text-xs font-semibold sm:inline-flex"
                          style={{ background: status.background, color: status.color }}
                        >
                          {status.label}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="t-body m-0 rounded-[14px] border border-dashed border-gray-200 p-6 text-center text-gray-500">
              Aucune soirée sur cette période.
            </p>
          )
        ) : null}
      </div>
    </div>
  )
}
