'use client'

import { AlertTriangle, CheckCircle2, Info, RotateCcw, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { EmptyState, ListSkeleton, SectionCard, Tag } from '@/components/ui/CharteKit'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { DATA_ANCHORS } from '@/lib/clan-data-section'
import {
  fileFailures,
  pickObservability,
  pickResyncFileQueue,
  pubgFailures,
  retryTargets,
  TELEMETRY_WINDOW_OPTIONS,
  type TelemetryFailure,
  type TelemetryWindow,
} from '@/lib/clan-telemetry-view'
import { matchTelemetryAuditPath } from '@/lib/match-links'

/**
 * Échecs du worker de télémétrie pour un clan (« Récupérations », docs/TODO/administration.md §8) : une seule vue pour
 * les deux files, avec relance. Remplace l'onglet « Erreurs » (file de retraitement seulement) et la liste sans action
 * d'« Observabilité des jobs » (file de récupération PUBG).
 *
 * - Récupération PUBG : dernier job de chaque partie, en échec hors expiration ; relance = nouvelle mise en file de la
 *   partie (`POST …/telemetry/sync-selected-enqueue`, la route de la soirée).
 * - Retraitement de fichiers : jobs en échec parmi les 20 derniers ; relance = `POST …/telemetry/dead-letter`.
 */

const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' })

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.error ?? `HTTP ${response.status}`)
  return payload
}

function FailureRow({
  clanId,
  failure,
  requeued,
  disabled,
  spinning,
  onRetry,
}: {
  clanId: number
  failure: TelemetryFailure
  requeued: boolean
  disabled: boolean
  spinning: boolean
  onRetry: () => void
}) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-t border-gray-200 px-3.5 py-3 first:border-t-0">
      <XCircle className="t-neg mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="t-body m-0 break-words font-semibold text-gray-900">{failure.message || failure.code || 'Échec sans message'}</p>
        <p className="t-meta m-0 break-words">
          {dateTimeFormat.format(new Date(failure.at))} ·{' '}
          {failure.queue === 'pubg' ? (
            <>
              partie <span className="break-all font-mono">{failure.pubgMatchId ?? failure.squadMatchId}</span> ·{' '}
              <Link href={matchTelemetryAuditPath(clanId, failure.squadMatchId)} className="app-link font-semibold">
                État de la partie
              </Link>
            </>
          ) : (
            <>
              job <span className="font-mono">{failure.jobId.slice(0, 12)}</span>
            </>
          )}
        </p>
      </div>
      {requeued ? (
        <Tag tone="sky">En file</Tag>
      ) : (
        <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1.5" disabled={disabled} onClick={onRetry}>
          <RotateCcw className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
          Relancer
        </button>
      )}
    </li>
  )
}

