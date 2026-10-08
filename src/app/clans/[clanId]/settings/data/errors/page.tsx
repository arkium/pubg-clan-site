'use client'

import { AlertTriangle, Info, RotateCcw, XCircle } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import DataSectionHeader from '@/components/clan-settings/DataSectionHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'

/**
 * Erreurs de télémétrie d'un clan (onglet de « Données », SuperUser seul), selon la charte UI (docs/ui/index.html) :
 * jobs en échec parmi les 20 derniers jobs du clan (`GET …/telemetry/sync-batch-manual`), relance un par un ou en bloc
 * (`POST …/telemetry/dead-letter`, 50 au plus).
 */

type RecentJob = {
  id: string
  status: string
  message: string | null
  createdAt: string
  finishedAt: string | null
}

type Range = 'all' | 'hour' | 'day' | 'week'

const WINDOW_MS: Record<Exclude<Range, 'all'>, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
}

const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' })

async function fetchFailedJobs(clanId: string): Promise<RecentJob[]> {
  const response = await fetch(`/api/clans/${clanId}/telemetry/sync-batch-manual`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => null)) as { recentJobs?: RecentJob[]; error?: string } | null
  if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
  return (payload?.recentJobs ?? []).filter((job) => job.status === 'failed')
}

const jobTime = (job: RecentJob) => new Date(job.finishedAt ?? job.createdAt).getTime()

export default function TelemetryErrorsPage() {
  const params = useParams()
  const clanId = typeof params.clanId === 'string' ? params.clanId : ''
  const [jobs, setJobs] = useState<RecentJob[] | null>(null)
  const [error, setError] = useState('')
  const [range, setRange] = useState<Range>('all')
  const [retrying, setRetrying] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'pos' | 'neg'; text: string } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const reload = useCallback(async () => {
    if (!clanId) return
    try {
      setJobs(await fetchFailedJobs(clanId))
      setNow(Date.now())
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
    }
  }, [clanId])

  useEffect(() => {
    if (!clanId) return
    let cancelled = false
    fetchFailedJobs(clanId).then(
      (next) => {
        if (cancelled) return
        setJobs(next)
        setNow(Date.now())
      },
      (caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      }
    )
    return () => {
      cancelled = true
    }
  }, [clanId])

  async function retry(jobIds: string[], key: string) {
    setRetrying(key)
    setNotice(null)
    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/dead-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds }),
      })
      const payload = (await response.json().catch(() => null)) as { jobsRetried?: number; error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      setNotice({ tone: 'pos', text: `${payload?.jobsRetried ?? 0} job(s) remis en file d’attente.` })
      await reload()
    } catch (caught) {
      setNotice({ tone: 'neg', text: caught instanceof Error ? caught.message : 'Relance impossible.' })
    } finally {
      setRetrying(null)
    }
  }

  if (!clanId) return null
  const visible = (jobs ?? []).filter((job) => range === 'all' || now - jobTime(job) < WINDOW_MS[range])

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <DataSectionHeader
        clanId={clanId}
        title="Erreurs"
        subtitle="Jobs de télémétrie en échec parmi les 20 derniers jobs du clan, à relancer une fois la cause corrigée."
        icon={AlertTriangle}
        currentHref={`/clans/${clanId}/settings/data/errors`}
        pills={jobs ? [<><span className="t-num">{jobs.length}</span> en échec</>] : []}
      />

      {error ? <p className="t-body t-neg m-0">{error}</p> : null}

      <section className="flex flex-col gap-2.5" aria-labelledby="errors-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="errors-title" className="t-section-title m-0">
            Jobs en échec
          </h2>
          <SegmentedControl<Range>
            value={range}
            onChange={setRange}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'hour', label: '1 h' },
              { value: 'day', label: '24 h' },
              { value: 'week', label: '7 j' },
            ]}
          />
        </div>

        {jobs === null ? (
          error ? null : <TableSkeleton rows={3} />
        ) : visible.length === 0 ? (
          <p className="t-body m-0 rounded-[14px] border border-dashed border-gray-200 p-6 text-center text-gray-500">
            {range === 'all' ? 'Aucun job en échec parmi les derniers jobs du clan.' : 'Aucun job en échec sur cette période.'}
          </p>
        ) : (
          <>
            <ul className="app-panel m-0 flex list-none flex-col p-0">
              {visible.map((job) => (
                <li key={job.id} className="flex flex-wrap items-start gap-3 border-t border-gray-200 px-3.5 py-3 first:border-t-0">
                  <XCircle className="t-neg mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1 basis-[240px]">
                    <p className="t-body m-0 break-words font-semibold text-gray-900">{job.message || 'Échec sans message'}</p>
                    <p className="t-meta m-0">
                      {dateTimeFormat.format(new Date(jobTime(job)))} · job <span className="font-mono">{job.id.slice(0, 12)}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary gap-1.5"
                    disabled={retrying !== null}
                    onClick={() => void retry([job.id], job.id)}
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${retrying === job.id ? 'animate-spin' : ''}`} aria-hidden="true" />
                    Relancer
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="t-meta">
                <span className="t-num">{visible.length}</span> job(s) affiché(s)
              </span>
              <button
                type="button"
                className="app-btn app-btn--md app-btn--secondary gap-2"
                disabled={retrying !== null}
                onClick={() => void retry(visible.map((job) => job.id).slice(0, 50), 'all')}
              >
                <RotateCcw className={`h-4 w-4 ${retrying === 'all' ? 'animate-spin' : ''}`} aria-hidden="true" />
                Tout relancer
              </button>
            </div>
          </>
        )}
        {notice ? (
          <p className={`t-body m-0 ${notice.tone === 'pos' ? 't-pos' : 't-neg'}`} role="status">
            {notice.text}
          </p>
        ) : null}
      </section>

      <p className="app-panel-muted t-body m-0 flex items-start gap-2.5 px-3.5 py-3 text-gray-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
        <span>
          Un job relancé repasse en file d’attente et sera repris par le worker. Corrigez d’abord la cause (fichier
          expiré chez PUBG, partie introuvable…) : sinon il échouera de nouveau.
        </span>
      </p>
    </div>
  )
}
