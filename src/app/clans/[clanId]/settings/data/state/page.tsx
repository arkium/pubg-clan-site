'use client'

import {
  Activity,
  CheckCircle2,
  Download,
  Hourglass,
  Layers,
  ListRestart,
  Loader2,
  Percent,
  RefreshCw,
  Trash2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import DataSectionHeader, { BANNER_GLASS_BUTTON } from '@/components/clan-settings/DataSectionHeader'
import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'

/**
 * État de la télémétrie d'un clan (onglet de « Données », SuperUser seul), selon la charte UI (docs/ui/index.html) :
 * file de traitement du worker pour le clan, taux de succès et d'échec, actions sur la file (réordonnancement,
 * nettoyage confirmé en deux temps, export Prometheus). Actualisation automatique toutes les 30 s ou à la demande.
 */

type QueueMetrics = {
  queued: number
  running: number
  success: number
  failed: number
  total: number
}

type RefreshMode = 'auto' | 'manual'
type QueueAction = 'reorder' | 'cleanup' | 'export'

const REFRESH_INTERVAL_MS = 30_000
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Paris' })
const percentFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

async function fetchQueue(clanId: string): Promise<QueueMetrics | null> {
  const response = await fetch(`/api/clans/${clanId}/telemetry/sync-batch-manual`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => null)) as { queue?: QueueMetrics; error?: string } | null
  if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
  return payload?.queue ?? null
}

function queueKpis(clanId: string, queue: QueueMetrics): Kpi[] {
  return [
    { label: 'En attente', value: String(queue.queued), detail: 'jobs à traiter', icon: Hourglass, color: 'var(--game-warn)' },
    { label: 'En traitement', value: String(queue.running), detail: 'pris par le worker', icon: Loader2, color: 'var(--game-sky)' },
    { label: 'Réussis', value: String(queue.success), detail: 'jobs terminés', icon: CheckCircle2, color: 'var(--game-pos)' },
    {
      label: 'Échoués',
      value: String(queue.failed),
      detail: 'jobs en échec',
      icon: XCircle,
      color: 'var(--game-neg)',
      link: queue.failed > 0 ? { href: `/clans/${clanId}/settings/data/errors`, label: 'Voir les erreurs' } : undefined,
    },
    { label: 'Total', value: String(queue.total), detail: 'tous statuts', icon: Layers, color: 'var(--game-gold)' },
  ]
}

function RateCard({ label, value, detail, color, icon: Icon }: { label: string; value: number | null; detail: string; color: string; icon: LucideIcon }) {
  return (
    <div className="app-panel app-kpi">
      <p className="t-label m-0 flex items-center gap-1.5">
        <Icon className="h-[13px] w-[13px] shrink-0" style={{ color }} aria-hidden="true" />
        {label}
      </p>
      <p className="t-hero t-hero--md m-0 text-gray-900">{value === null ? '—' : `${percentFormat.format(value)} %`}</p>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--game-track)' }} aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value ?? 0)}%`, background: color }} />
      </div>
      <p className="t-meta m-0">{detail}</p>
    </div>
  )
}

function ActionRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-[260px]">
        <p className="t-card-title m-0">{title}</p>
        <p className="t-meta m-0">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </li>
  )
}

