'use client'

import { Download, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { ConfirmDialog, type Tone } from '@/components/ui/CharteKit'
import { dataFailuresHref } from '@/lib/clan-data-section'
import { pickResyncFileQueue } from '@/lib/clan-telemetry-view'

/**
 * Files du worker pour un clan (« Santé des données », docs/TODO/administration.md §8) : la file de récupération PUBG
 * et la file de retraitement de fichiers, nommées pour ne plus les confondre, puis les actions sur la seconde
 * (nettoyage confirmé, export Prometheus). Ancien onglet « État », qui ne montrait que la file de retraitement.
 */

type Tile = { label: string; value: number | null; tone: Tone }

function QueueRow({ title, description, tiles, footer }: { title: string; description: string; tiles: Tile[]; footer?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-gray-200 pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-0.5">
        <p className="t-card-title m-0">{title}</p>
        <p className="t-meta m-0">{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="app-stat-tile">
            <span
              className="app-stat-tile__value"
              style={tile.tone === 'neutral' || !tile.value ? undefined : { color: `var(--game-${tile.tone})` }}
            >
              {tile.value ?? '—'}
            </span>
            <span className="app-stat-tile__label">{tile.label}</span>
          </div>
        ))}
      </div>
      {footer}
    </div>
  )
}

function ActionRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
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

export default function WorkerQueuesPanel({
  clanId,
  token,
  liveQueue,
  onChanged,
}: {
  clanId: number
  token: number
  /** File de récupération PUBG du clan, lue par `GET …/settings/data-health`. */
  liveQueue: { pending: number; failedLast7Days: number } | null
  onChanged: () => void
}) {
  const { data, error } = useLifecycleResource<unknown>(`/api/clans/${clanId}/telemetry/sync-batch-manual`, token)
  const fileQueue = useMemo(() => pickResyncFileQueue(data)?.queue ?? null, [data])
  const [busy, setBusy] = useState<'cleanup' | 'export' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'pos' | 'neg'; text: string } | null>(null)
  const failuresLink = (
    <Link href={dataFailuresHref(clanId)} className="app-link self-start text-xs font-semibold">
      Voir les échecs →
    </Link>
  )

  async function cleanup() {
    setBusy('cleanup')
    setNotice(null)
    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/queue-cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup-stale', maxAgeHours: 24 }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { staleTotalDeleted?: number; failedTotalDeleted?: number; timeoutTotal?: number; error?: string }
        | null
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      setNotice({
        tone: 'pos',
        text: `${payload?.staleTotalDeleted ?? 0} job(s) en attente et ${payload?.failedTotalDeleted ?? 0} échec(s) supprimés, ${payload?.timeoutTotal ?? 0} job(s) bloqué(s) clos.`,
      })
      onChanged()
    } catch (caught) {
      setNotice({ tone: 'neg', text: caught instanceof Error ? caught.message : 'Nettoyage impossible.' })
    } finally {
      setBusy(null)
      setConfirming(false)
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

  return (
    <section className="app-panel flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="queues-title">
      <h2 id="queues-title" className="t-section-title m-0">
        Files du worker pour ce clan
      </h2>

      <QueueRow
        title="Récupération PUBG"
        description="Téléchargement du fichier chez PUBG puis analyse : synchronisation nocturne et mises en file des Données."
        tiles={[
          { label: 'En file', value: liveQueue?.pending ?? null, tone: 'warn' },
          { label: 'Échecs (7 j)', value: liveQueue?.failedLast7Days ?? null, tone: 'neg' },
        ]}
        footer={liveQueue && liveQueue.failedLast7Days > 0 ? failuresLink : null}
      />
      <QueueRow
        title="Retraitement de fichiers"
        description="Nouvelle analyse de fichiers déjà capturés sur le serveur (soirée, mode « Traiter les fichiers »). Compteurs depuis l’origine."
        tiles={[
          { label: 'En attente', value: fileQueue?.queued ?? null, tone: 'warn' },
          { label: 'En cours', value: fileQueue?.running ?? null, tone: 'sky' },
          { label: 'Réussis', value: fileQueue?.success ?? null, tone: 'pos' },
          { label: 'Échoués', value: fileQueue?.failed ?? null, tone: 'neg' },
        ]}
        footer={fileQueue && fileQueue.failed > 0 ? failuresLink : null}
      />
      {error ? <p className="t-body t-neg m-0">{error}</p> : null}

      <ul className="m-0 flex list-none flex-col border-t border-gray-200 p-0 pt-3">
        <ActionRow
          title="Nettoyer la file de retraitement"
          description="Supprime les jobs en attente depuis plus de 24 h et les échecs de plus de 7 h, clôt ceux qui tournent depuis plus de 4 h."
        >
          <button
            type="button"
            className="app-btn app-btn--md app-btn--secondary gap-2"
            disabled={busy !== null}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Nettoyer…
          </button>
        </ActionRow>
        <ActionRow
          title="Exporter les métriques"
          description="Fichier texte au format Prometheus : compteurs de la file de retraitement pour ce clan."
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

      {confirming ? (
        <ConfirmDialog
          icon={Trash2}
          title="Nettoyer la file de retraitement ?"
          confirmLabel="Nettoyer"
          tone="danger"
          busy={busy === 'cleanup'}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void cleanup()}
        >
          Les jobs en attente depuis plus de 24 h et les échecs de plus de 7 h sont supprimés définitivement ; les jobs
          en cours depuis plus de 4 h passent en échec.
        </ConfirmDialog>
      ) : null}
    </section>
  )
}
