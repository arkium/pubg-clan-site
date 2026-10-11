'use client'

import { AlertTriangle, CheckCircle2, Clock, HeartPulse, RefreshCw, Swords } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useState } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import DataSectionHeader, { BANNER_GLASS_BUTTON } from '@/components/clan-settings/DataSectionHeader'
import PipelineHealthSection from '@/components/clan-settings/data/PipelineHealthSection'
import WorkerQueuesPanel from '@/components/clan-settings/data/WorkerQueuesPanel'
import { KpiGrid, SectionTitle, type Kpi } from '@/components/matches/MatchesUi'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { dataCoverageHref } from '@/lib/clan-data-section'

/**
 * Santé des données d'un clan (docs/TODO/administration.md §8 ; SuperUser seul), selon la charte UI
 * (docs/ui/index.html) : couverture de la télémétrie des parties, santé du pipeline de récupération et files du
 * worker pour le clan (ancien onglet « État »). Les mises en file et les relances sont dans « Récupérations ».
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
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function telemetryKpis(clanId: number, health: DataHealth): Kpi[] {
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
      link: health.missing > health.expired ? { href: dataCoverageHref(clanId), label: 'Mettre en file' } : undefined,
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

export default function ClanDataHealthPage() {
  const params = useParams()
  const clanId = parseClanId(params.clanId)
  return clanId ? <ClanDataHealth clanId={clanId} /> : null
}

function ClanDataHealth({ clanId }: { clanId: number }) {
  // Un seul jeton d'actualisation pour les trois lectures de la page (bouton du bandeau, après un nettoyage).
  const [token, setToken] = useState(0)
  const reload = () => setToken((current) => current + 1)
  const { data: health, error, loading } = useLifecycleResource<DataHealth>(`/api/clans/${clanId}/settings/data-health`, token)

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
        action={
          <button type="button" className={BANNER_GLASS_BUTTON} onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {/* Icône seule sur mobile : le bouton, en haut à droite du bandeau, recouvrait le titre. */}
            <span className="sr-only sm:not-sr-only">Actualiser</span>
          </button>
        }
      />

      {error ? <p className="t-body t-neg m-0">{error}</p> : null}

      <section className="flex flex-col gap-2.5" aria-label="Télémétrie des parties">
        <SectionTitle aside={health ? `${health.windowDays} derniers jours` : undefined}>Télémétrie des parties</SectionTitle>
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
          // Rechargement : les chiffres précédents restent affichés, estompés.
          <div aria-busy={loading} className={loading ? 'opacity-60' : ''}>
            <KpiGrid items={telemetryKpis(clanId, health)} className="grid-cols-2 lg:grid-cols-4" />
          </div>
        )}
      </section>

      <PipelineHealthSection clanId={clanId} token={token} />

      <WorkerQueuesPanel
        clanId={clanId}
        token={token}
        liveQueue={health ? { pending: health.queuedJobs, failedLast7Days: health.failedJobsLast7Days } : null}
        onChanged={reload}
      />
    </div>
  )
}
