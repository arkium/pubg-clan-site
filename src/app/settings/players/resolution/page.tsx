'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, Calendar, CheckCircle2, Clock, Info, Play, RotateCw, SlidersHorizontal, Timer, UserX, Zap } from 'lucide-react'

import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import { FormFeedback } from '@/components/settings/AdminPageStates'
import { Callout, EmptyState, ListSkeleton, SectionCard, Switch, Tag } from '@/components/ui/CharteKit'
import SortableTh from '@/components/ui/SortableTh'
import { useAuthSession } from '@/hooks/useAuthSession'

/**
 * Résolution des clans PUBG des joueurs croisés — onglet « Résolution & Cron » de Plateforme › Joueurs : débit du cron,
 * reste à qualifier, passe manuelle. Selon la charte UI (docs/ui/index.html) : indicateurs, interrupteur de la charte,
 * historique en tableau (cartes sous `md`).
 */

type ResolutionRun = {
  id: string | number
  startedAt: string
  source: string
  status: string
  durationMs?: number | null
  uniqueCandidatesSelected?: number
  candidatesSelected?: number
  resolvedWithClan?: number
  resolvedWithoutClan?: number
  playersResolved?: number
  failed?: number
  errorMessage?: string | null
}

type QuickData = {
  config?: { enabled: boolean; batchSize: number }
  cron?: { expression?: string; description?: string }
  recentRuns?: ResolutionRun[]
}

type BacklogData = {
  backlog?: { neverAttempted?: number; retryPending?: number; failed?: number }
  resolutionsLast24h?: { withClan?: number; withoutClan?: number }
  estimatedCatchUpDays?: number | null
}

type ManualRunSummary = {
  uniqueCandidatesSelected: number
  resolvedWithClan: number
  resolvedWithoutClan: number
  resolvedFromCache: number
  failed: number
}

const formatCount = (value: number | undefined) => Number(value ?? 0).toLocaleString('fr-FR')

function runResolved(run: ResolutionRun) {
  if (run.resolvedWithClan !== undefined) return run.resolvedWithClan + (run.resolvedWithoutClan ?? 0)
  return run.playersResolved ?? null
}

function RunStatus({ run }: { run: ResolutionRun }) {
  const ok = run.status === 'success'
  return (
    <Tag tone={ok ? 'pos' : 'neg'}>
      {run.source === 'manual' ? 'Manuel' : 'Cron'} · {ok ? 'réussi' : run.status}
    </Tag>
  )
}