export default function TelemetryFailuresSection({ clanId, refreshToken }: { clanId: number; refreshToken: number }) {
  const [range, setRange] = useState<TelemetryWindow>('7d')
  const [token, setToken] = useState(0)
  // Instant de référence de la fenêtre, pris à chaque changement de période ou rechargement (jamais pendant le rendu).
  const [now, setNow] = useState(() => Date.now())
  const [requeued, setRequeued] = useState<ReadonlySet<string>>(() => new Set())
  const [retrying, setRetrying] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'pos' | 'neg'; text: string } | null>(null)

  // Les deux jetons ne font que croître : leur somme relance la lecture quand l'un ou l'autre change.
  const reloadToken = refreshToken + token
  const observability = useLifecycleResource<unknown>(
    `/api/clans/${clanId}/telemetry/observability?window=${range}&limit=300`,
    reloadToken
  )
  const fileQueue = useLifecycleResource<unknown>(`/api/clans/${clanId}/telemetry/sync-batch-manual`, reloadToken)

  const pubgView = useMemo(() => {
    const parsed = pickObservability(observability.data)
    return parsed ? { failures: pubgFailures(parsed.series), expired: parsed.summary.expired } : null
  }, [observability.data])
  const files = useMemo(() => {
    const parsed = pickResyncFileQueue(fileQueue.data)
    return parsed ? fileFailures(parsed.recentJobs, range, now) : null
  }, [fileQueue.data, range, now])

  const pubg = pubgView?.failures ?? []
  const all = [...pubg, ...(files ?? [])]
  const loaded = pubgView !== null && files !== null
  const loading = observability.loading || fileQueue.loading
  const error = observability.error || fileQueue.error

  function changeRange(next: TelemetryWindow) {
    setRange(next)
    setNow(Date.now())
  }

  async function retry(failures: TelemetryFailure[], key: string) {
    const { squadMatchIds, jobIds } = retryTargets(failures)
    setRetrying(key)
    setNotice(null)
    try {
      const parts: string[] = []
      if (squadMatchIds.length > 0) {
        const result = await postJson<{ queuedCount?: number; alreadyQueuedCount?: number }>(
          `/api/clans/${clanId}/telemetry/sync-selected-enqueue`,
          { squadMatchIds }
        )
        const already = result.alreadyQueuedCount ?? 0
        parts.push(`${result.queuedCount ?? 0} partie(s) remise(s) en file de récupération${already > 0 ? ` (${already} déjà en file)` : ''}`)
        setRequeued((current) => new Set([...current, ...squadMatchIds]))
      }
      if (jobIds.length > 0) {
        const result = await postJson<{ jobsRetried?: number }>(`/api/clans/${clanId}/telemetry/dead-letter`, { jobIds })
        parts.push(`${result.jobsRetried ?? 0} job(s) de retraitement relancé(s)`)
        // Les jobs relancés repassent en attente : ils quittent la liste.
        setToken((current) => current + 1)
      }
      setNotice({ tone: 'pos', text: `${parts.join(' ; ')}.` })
    } catch (caught) {
      setNotice({ tone: 'neg', text: caught instanceof Error ? caught.message : 'Relance impossible.' })
    } finally {
      setRetrying(null)
    }
  }

  const pending = all.filter((failure) => failure.queue === 'file' || !requeued.has(failure.squadMatchId))
  const groups = [
    { key: 'pubg', title: 'Récupération PUBG', failures: pubg },
    { key: 'file', title: 'Retraitement de fichiers', failures: files ?? [] },
  ].filter((group) => group.failures.length > 0)

  return (
    <SectionCard
      id={DATA_ANCHORS.failures}
      icon={AlertTriangle}
      title="Échecs"
      meta="Jobs du worker en échec pour ce clan, dans les deux files. Corrige d’abord la cause (partie introuvable, fichier absent…) : sinon le job échouera de nouveau."
    >
      {/* Dans le corps, pas en `aside` : à côté du titre, il écrasait le texte d'introduction sur mobile. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-label">Période</span>
        <SegmentedControl<TelemetryWindow> size="sm" value={range} onChange={changeRange} options={TELEMETRY_WINDOW_OPTIONS} />
      </div>

      {error ? <p className="t-body t-neg m-0">{error}</p> : null}

      {!loaded ? (
        error ? null : <ListSkeleton rows={3} />
      ) : all.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Aucun échec à relancer" text="Aucun job en échec sur cette période." />
      ) : (
        // Rechargement : la liste précédente reste affichée, estompée.
        <div aria-busy={loading} className={`flex flex-col gap-3 ${loading ? 'opacity-60' : ''}`}>
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1.5">
              <p className="t-label m-0">
                {group.title} · <span className="t-num">{group.failures.length}</span>
              </p>
              <ul className="app-panel m-0 flex list-none flex-col p-0">
                {group.failures.map((failure) => (
                  <FailureRow
                    key={failure.jobId}
                    clanId={clanId}
                    failure={failure}
                    requeued={failure.queue === 'pubg' && requeued.has(failure.squadMatchId)}
                    disabled={retrying !== null}
                    spinning={retrying === failure.jobId}
                    onRetry={() => void retry([failure], failure.jobId)}
                  />
                ))}
              </ul>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="t-meta">
              <span className="t-num">{pending.length}</span> échec(s) à relancer
            </span>
            <button
              type="button"
              className="app-btn app-btn--md app-btn--secondary gap-2"
              disabled={retrying !== null || pending.length === 0}
              onClick={() => void retry(pending, 'all')}
            >
              <RotateCcw className={`h-4 w-4 ${retrying === 'all' ? 'animate-spin' : ''}`} aria-hidden="true" />
              Tout relancer
            </button>
          </div>
        </div>
      )}

      {pubgView && pubgView.expired > 0 ? (
        <p className="t-meta m-0 flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="t-num">{pubgView.expired}</span> job(s) en échec parce que le fichier a expiré chez PUBG (14 jours) :
            rien à relancer.
          </span>
        </p>
      ) : null}

      {notice ? (
        <p className={`t-body m-0 ${notice.tone === 'pos' ? 't-pos' : 't-neg'}`} role="status">
          {notice.text}
        </p>
      ) : null}
    </SectionCard>
  )
}