export default function TelemetryStatePage() {
  const params = useParams()
  const clanId = typeof params.clanId === 'string' ? params.clanId : ''
  const [queue, setQueue] = useState<QueueMetrics | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<RefreshMode>('auto')
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<QueueAction | null>(null)
  const [confirmCleanup, setConfirmCleanup] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'pos' | 'neg'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    if (!clanId) return
    setRefreshing(true)
    try {
      setQueue(await fetchQueue(clanId))
      setError('')
      setRefreshedAt(new Date())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
    } finally {
      setRefreshing(false)
      setLoaded(true)
    }
  }, [clanId])

  // Premier chargement, puis toutes les 30 s en mode automatique.
  useEffect(() => {
    if (!clanId) return
    let cancelled = false
    const load = () =>
      fetchQueue(clanId).then(
        (next) => {
          if (cancelled) return
          setQueue(next)
          setError('')
          setRefreshedAt(new Date())
          setLoaded(true)
        },
        (caught: unknown) => {
          if (cancelled) return
          setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
          setLoaded(true)
        }
      )
    void load()
    const interval = mode === 'auto' ? setInterval(() => void load(), REFRESH_INTERVAL_MS) : null
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [clanId, mode])

  async function runQueueAction(action: 'reorder' | 'cleanup') {
    setBusy(action)
    setNotice(null)
    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/queue-cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'reorder' ? { action: 'reorder-priority' } : { action: 'cleanup-stale', maxAgeHours: 24 }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { reordered?: number; staleTotalDeleted?: number; failedTotalDeleted?: number; timeoutTotal?: number; error?: string }
        | null
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      setNotice({
        tone: 'pos',
        text:
          action === 'reorder'
            ? `${payload?.reordered ?? 0} job(s) remis dans l’ordre des parties les plus récentes.`
            : `${payload?.staleTotalDeleted ?? 0} job(s) en attente et ${payload?.failedTotalDeleted ?? 0} échec(s) supprimés, ${payload?.timeoutTotal ?? 0} job(s) bloqué(s) clos.`,
      })
      await refresh()
    } catch (caught) {
      setNotice({ tone: 'neg', text: caught instanceof Error ? caught.message : 'Action impossible.' })
    } finally {
      setBusy(null)
      setConfirmCleanup(false)
    }
  }

  async function exportMetrics() {
    setBusy('export')
    setNotice(null)
    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/metrics?format=prometheus`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Export impossible (HTTP ${response.status}).`)
      const url = URL.createObjectURL(new Blob([await response.text()], { type: 'text/plain' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `metrics-${clanId}.txt`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setNotice({ tone: 'neg', text: caught instanceof Error ? caught.message : 'Export impossible.' })
    } finally {
      setBusy(null)
    }
  }

  if (!clanId) return null
  const finished = queue ? queue.success + queue.failed : 0
  const successRate = queue && finished > 0 ? (queue.success / finished) * 100 : null
  const failureRate = queue && queue.total > 0 ? (queue.failed / queue.total) * 100 : null

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // `.game-ui` : jetons --game-* (couleurs des indicateurs).
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <DataSectionHeader
        clanId={clanId}
        title="État de la télémétrie"
        subtitle="File de traitement du worker pour les parties du clan."
        icon={Activity}
        currentHref={`/clans/${clanId}/settings/data/state`}
        pills={refreshedAt ? [<>Actualisé à <span className="t-num">{timeFormat.format(refreshedAt)}</span></>] : []}
        action={
          <button type="button" className={BANNER_GLASS_BUTTON} onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </button>
        }
      />

      {error ? <p className="t-body t-neg m-0">{error}</p> : null}

      {!loaded ? (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : queue === null ? (
        error ? null : (
          <p className="t-body m-0 rounded-[14px] border border-dashed border-gray-200 p-6 text-center text-gray-500">
            Aucune donnée de file pour ce clan.
          </p>
        )
      ) : (
        <>
          <section className="flex flex-col gap-2.5" aria-labelledby="queue-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="queue-title" className="t-section-title m-0">
                File de traitement
              </h2>
              <SegmentedControl<RefreshMode>
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'auto', label: 'Auto · 30 s' },
                  { value: 'manual', label: 'Manuelle' },
                ]}
              />
            </div>
            <KpiGrid items={queueKpis(clanId, queue)} className="grid-cols-2 lg:grid-cols-5" />
          </section>

          <section className="grid gap-2.5 md:grid-cols-2" aria-label="Taux de succès et d’échec">
            <RateCard label="Taux de succès" value={successRate} detail="parmi les jobs terminés" color="var(--game-pos)" icon={Percent} />
            <RateCard label="Taux d’échec" value={failureRate} detail="parmi tous les jobs" color="var(--game-neg)" icon={Percent} />
          </section>

          <section className="app-panel flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="queue-actions-title">
            <h2 id="queue-actions-title" className="t-section-title m-0">
              Actions sur la file
            </h2>
            <ul className="m-0 flex list-none flex-col p-0">
              <ActionRow
                title="Réordonner les priorités"
                description="Remet les jobs en attente du clan dans l’ordre des parties les plus récentes : ils peuvent passer devant ceux des autres clans."
              >
                <button
                  type="button"
                  className="app-btn app-btn--md app-btn--secondary gap-2"
                  disabled={busy !== null}
                  onClick={() => void runQueueAction('reorder')}
                >
                  <ListRestart className="h-4 w-4" aria-hidden="true" />
                  Réordonner
                </button>
              </ActionRow>
              <ActionRow
                title="Nettoyer la file"
                description="Supprime les jobs en attente depuis plus de 24 h (y compris ceux d’un rattrapage en cours) et les échecs de plus de 7 h, clôt ceux qui tournent depuis plus de 4 h."
              >
                {confirmCleanup ? (
                  <>
                    <button
                      type="button"
                      className="app-btn app-btn--md app-btn--danger gap-2"
                      disabled={busy !== null}
                      onClick={() => void runQueueAction('cleanup')}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Confirmer le nettoyage
                    </button>
                    <button
                      type="button"
                      className="app-btn app-btn--md app-btn--secondary"
                      disabled={busy !== null}
                      onClick={() => setConfirmCleanup(false)}
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="app-btn app-btn--md app-btn--secondary gap-2"
                    disabled={busy !== null}
                    onClick={() => setConfirmCleanup(true)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Nettoyer…
                  </button>
                )}
              </ActionRow>
              <ActionRow
                title="Exporter les métriques"
                description="Fichier texte au format Prometheus : compteurs de la file et du worker pour ce clan."
              >
                <button
                  type="button"
                  className="app-btn app-btn--md app-btn--secondary gap-2"
                  disabled={busy !== null}
                  onClick={() => void exportMetrics()}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Exporter
                </button>
              </ActionRow>
            </ul>
            {notice ? (
              <p className={`t-body m-0 ${notice.tone === 'pos' ? 't-pos' : 't-neg'}`} role="status">
                {notice.text}
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}