export default function OpponentsResolutionPage() {
  const { loading, authenticated, isSuperUser } = useAuthSession()

  // Données rapides (réglages, cron, dernières passes) — ~25 ms
  const [quickData, setQuickData] = useState<QuickData | null>(null)
  const [loadingQuick, setLoadingQuick] = useState(false)

  // Reste à qualifier (compteurs, 24 h, rattrapage) — ~1 s, chargé à part
  const [backlogData, setBacklogData] = useState<BacklogData | null>(null)
  const [loadingBacklog, setLoadingBacklog] = useState(false)

  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [batchSize, setBatchSize] = useState<number>(50)
  const [cronStatus, setCronStatus] = useState<'IDLE' | 'SAVING' | 'ERROR'>('IDLE')
  const [resolutionError, setResolutionError] = useState('')

  const [isRunningManual, setIsRunningManual] = useState(false)
  const [manualRunSummary, setManualRunSummary] = useState<ManualRunSummary | null>(null)
  const [manualRunError, setManualRunError] = useState('')

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return

    let cancelled = false
    async function loadQuick() {
      try {
        setLoadingQuick(true)
        setError('')
        const res = await fetch('/api/settings/encountered-player-resolution?mode=quick', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Chargement rapide impossible')

        if (!cancelled && data?.data) {
          setQuickData(data.data as QuickData)
          if (data.data.config?.batchSize) {
            setBatchSize(data.data.config.batchSize)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement rapide impossible')
      } finally {
        if (!cancelled) setLoadingQuick(false)
      }
    }

    void loadQuick()
    return () => {
      cancelled = true
    }
  }, [authenticated, isSuperUser, loading, refreshKey])

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return

    let cancelled = false
    async function loadBacklog() {
      try {
        setLoadingBacklog(true)
        const res = await fetch('/api/settings/encountered-player-resolution?mode=backlog', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Chargement du reste à qualifier impossible')

        if (!cancelled && data?.data) {
          setBacklogData(data.data as BacklogData)
        }
      } catch (err) {
        console.warn('Erreur chargement backlog:', err)
      } finally {
        if (!cancelled) setLoadingBacklog(false)
      }
    }

    void loadBacklog()
    return () => {
      cancelled = true
    }
  }, [authenticated, isSuperUser, loading, refreshKey])

  async function saveConfig(enabled: boolean) {
    if (cronStatus === 'SAVING') return
    try {
      setCronStatus('SAVING')
      setResolutionError('')
      const response = await fetch('/api/settings/encountered-player-resolution', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled, batchSize }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? 'Erreur inattendue')

      setQuickData((prev) => (prev ? { ...prev, config: { enabled, batchSize } } : prev))
      setCronStatus('IDLE')
    } catch (err) {
      setCronStatus('ERROR')
      setResolutionError(err instanceof Error ? err.message : 'Erreur inattendue')
    }
  }

  async function handleTriggerManualRun() {
    try {
      setIsRunningManual(true)
      setManualRunSummary(null)
      setManualRunError('')

      const res = await fetch('/api/settings/encountered-player-resolution/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Erreur serveur HTTP ${res.status}`)
      }

      setManualRunSummary(data.summary as ManualRunSummary)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setManualRunError(err instanceof Error && err.message ? err.message : 'Échec de la passe manuelle')
    } finally {
      setIsRunningManual(false)
    }
  }

  if (loading || !authenticated || !isSuperUser) return null

  const backlog = backlogData?.backlog
  const backlogPending = !backlogData && loadingBacklog
  const toDiscover = (backlog?.neverAttempted ?? 0) + (backlog?.retryPending ?? 0)
  const cronEnabled = Boolean(quickData?.config?.enabled)
  const runs = quickData?.recentRuns ?? []

  const kpis: Kpi[] = [
    {
      label: 'Jamais tentés',
      value: backlogPending ? '…' : formatCount(backlog?.neverAttempted),
      detail: 'pseudo connu, clan jamais demandé (croisés 2 fois et plus)',
      icon: Zap,
      color: 'var(--game-sky)',
    },
    {
      label: 'À relancer',
      value: backlogPending ? '…' : formatCount(backlog?.retryPending),
      detail: 'échec passager, retenté automatiquement',
      icon: RotateCw,
      color: 'var(--game-warn)',
    },
    {
      label: 'Sans réponse',
      value: backlogPending ? '…' : formatCount(backlog?.failed),
      detail: 'cinq tentatives échouées',
      icon: UserX,
      color: 'var(--game-neg)',
    },
    {
      label: 'Résolus en 24 h',
      value: backlogPending ? '…' : `${formatCount(backlogData?.resolutionsLast24h?.withClan)} / ${formatCount(backlogData?.resolutionsLast24h?.withoutClan)}`,
      detail: 'avec clan / sans clan',
      icon: CheckCircle2,
      color: 'var(--game-pos)',
    },
    {
      label: 'Rattrapage',
      value: backlogPending
        ? '…'
        : backlogData?.estimatedCatchUpDays === null || backlogData?.estimatedCatchUpDays === undefined
          ? '—'
          : `${backlogData.estimatedCatchUpDays.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`,
      detail: 'au rythme du cron et du lot',
      icon: Timer,
      color: 'var(--game-gold)',
    },
    {
      label: 'Cadence',
      value: quickData?.cron?.expression || (loadingQuick ? '…' : 'Désactivé'),
      detail: quickData?.cron?.description || 'expression du cron',
      icon: Clock,
      color: 'var(--theme-ui-text-muted)',
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5" aria-labelledby="resolution-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="resolution-title" className="t-section-title m-0">
            Résolution des clans adverses
          </h2>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loadingQuick || loadingBacklog}
            className="app-btn app-btn--sm app-btn--secondary gap-1.5"
            title="Recharger les données de l’onglet"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loadingQuick || loadingBacklog ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </button>
        </div>
        <p className="t-meta m-0">
          Débit du cron de résolution, joueurs à qualifier et passe manuelle. Le débit PUBG est partagé avec les autres
          traitements :{' '}
          <Link href="/settings/pubg-api" className="app-link font-semibold">
            API PUBG
          </Link>
          .
        </p>
        <FormFeedback error={error} />
      </section>

      <Callout tone="sky" icon={Info} title="Le clan n’est pas dans les données de match">
        Pseudo et identifiant de chaque joueur sont connus dès la fin d’une partie, mais PUBG n’y indique pas son clan. Le cron
        interroge l’API joueur par joueur pour le découvrir, sans dépasser les quotas.
      </Callout>

      {backlog ? (
        <div className="app-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <span className="flex flex-col gap-0.5">
            <span className="t-label">Joueurs à découvrir</span>
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="t-hero t-hero--md text-gray-900">{formatCount(toDiscover)}</span>
              <span className="t-meta">
                {formatCount(backlog.neverAttempted)} jamais tentés · {formatCount(backlog.retryPending)} à relancer
              </span>
            </span>
          </span>
          <Link href="/settings/players/triage" className="app-btn app-btn--sm app-btn--secondary">
            Ouvrir le triage
          </Link>
        </div>
      ) : null}

      <KpiGrid items={kpis} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" />

      <SectionCard id="resolution-settings" icon={SlidersHorizontal} title="Réglages du cron" meta="Taille du lot et activation ; une passe manuelle traite un lot tout de suite.">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="batchSize" className="t-label" title="Nombre maximum de joueurs distincts traités à chaque passage du cron">
              Taille du lot
            </label>
            <span className="flex items-center gap-2">
              <input
                id="batchSize"
                type="number"
                min="1"
                max="100"
                className="app-input w-24"
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
              />
              <button
                type="button"
                disabled={cronStatus === 'SAVING' || batchSize === quickData?.config?.batchSize}
                onClick={() => void saveConfig(cronEnabled)}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Enregistrer
              </button>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Switch
              checked={cronEnabled}
              onChange={(enabled) => void saveConfig(enabled)}
              disabled={cronStatus === 'SAVING' || !quickData}
              labelledBy="resolution-cron-label"
            />
            <span id="resolution-cron-label" className="t-body flex items-center gap-1.5 text-gray-900">
              <Activity className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {cronStatus === 'SAVING' ? 'Modification…' : cronEnabled ? 'Cron actif' : 'Cron désactivé'}
            </span>
          </div>

          <button
            type="button"
            disabled={isRunningManual}
            onClick={() => void handleTriggerManualRun()}
            className="app-btn app-btn--md app-btn--primary gap-1.5 sm:ml-auto"
            title="Lancer une passe de résolution sans attendre le cron"
          >
            <Play className={`h-4 w-4 ${isRunningManual ? 'animate-pulse' : ''}`} aria-hidden="true" />
            {isRunningManual ? 'Résolution en cours…' : 'Résoudre un lot maintenant'}
          </button>
        </div>

        {manualRunSummary ? (
          <p className="t-body t-pos m-0 flex items-start gap-2" role="status">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Lot traité : {manualRunSummary.uniqueCandidatesSelected} joueurs visés, {manualRunSummary.resolvedWithClan} résolus avec
            clan, {manualRunSummary.resolvedWithoutClan} sans clan, {manualRunSummary.resolvedFromCache} depuis le cache,{' '}
            {manualRunSummary.failed} échecs.
          </p>
        ) : null}
        {manualRunError ? (
          <p className="t-body t-neg m-0 flex items-start gap-2" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {manualRunError}
          </p>
        ) : null}
        <FormFeedback error={resolutionError} />
      </SectionCard>

      <SectionCard
        id="resolution-runs"
        icon={Calendar}
        title="Dernières exécutions"
        aside={runs.length > 0 ? <Tag tone="neutral">{runs.length} passages</Tag> : undefined}
      >
        {loadingQuick && !quickData ? (
          <ListSkeleton rows={3} />
        ) : runs.length === 0 ? (
          <EmptyState icon={Calendar} title="Aucune exécution enregistrée pour le moment" />
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
              {runs.map((run) => (
                <li key={run.id} className="app-panel-muted flex flex-col gap-1 px-3 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="t-body font-semibold text-gray-900">{new Date(run.startedAt).toLocaleString('fr-FR')}</span>
                    <RunStatus run={run} />
                  </span>
                  <span className="t-meta t-num">
                    {run.uniqueCandidatesSelected ?? run.candidatesSelected ?? '—'} visés · {runResolved(run) ?? '—'} résolus ·{' '}
                    {run.failed ?? '—'} échecs · {run.durationMs ? `${(run.durationMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : '—'}
                  </span>
                  {run.errorMessage ? <span className="t-meta t-neg break-all">{run.errorMessage}</span> : null}
                </li>
              ))}
            </ul>
            <div className="app-table-shell hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <SortableTh align="left">Date</SortableTh>
                    <SortableTh align="left">Source · statut</SortableTh>
                    <SortableTh>Durée</SortableTh>
                    <SortableTh>Visés</SortableTh>
                    <SortableTh>Résolus</SortableTh>
                    <SortableTh>Échecs</SortableTh>
                    <SortableTh align="left">Détail</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="app-table-row">
                      <td className="whitespace-nowrap px-[9px] py-2 font-semibold text-gray-900">{new Date(run.startedAt).toLocaleString('fr-FR')}</td>
                      <td className="px-[9px] py-2">
                        <RunStatus run={run} />
                      </td>
                      <td className="t-num px-[9px] py-2 text-right text-gray-700">
                        {run.durationMs ? `${(run.durationMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : '—'}
                      </td>
                      <td className="t-num px-[9px] py-2 text-right font-semibold text-gray-900">
                        {run.uniqueCandidatesSelected ?? run.candidatesSelected ?? '—'}
                      </td>
                      <td className="t-num px-[9px] py-2 text-right font-semibold t-pos">{runResolved(run) ?? '—'}</td>
                      <td className="t-num px-[9px] py-2 text-right t-neg">{run.failed ?? '—'}</td>
                      <td className="t-meta max-w-[240px] truncate px-[9px] py-2" title={run.errorMessage || ''}>
                        {run.errorMessage || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
