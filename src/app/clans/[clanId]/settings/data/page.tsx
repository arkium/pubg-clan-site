'use client'

import { AlertTriangle, CheckCircle2, Clock, HeartPulse, Hourglass, RefreshCw, Swords, XCircle } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import DataSectionHeader from '@/components/clan-settings/DataSectionHeader'
import { KpiGrid, SectionTitle, type Kpi } from '@/components/matches/MatchesUi'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'

/**
 * Santé des données d'un clan (docs/TODO/administration.md Q17, lot 3b ; SuperUser seul depuis le 2026-10-08), selon la
 * charte UI (docs/ui/index.html) : état de la télémétrie des parties et resynchronisation rapide (50 parties par 24 h
 * et par clan, à basse priorité dans la file commune).
 */

type DataHealth = {
  windowDays: number
  totalMatches: number
  withTelemetry: number
  expired: number
  missing: number
  lastTelemetryAt: string | null
  queuedJobs: number
  failedJobsLast7Days: number
  resync: { used: number; limit: number; remaining: number; resetsAt: string | null }
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function fetchDataHealth(clanId: number): Promise<DataHealth> {
  const response = await fetch(`/api/clans/${clanId}/settings/data-health`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => null)) as (DataHealth & { error?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.error ?? `HTTP ${response.status}`)
  return payload
}

function telemetryKpis(health: DataHealth): Kpi[] {
  const share = health.totalMatches > 0 ? Math.round((health.withTelemetry / health.totalMatches) * 100) : null
  const last = health.lastTelemetryAt ? new Date(health.lastTelemetryAt) : null
  return [
    {
      label: 'Parties',
      value: String(health.totalMatches),
      detail: `${health.windowDays} derniers jours`,
      icon: Swords,
      color: 'var(--game-sky)',
    },
    {
      label: 'Avec télémétrie',
      value: String(health.withTelemetry),
      detail: share === null ? 'aucune partie sur la période' : `${share} % des parties`,
      icon: CheckCircle2,
      color: 'var(--game-pos)',
    },
    {
      label: 'Sans télémétrie',
      value: String(health.missing),
      detail: health.expired > 0 ? `dont ${health.expired} expirée(s) chez PUBG` : 'aucune expirée chez PUBG',
      icon: AlertTriangle,
      color: 'var(--game-warn)',
    },
    {
      label: 'Dernière télémétrie',
      value: last ? dayFormat.format(last) : '—',
      detail: last ? `à ${timeFormat.format(last)}` : 'aucune sur la période',
      icon: Clock,
      color: 'var(--game-gold)',
    },
  ]
}

function queueKpis(health: DataHealth): Kpi[] {
  return [
    {
      label: 'En file d’attente',
      value: String(health.queuedJobs),
      detail: 'parties du clan à traiter par le worker',
      icon: Hourglass,
      color: 'var(--game-warn)',
    },
    {
      label: 'Échecs',
      value: String(health.failedJobsLast7Days),
      detail: '7 derniers jours',
      icon: XCircle,
      color: 'var(--game-neg)',
    },
  ]
}

export default function ClanDataHealthPage() {
  const params = useParams()
  const clanId = parseClanId(params.clanId)
  const [health, setHealth] = useState<DataHealth | null>(null)
  const [error, setError] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!clanId) return
    try {
      setHealth(await fetchDataHealth(clanId))
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
    }
  }, [clanId])

  useEffect(() => {
    if (!clanId) return
    let cancelled = false
    fetchDataHealth(clanId).then(
      (payload) => {
        if (cancelled) return
        setHealth(payload)
        setError('')
      },
      (caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      }
    )
    return () => {
      cancelled = true
    }
  }, [clanId])

  async function requestResync() {
    if (!clanId) return
    setRequesting(true)
    setMessage('')
    try {
      const response = await fetch(`/api/clans/${clanId}/settings/data-health/resync`, { method: 'POST' })
      const payload = (await response.json().catch(() => null)) as
        | { queuedCount?: number; reason?: string | null; error?: string }
        | null
      if (!response.ok && response.status !== 429) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      if (response.status === 429) {
        setMessage('Le quota de 24 h est atteint : la demande pourra être relancée plus tard.')
      } else if (payload?.reason === 'nothing-to-sync') {
        setMessage('Aucune partie récente à resynchroniser.')
      } else {
        setMessage(`${payload?.queuedCount ?? 0} partie(s) mise(s) en file. Elles passent après les autres traitements en cours.`)
      }
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Demande impossible.')
    } finally {
      setRequesting(false)
    }
  }

  if (!clanId) return null
  const quotaUsedShare = health ? Math.min(100, Math.round((health.resync.used / Math.max(1, health.resync.limit)) * 100)) : 0

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // `.game-ui` : jetons --game-* (couleurs des indicateurs).
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <DataSectionHeader
        clanId={clanId}
        title="Santé des données"
        subtitle="La télémétrie des parties alimente les cartes, le débriefing et les statistiques de combat du clan."
        icon={HeartPulse}
        currentHref={`/clans/${clanId}/settings/data`}
        pills={
          health
            ? [
                <>
                  <span className="t-num">{health.withTelemetry}</span>/<span className="t-num">{health.totalMatches}</span> parties
                  analysées
                </>,
              ]
            : []
        }
      />

      {error ? <p className="t-body t-neg m-0">{error}</p> : null}

      {health === null ? (
        error ? null : (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )
      ) : (
        <>
          <section className="flex flex-col gap-2.5" aria-label="Télémétrie des parties">
            <SectionTitle aside={`${health.windowDays} derniers jours`}>Télémétrie des parties</SectionTitle>
            <KpiGrid items={telemetryKpis(health)} className="grid-cols-2 lg:grid-cols-4" />
          </section>

          <section className="flex flex-col gap-2.5" aria-label="File de traitement">
            <SectionTitle>File de traitement</SectionTitle>
            <KpiGrid items={queueKpis(health)} className="grid-cols-2" />
          </section>

          <section className="app-panel flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="resync-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="resync-title" className="t-section-title m-0">
                Resynchronisation rapide
              </h2>
              <span className="app-meta-pill">
                <span className="t-num">{health.resync.remaining}</span>&nbsp;/&nbsp;<span className="t-num">{health.resync.limit}</span>
                &nbsp;restantes
              </span>
            </div>
            <p className="t-body m-0 text-gray-700">
              Met en file les parties des 14 derniers jours sans télémétrie, au plus {health.resync.limit} par 24 h pour le
              clan. Elles passent après les traitements des autres clans.
            </p>
            <div className="flex flex-col gap-1.5">
              <div
                className="h-2 overflow-hidden rounded-full"
                style={{ background: 'var(--game-track)' }}
                role="meter"
                aria-label="Quota de 24 h utilisé"
                aria-valuemin={0}
                aria-valuemax={health.resync.limit}
                aria-valuenow={health.resync.used}
              >
                <div className="h-full rounded-full" style={{ width: `${quotaUsedShare}%`, background: 'var(--theme-ui-accent)' }} />
              </div>
              <p className="t-meta m-0">
                <span className="t-num">{health.resync.used}</span> utilisée(s) sur 24 h
                {health.resync.resetsAt && health.resync.remaining < health.resync.limit
                  ? ` · quota renouvelé à partir du ${dateTimeFormat.format(new Date(health.resync.resetsAt))}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="app-btn app-btn--md app-btn--primary gap-2"
                disabled={requesting || health.resync.remaining === 0 || health.missing === 0}
                onClick={() => void requestResync()}
              >
                <RefreshCw className={`h-4 w-4 ${requesting ? 'animate-spin' : ''}`} aria-hidden="true" />
                Demander une resynchronisation
              </button>
              {health.missing === 0 ? <span className="t-meta">Toutes les parties ont leur télémétrie.</span> : null}
            </div>
            {message ? <p className="t-body m-0 text-gray-700" role="status">{message}</p> : null}
          </section>
        </>
      )}
    </div>
  )
}
