'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import {
  AlertTriangle,
  Database,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Square,
  Loader2,
  Calendar,
  ShieldCheck,
  HardDrive,
  Zap,
  Info,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function formatGo(mb: number | null | undefined) {
  if (mb === null || mb === undefined) return '—'
  return `${(mb / 1024).toFixed(2)} Go`
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

type TableStats = {
  tableName: string
  rowCount: number
  dataSizeMb: number
  indexSizeMb: number
  totalSizeMb: number
  dataFreeMb: number
}

type GlobalStats = {
  totalDataMb: number
  totalIndexMb: number
  totalSizeMb: number
  totalFreeMb: number
}

type DbStatsResponse = {
  globalStats: GlobalStats
  tables: TableStats[]
}

/**
 * Instantané de comptage publié par le cron `telemetry_geo_purge_count` (une passe nocturne pour
 * tous les seuils : le scan coûte ~4 min, il n'est pas rejouable au fil des clics). Types
 * volontairement redéclarés ici plutôt qu'importés de `@/lib/telemetry-geo-purge`, qui tire Prisma.
 */
type ThresholdCount = {
  cutoff: string | null
  targeted: number
  protectedMatches: number
  purgeable: number
}

type PurgeCounts = {
  computedAt: string
  durationMs: number
  totalRows: number
  totalWithGeo: number
  protectedMatches: number
  byThreshold: Record<string, ThresholdCount | undefined>
}

type PurgeRun = {
  status: 'running' | 'done' | 'cancelled' | 'failed'
  olderThanDays: number | string
  cutoff: string | null
  target: number
  purged: number
  startedAt: string
  updatedAt: string
  finishedAt?: string
  error?: string
  cancelRequested?: boolean
}

type OptimizeAssessment = {
  table: string
  sizes: TableStats | null
  disk: { measured: boolean; path: string | null; freeMb: number | null; totalMb: number | null; reason?: string }
  requiredMb: number
  verdict: 'useful' | 'pointless' | 'blocked_disk' | 'blocked_unknown_disk' | 'running'
  reason: string
}

type OptimizeRun = {
  status: 'running' | 'done' | 'failed'
  table: string
  startedAt: string
  updatedAt: string
  finishedAt?: string
  reclaimedMb?: number
  sizeBeforeMb?: number
  sizeAfterMb?: number
  error?: string
}

type PurgeStatusResponse = {
  counts: PurgeCounts | null
  run: PurgeRun | null
  recounting: boolean
  totalRows: number
}

const AGE_OPTIONS = [
  { value: '14', label: 'Plus de 14 jours', desc: 'Recommandé — conserve 100% des tracés récents', badge: 'Standard PUBG' },
  { value: '30', label: 'Plus de 30 jours', desc: 'Conserve le dernier mois complet', badge: '1 mois' },
  { value: '60', label: 'Plus de 60 jours', desc: 'Conserve les deux derniers mois', badge: '2 mois' },
  { value: '90', label: 'Plus de 90 jours', desc: 'Conserve le trimestre récent', badge: '1 trimestre' },
  { value: 'all', label: 'Tous les matchs', desc: 'Purge intégrale pour libérer le maximum d’espace', badge: 'Total' },
]

export default function DatabaseStatsPage() {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  
  const { loading: sessionLoading, authenticated, isSuperUser } = useAuthSession()

  const [stats, setStats] = useState<DbStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Age Threshold Filter
  const [selectedAge, setSelectedAge] = useState<string>('14')

  // Purge state
  const [purgeCounts, setPurgeCounts] = useState<PurgeCounts | null>(null)
  const [purgeRun, setPurgeRun] = useState<PurgeRun | null>(null)
  const [recounting, setRecounting] = useState(false)
  const [purgeStatusError, setPurgeStatusError] = useState('')
  const [loadingPurgeStatus, setLoadingPurgeStatus] = useState(false)
  const [purgeError, setPurgeError] = useState('')

  // Table optimization state
  const [optimizeAssessment, setOptimizeAssessment] = useState<OptimizeAssessment | null>(null)
  const [optimizeRun, setOptimizeRun] = useState<OptimizeRun | null>(null)
  const [optimizeMsg, setOptimizeMsg] = useState('')
  const [optimizeError, setOptimizeError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    if (sessionLoading) return
    if (!authenticated || !isSuperUser) {
      router.replace(clanId ? `/clans/${clanId}/overview` : '/clans')
    }
  }, [authenticated, isSuperUser, clanId, router, sessionLoading])

  const fetchPurgeStatus = useCallback(async () => {
    try {
      setLoadingPurgeStatus(true)
      const res = await fetch('/api/superuser/database/purge-telemetry', { cache: 'no-store' })

      if (!res.ok) {
        // Un statut indisponible reste indisponible : le traduire en « 0 match » ferait croire
        // qu'il n'y a rien à purger.
        setPurgeCounts(null)
        setPurgeStatusError(`Statut de purge indisponible (HTTP ${res.status}).`)
        return
      }

      const data = (await res.json()) as PurgeStatusResponse
      setPurgeCounts(data.counts)
      setPurgeRun(data.run)
      setRecounting(data.recounting)
      setPurgeStatusError('')
    } catch (err) {
      console.error('Erreur lecture statut de purge:', err)
      setPurgeCounts(null)
      setPurgeStatusError(err instanceof Error ? err.message : 'Statut de purge indisponible.')
    } finally {
      setLoadingPurgeStatus(false)
    }
  }, [])

  // La purge et le recomptage tournent côté serveur : on suit leur avancement en relisant l'état,
  // ce qui permet de quitter la page sans les interrompre.
  const isPurging = purgeRun?.status === 'running'
  useEffect(() => {
    if (!isPurging && !recounting) return
    const timer = setTimeout(() => {
      void fetchPurgeStatus()
    }, 2000)
    return () => clearTimeout(timer)
  }, [isPurging, recounting, purgeRun, purgeCounts, fetchPurgeStatus])

  const fetchOptimizeState = useCallback(async () => {
    try {
      const res = await fetch('/api/superuser/database/optimize?table=SquadMatchTelemetry', {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as { assessment: OptimizeAssessment; run: OptimizeRun | null }
      setOptimizeAssessment(data.assessment)
      setOptimizeRun(data.run)
    } catch (err) {
      console.error('Erreur lecture de l’état de compactage:', err)
    }
  }, [])

  // Le compactage tourne sur le serveur : on suit son avancement en relisant l'état.
  const isOptimizing = optimizeRun?.status === 'running'
  useEffect(() => {
    if (!isOptimizing) return
    const timer = setTimeout(() => {
      void fetchOptimizeState()
    }, 5000)
    return () => clearTimeout(timer)
  }, [isOptimizing, optimizeRun, fetchOptimizeState])

  const fetchStats = async () => {
    try {
      setLoading(true)
      setError('')
      const [statsRes] = await Promise.all([
        fetch('/api/superuser/database'),
        fetchPurgeStatus(),
        fetchOptimizeState(),
      ])
      if (!statsRes.ok) throw new Error('Erreur lors de la récupération des statistiques')
      const data = await statsRes.json()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated && isSuperUser) {
      void fetchStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, isSuperUser])

  // Tous les seuils sont dans l'instantané : changer de seuil n'appelle plus le serveur.
  const handleAgeChange = (newAge: string) => {
    setSelectedAge(newAge)
    setPurgeError('')
  }

  const selectedCount = purgeCounts?.byThreshold?.[selectedAge] ?? null
  /** Le volume à purger n'est exploitable que si un comptage a été publié. */
  const matchesToPurge = selectedCount ? selectedCount.purgeable : null
  const purgeCountKnown = matchesToPurge !== null

  // Sorting
  const [sortField, setSortField] = useState<keyof TableStats>('totalSizeMb')
  const [sortAsc, setSortAsc] = useState(false)

  const sortedTables = useMemo(() => {
    if (!stats) return []
    return [...stats.tables].sort((a, b) => {
      if (a[sortField] < b[sortField]) return sortAsc ? -1 : 1
      if (a[sortField] > b[sortField]) return sortAsc ? 1 : -1
      return 0
    })
  }, [stats, sortField, sortAsc])

  const handleSort = (field: keyof TableStats) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  /** Efface le compte rendu de la dernière purge. N'annule rien, ne supprime aucune donnée. */
  const handleDismissPurgeRun = async () => {
    setPurgeRun(null)
    try {
      await fetch('/api/superuser/database/purge-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
    } catch (err) {
      console.error('Erreur lors du masquage du compte rendu de purge:', err)
    }
  }

  /** Idem pour le compte rendu du dernier compactage. */
  const handleDismissOptimizeRun = async () => {
    setOptimizeRun(null)
    setOptimizeMsg('')
    try {
      await fetch('/api/superuser/database/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
    } catch (err) {
      console.error('Erreur lors du masquage du compte rendu de compactage:', err)
    }
  }

  const handleCancelPurge = async () => {
    try {
      await fetch('/api/superuser/database/purge-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      void fetchPurgeStatus()
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : 'Impossible d’interrompre la purge')
    }
  }

  // Le comptage complet coûte ~4 min de lecture disque : il est normalement produit chaque nuit
  // par le cron, et ce bouton ne sert qu'à le rafraîchir à la demande.
  const handleRecount = async () => {
    setPurgeError('')
    try {
      const res = await fetch('/api/superuser/database/purge-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recount' }),
      })
      if (!res.ok) throw new Error(`Erreur serveur HTTP ${res.status}`)
      setRecounting(true)
      void fetchPurgeStatus()
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : 'Recomptage impossible')
    }
  }

  const handleOptimizeTable = async (
    table: string = 'SquadMatchTelemetry',
    action: 'optimize' | 'analyze' = 'optimize'
  ) => {
    setOptimizeMsg('')
    setOptimizeError('')

    // Le verdict affiché ne concerne qu'une table : pour une autre, on laisse le serveur trancher
    // (il réévalue de toute façon avant de lancer quoi que ce soit).
    const assessment = optimizeAssessment?.table === table ? optimizeAssessment : null

    if (action === 'optimize') {
      const verdict = assessment?.verdict
      // Le serveur refusera de toute façon, mais autant ne pas faire cliquer dans le vide.
      if (verdict === 'blocked_disk' || verdict === 'blocked_unknown_disk') {
        setOptimizeError(assessment?.reason ?? 'Compactage impossible dans l’état actuel du serveur.')
        return
      }
      const gain = assessment?.sizes?.dataFreeMb ?? 0
      const taille = assessment?.sizes?.totalSizeMb ?? 0
      if (
        !confirm(
          `Compacter la table ${table} ?\n\n` +
            `Récupérable : ${(gain / 1024).toFixed(2)} Go. Réécrit : ${(taille / 1024).toFixed(2)} Go.\n` +
            `L'opération reconstruit entièrement le fichier de données et peut durer plusieurs dizaines de minutes.\n\n` +
            `Elle s'exécute sur le serveur : vous pouvez quitter cette page.`
        )
      ) {
        return
      }
    }

    if (action === 'analyze') setAnalyzing(true)

    try {
      const res = await fetch('/api/superuser/database/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table,
          action,
          // Un compactage jugé « inutile » reste permis sur demande explicite ; un compactage jugé
          // dangereux ne l'est jamais.
          force: action === 'optimize' && assessment?.verdict === 'pointless',
        }),
      })

      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        durationMs?: number
        stats?: TableStats | null
        message?: string
        run?: OptimizeRun
      } | null

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || `Erreur serveur HTTP ${res.status}`)
      }

      if (action === 'analyze') {
        const durSec = payload.durationMs ? (payload.durationMs / 1000).toFixed(1) : '1'
        setOptimizeMsg(`${payload.message || 'Opération réussie'} en ${durSec}s.`)
      } else {
        setOptimizeMsg(payload.message || 'Compactage lancé sur le serveur.')
        if (payload.run) setOptimizeRun(payload.run)
      }

      void fetchOptimizeState()
      void fetchStats()
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : 'Échec de l’opération de compactage')
    } finally {
      if (action === 'analyze') setAnalyzing(false)
    }
  }

  const handlePurge = async () => {
    // Statut inconnu ≠ zéro match : sans cette garde, un comptage indisponible annonçait à tort
    // « Aucun match ne correspond au filtre » et la purge sortait sans rien faire.
    if (matchesToPurge === null) {
      setPurgeError(
        purgeStatusError ||
          'Aucun comptage n’a encore été publié pour ce seuil. Lancez un recomptage et attendez son résultat.'
      )
      return
    }

    if (matchesToPurge === 0) {
      setPurgeError('Aucun match ne correspond au filtre sélectionné pour la purge.')
      return
    }

    const ageLabel =
      selectedAge === 'all'
        ? 'l’ensemble de l’historique (tous les matchs)'
        : `les matchs de plus de ${selectedAge} jours`
    const protege = selectedCount?.protectedMatches ?? 0

    if (
      !confirm(
        `Êtes-vous sûr de vouloir purger l'historique de géolocalisation pour ${ageLabel} (${matchesToPurge.toLocaleString()} matchs) ?

` +
          `${protege.toLocaleString()} matchs protégés (Top 1 et parties personnalisées) sont conservés.
` +
          `La purge s'exécute sur le serveur : vous pouvez quitter cette page sans l'interrompre.`
      )
    ) {
      return
    }

    setPurgeError('')
    try {
      const res = await fetch('/api/superuser/database/purge-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', olderThanDays: selectedAge }),
      })
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        run?: PurgeRun
      } | null

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || `Erreur serveur HTTP ${res.status} lors du démarrage de la purge`)
      }

      if (payload.run) setPurgeRun(payload.run)
      void fetchPurgeStatus()
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : 'Erreur inattendue lors de la purge')
    }
  }

  if (sessionLoading || !authenticated || !isSuperUser) return null

  const progressPercent =
    purgeRun && purgeRun.target > 0
      ? Math.min(100, Math.round((purgeRun.purged / purgeRun.target) * 100))
      : 0

  return (
    <main className="app-container app-main flex-1 space-y-6 overflow-hidden">
      <NavigationTrail
        currentLabel="Base de données"
        currentHref="/settings/superuser/database"
        fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
      />

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <SettingsPageHeader
          title="État de la base de données"
          subtitle="Visualisez la taille occupée par les tables pour anticiper le stockage."
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleOptimizeTable('SquadMatchTelemetry', 'analyze')}
            disabled={loading || isOptimizing || isPurging}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs ring-1 ring-slate-300 ring-inset hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700"
            title="Recalculer les statistiques de cardinalité (rapide)"
          >
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            Recalculer stats
          </button>

          <button
            onClick={fetchStats}
            disabled={loading || isPurging || isOptimizing}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs ring-1 ring-slate-300 ring-inset hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700"
          >
            <RefreshCw className={cx('h-4 w-4', (loading || loadingPurgeStatus || isOptimizing) && 'animate-spin')} />
            Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {stats && (
        <>
          {/* Global Metrics Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="app-panel p-4 sm:p-5">
              <span className="text-xs sm:text-sm font-medium text-[var(--theme-ui-text-muted)]">Données brutes (Data)</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--theme-ui-text)]">
                  {stats.globalStats.totalDataMb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-[var(--theme-ui-text-muted)]">Mo</span>
              </div>
            </div>

            <div className="app-panel p-4 sm:p-5">
              <span className="text-xs sm:text-sm font-medium text-[var(--theme-ui-text-muted)]">Index</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--theme-ui-text)]">
                  {stats.globalStats.totalIndexMb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-[var(--theme-ui-text-muted)]">Mo</span>
              </div>
            </div>

            <div className="app-panel p-4 sm:p-5 border-l-4 border-l-amber-500">
              <span className="text-xs sm:text-sm font-medium text-[var(--theme-ui-text-muted)]">Espace libre / Récupérable</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                  {stats.globalStats.totalFreeMb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-[var(--theme-ui-text-muted)]">Mo</span>
              </div>
            </div>

            <div className="app-panel p-4 sm:p-5 border-l-4 border-l-indigo-500 dark:border-l-indigo-400">
              <span className="text-xs sm:text-sm font-medium text-[var(--theme-ui-text-muted)]">Taille Totale Fichiers DB</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                  {stats.globalStats.totalSizeMb.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-[var(--theme-ui-text-muted)]">Mo</span>
                <span className="text-xs text-[var(--theme-ui-text-muted)]">
                  ({(stats.globalStats.totalSizeMb / 1024).toFixed(2)} Go)
                </span>
              </div>
            </div>
          </div>

          {/* Table List */}
          <div className="app-panel overflow-hidden">
            <div className="border-b border-[var(--theme-ui-border)] p-4 sm:flex sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--theme-ui-text)]">Détail par table</h3>
                <p className="text-xs text-[var(--theme-ui-text-muted)] mt-1">
                  Cliquez sur les colonnes pour trier. L&apos;espace libre correspond aux pages libérées en attente de compactage (.ibd).
                </p>
              </div>
              <span className="text-xs font-medium text-[var(--theme-ui-text-muted)] mt-2 sm:mt-0 block sm:inline">
                {stats.tables.length} tables analysées
              </span>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[var(--theme-ui-border)] bg-[var(--theme-ui-panel-muted)] text-[var(--theme-ui-text-muted)]">
                    <th
                      onClick={() => handleSort('tableName')}
                      className="cursor-pointer px-3 sm:px-4 py-3 font-semibold hover:text-[var(--theme-ui-text)]"
                    >
                      Nom de la table {sortField === 'tableName' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => handleSort('rowCount')}
                      className="hidden sm:table-cell cursor-pointer px-3 sm:px-4 py-3 font-semibold text-right hover:text-[var(--theme-ui-text)]"
                    >
                      Lignes {sortField === 'rowCount' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => handleSort('dataSizeMb')}
                      className="hidden md:table-cell cursor-pointer px-3 sm:px-4 py-3 font-semibold text-right hover:text-[var(--theme-ui-text)]"
                    >
                      Données {sortField === 'dataSizeMb' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => handleSort('indexSizeMb')}
                      className="hidden lg:table-cell cursor-pointer px-3 sm:px-4 py-3 font-semibold text-right hover:text-[var(--theme-ui-text)]"
                    >
                      Index {sortField === 'indexSizeMb' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => handleSort('dataFreeMb')}
                      className="hidden sm:table-cell cursor-pointer px-3 sm:px-4 py-3 font-semibold text-right hover:text-[var(--theme-ui-text)] text-amber-600 dark:text-amber-400"
                    >
                      Libre {sortField === 'dataFreeMb' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => handleSort('totalSizeMb')}
                      className="cursor-pointer px-3 sm:px-4 py-3 font-semibold text-right hover:text-[var(--theme-ui-text)]"
                    >
                      Total (Mo) {sortField === 'totalSizeMb' && (sortAsc ? '↑' : '↓')}
                    </th>
                    <th className="px-3 sm:px-4 py-3 font-semibold text-right">% du total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--theme-ui-border)]">
                  {sortedTables.map((t) => {
                    const percentage =
                      stats.globalStats.totalSizeMb > 0
                        ? (t.totalSizeMb / stats.globalStats.totalSizeMb) * 100
                        : 0
                    const isTelemetry = t.tableName === 'SquadMatchTelemetry'
                    return (
                      <tr
                        key={t.tableName}
                        className={cx(
                          "transition-colors",
                          isTelemetry ? "bg-amber-500/5 hover:bg-amber-500/10 font-medium" : "hover:bg-[var(--theme-ui-panel-muted)]/50"
                        )}
                      >
                        <td className="px-3 sm:px-4 py-3 text-[var(--theme-ui-text)]">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="font-semibold text-xs sm:text-sm">{t.tableName}</span>
                            {isTelemetry && (
                              <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0">
                                Télémétrie
                              </span>
                            )}
                            {isTelemetry && (
                              <button
                                type="button"
                                onClick={() => handleOptimizeTable(t.tableName, 'optimize')}
                                disabled={isOptimizing || isPurging}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 disabled:opacity-50 shrink-0"
                                title="Compacter et libérer l'espace disque de cette table"
                              >
                                <HardDrive className="h-3 w-3" />
                                Compacter
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="hidden sm:table-cell px-3 sm:px-4 py-3 text-right text-[var(--theme-ui-text-muted)]">
                          {t.rowCount.toLocaleString()}
                        </td>
                        <td className="hidden md:table-cell px-3 sm:px-4 py-3 text-right text-[var(--theme-ui-text-muted)]">
                          {t.dataSizeMb.toFixed(2)}
                        </td>
                        <td className="hidden lg:table-cell px-3 sm:px-4 py-3 text-right text-[var(--theme-ui-text-muted)]">
                          {t.indexSizeMb.toFixed(2)}
                        </td>
                        <td className="hidden sm:table-cell px-3 sm:px-4 py-3 text-right font-medium text-amber-600 dark:text-amber-400">
                          {t.dataFreeMb > 0 ? `${t.dataFreeMb.toFixed(0)} Mo` : '—'}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right font-semibold text-[var(--theme-ui-text)] whitespace-nowrap">
                          {t.totalSizeMb.toFixed(2)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-14 sm:w-24 bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-300/40 dark:border-slate-700/60 shrink-0">
                              <div
                                className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-300"
                                style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 w-11 text-right shrink-0">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Purge Section */}
          <div className="app-panel p-4 sm:p-6 border-l-4 border-l-amber-500">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="mt-1 bg-amber-100 p-2 rounded-full text-amber-600 dark:bg-amber-900/30 dark:text-amber-500 shrink-0">
                <Database className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-[var(--theme-ui-text)] flex items-center gap-2">
                    Purger l&apos;historique de géolocalisation
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-[var(--theme-ui-text-muted)] max-w-3xl">
                    Cette action vide les colonnes <strong>positionSamples</strong> et <strong>trajectorySegments</strong> (table <code>SquadMatchTelemetry</code>). 
                    Ces deux colonnes représentent généralement plus de 90% de la taille de la base de données.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p>
                    <strong>Préservation des stats :</strong> Les statistiques de combat (kills, dégâts, recalls, armes, trophées) ne sont <strong>pas</strong> impactées. En revanche, le tracé GPS continu des joueurs sur une carte 2D ne sera plus disponible pour les matchs purgés.
                  </p>
                </div>

                {/* Age Threshold Selector */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                      Ancienneté des matchs à purger :
                    </label>
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      Replays récents protégés
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    {AGE_OPTIONS.map((opt) => {
                      const isSelected = selectedAge === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={isPurging}
                          onClick={() => handleAgeChange(opt.value)}
                          className={cx(
                            "flex flex-col text-left p-3 rounded-xl border transition-all relative",
                            isSelected
                              ? "border-indigo-500 dark:border-indigo-400 bg-white dark:bg-slate-800 shadow-xs ring-2 ring-indigo-500/20"
                              : "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/70 opacity-80 hover:opacity-100",
                            isPurging && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className={cx(
                              "text-xs font-bold",
                              isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300"
                            )}>
                              {opt.label}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              {opt.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                            {opt.desc}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Volumes publiés par le comptage nocturne */}
                {purgeCounts && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <span className="text-xs text-slate-500">Matchs portant encore leurs tracés</span>
                      <p className="mt-1 text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">
                        {purgeCounts.totalWithGeo.toLocaleString()}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          sur {purgeCounts.totalRows.toLocaleString()}
                        </span>
                      </p>
                    </div>

                    <div className={cx(
                      "rounded-lg border p-3",
                      matchesToPurge === null
                        ? "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40"
                        : matchesToPurge > 0
                        ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-900/20"
                        : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-900/20"
                    )}>
                      <span className="text-xs text-slate-500">
                        À purger ({selectedAge === 'all' ? 'tous' : `> ${selectedAge}j`})
                      </span>
                      {matchesToPurge === null ? (
                        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">&mdash;</p>
                      ) : (
                        <p className={cx(
                          "mt-1 text-sm sm:text-base font-semibold",
                          matchesToPurge > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                        )}>
                          {matchesToPurge.toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/10">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        Protégés (Top 1 et parties personnalisées)
                      </span>
                      <p className="mt-1 text-sm sm:text-base font-semibold text-emerald-700 dark:text-emerald-400">
                        {selectedCount ? selectedCount.protectedMatches.toLocaleString() : '—'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Fraîcheur du comptage : borne figée à minuit, la journée en cours n'y entre pas */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                  {purgeCounts ? (
                    <p>
                      Comptage du <strong>{formatDateTime(purgeCounts.computedAt)}</strong>
                      {selectedCount?.cutoff && (
                        <>
                          {' '}&mdash; arrêté aux matchs antérieurs au{' '}
                          <strong>{formatDateTime(selectedCount.cutoff)}</strong>, la journée en cours n&apos;est pas
                          comptée.
                        </>
                      )}{' '}
                      Recalculé chaque nuit ; un parcours complet de la table prend environ{' '}
                      {Math.round(purgeCounts.durationMs / 1000)} s.
                    </p>
                  ) : (
                    <p>
                      Aucun comptage publié pour l&apos;instant. Il est produit chaque nuit ; vous pouvez aussi le
                      lancer maintenant &mdash; il dure environ 4 minutes et tourne sur le serveur.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleRecount}
                    disabled={recounting || isPurging}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <RefreshCw className={cx('h-3.5 w-3.5', recounting && 'animate-spin')} />
                    {recounting ? 'Comptage en cours…' : 'Recompter maintenant'}
                  </button>
                </div>

                {purgeStatusError && !purgeCounts && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <p>
                      <strong>Volume à purger inconnu :</strong> {purgeStatusError} La purge reste bloquée tant que ce
                      nombre n&apos;est pas connu &mdash; un statut indisponible ne signifie pas qu&apos;il n&apos;y a rien à purger.
                    </p>
                  </div>
                )}

                {/* Purge en cours : pilotée par le serveur, la page ne fait que la suivre */}
                {isPurging && purgeRun && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                        Purge en cours ({purgeRun.olderThanDays === 'all' ? 'tous matchs' : `> ${purgeRun.olderThanDays} jours`})
                      </span>
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                        {progressPercent}%
                      </span>
                    </div>

                    <div className="h-2.5 w-full bg-blue-200 dark:bg-blue-900/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 ease-out rounded-full"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-700 dark:text-blue-300">
                      <span>
                        Nettoyés : <strong>{purgeRun.purged.toLocaleString()}</strong> / {purgeRun.target.toLocaleString()}
                      </span>
                      <span>
                        Restants : <strong>{Math.max(0, purgeRun.target - purgeRun.purged).toLocaleString()}</strong>
                      </span>
                    </div>

                    <p className="text-xs text-blue-700/80 dark:text-blue-300/80">
                      Elle s&apos;exécute sur le serveur : vous pouvez changer de page ou fermer l&apos;onglet, elle
                      continuera. {purgeRun.cancelRequested && <strong>Interruption demandée, arrêt au prochain lot…</strong>}
                    </p>

                    <button
                      type="button"
                      onClick={handleCancelPurge}
                      disabled={purgeRun.cancelRequested}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
                    >
                      <Square className="h-3 w-3 text-red-500 fill-red-500" />
                      Interrompre la purge
                    </button>
                  </div>
                )}

                {/* Actions et messages */}
                <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4">
                  {!isPurging && (
                    <button
                      type="button"
                      onClick={handlePurge}
                      disabled={!purgeCountKnown || matchesToPurge === 0}
                      className="app-btn app-btn--md gap-2 bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      {purgeCountKnown ? <Trash2 className="h-4 w-4" /> : <Loader2 className={cx('h-4 w-4', recounting && 'animate-spin')} />}
                      {!purgeCountKnown
                        ? purgeStatusError
                          ? 'Statut indisponible'
                          : recounting
                          ? 'Comptage en cours…'
                          : 'Comptage à lancer'
                        : matchesToPurge === 0
                        ? `Aucun match ${selectedAge === 'all' ? '' : `> ${selectedAge}j`} à purger`
                        : selectedAge === 'all'
                        ? `Purger tous les matchs (${matchesToPurge.toLocaleString()})`
                        : `Purger les matchs > ${selectedAge} jours (${matchesToPurge.toLocaleString()})`}
                    </button>
                  )}

                  {matchesToPurge === 0 && !isPurging && (
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Filtre déjà optimisé (0 match à purger)
                    </span>
                  )}

                  {/* Compte rendu d'une purge terminée : une nouvelle, pas un état permanent. Le
                      serveur cesse de le servir au bout de 24 h, et ce bouton l'efface tout de suite. */}
                  {!isPurging && purgeRun?.status === 'done' && (
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Purge terminée le {formatDateTime(purgeRun.finishedAt ?? purgeRun.updatedAt)} :{' '}
                      {purgeRun.purged.toLocaleString()} matchs nettoyés.
                      <button
                        type="button"
                        onClick={handleDismissPurgeRun}
                        className="ml-1 underline decoration-dotted underline-offset-2 hover:no-underline"
                      >
                        Masquer
                      </button>
                    </span>
                  )}

                  {!isPurging && purgeRun?.status === 'cancelled' && (
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                      <Square className="h-3.5 w-3.5" />
                      Purge interrompue après {purgeRun.purged.toLocaleString()} matchs nettoyés.
                      <button
                        type="button"
                        onClick={handleDismissPurgeRun}
                        className="ml-1 underline decoration-dotted underline-offset-2 hover:no-underline"
                      >
                        Masquer
                      </button>
                    </span>
                  )}
                </div>

                {!isPurging && purgeRun?.status === 'failed' && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs sm:text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                    <p className="font-semibold">La purge s&apos;est arrêtée après {purgeRun.purged.toLocaleString()} matchs :</p>
                    <p className="mt-0.5">{purgeRun.error}</p>
                    <p className="mt-1">Relancer la purge reprend là où elle s&apos;est arrêtée : rien n&apos;est à défaire.</p>
                    <button
                      type="button"
                      onClick={handleDismissPurgeRun}
                      className="mt-1 underline decoration-dotted underline-offset-2 hover:no-underline"
                    >
                      Masquer ce message
                    </button>
                  </div>
                )}

                {purgeError && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs sm:text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                    <p className="font-semibold">Détail de l&apos;erreur :</p>
                    <p className="mt-0.5">{purgeError}</p>
                  </div>
                )}

                {/* Compactage InnoDB — verdict mesuré plutôt que bouton nu */}
                <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 sm:p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20 space-y-3">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs sm:text-sm font-semibold text-indigo-950 dark:text-indigo-200">
                        Pourquoi la taille affichée ne diminue-t-elle pas immédiatement après la purge ?
                      </h4>
                      <p className="text-xs text-indigo-900/80 dark:text-indigo-300/80 leading-relaxed">
                        Sous InnoDB, vider des colonnes libère de l&apos;espace <strong>à l&apos;intérieur</strong> du fichier
                        de données (<code>.ibd</code>) mais ne le réduit <strong>jamais</strong> automatiquement. Cet espace est
                        réutilisé par les écritures suivantes : le compactage ne sert qu&apos;à rendre la place au système
                        de fichiers. Il <strong>reconstruit la table entière</strong> et exige autant d&apos;espace disque libre
                        qu&apos;elle occupe — il ne peut donc être ni fractionné ni automatisé.
                      </p>
                    </div>
                  </div>

                  {optimizeAssessment && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="rounded-lg border border-indigo-200/60 bg-white/60 p-2.5 dark:border-indigo-900/40 dark:bg-slate-900/40">
                        <span className="text-[11px] text-slate-500">Taille à réécrire</span>
                        <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {formatGo(optimizeAssessment.sizes?.totalSizeMb)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-indigo-200/60 bg-white/60 p-2.5 dark:border-indigo-900/40 dark:bg-slate-900/40">
                        <span className="text-[11px] text-slate-500">Récupérable (espace libre interne)</span>
                        <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {formatGo(optimizeAssessment.sizes?.dataFreeMb)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-indigo-200/60 bg-white/60 p-2.5 dark:border-indigo-900/40 dark:bg-slate-900/40">
                        <span className="text-[11px] text-slate-500">
                          Disque libre / requis
                        </span>
                        <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {optimizeAssessment.disk.measured
                            ? `${formatGo(optimizeAssessment.disk.freeMb)} / ${formatGo(optimizeAssessment.requiredMb)}`
                            : 'non mesurable'}
                        </p>
                      </div>
                    </div>
                  )}

                  {optimizeAssessment && (
                    <div
                      className={cx(
                        'flex items-start gap-2 rounded-lg border p-3 text-xs',
                        optimizeAssessment.verdict === 'useful'
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : optimizeAssessment.verdict === 'running'
                          ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300'
                          : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400'
                      )}
                    >
                      {optimizeAssessment.verdict === 'useful' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ) : optimizeAssessment.verdict === 'running' ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                      )}
                      <p>{optimizeAssessment.reason}</p>
                    </div>
                  )}

                  {isOptimizing && optimizeRun && (
                    <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      <p>
                        Compactage de <strong>{optimizeRun.table}</strong> en cours depuis{' '}
                        {formatDateTime(optimizeRun.startedAt)}. Il s&apos;exécute sur le serveur : vous pouvez quitter
                        cette page.
                      </p>
                    </div>
                  )}

                  {!isOptimizing && optimizeRun?.status === 'done' && (
                    <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <p>
                        Compactage terminé : {formatGo(optimizeRun.sizeBeforeMb)} → {formatGo(optimizeRun.sizeAfterMb)},
                        soit {formatGo(optimizeRun.reclaimedMb)} rendus au disque.{' '}
                        <button
                          type="button"
                          onClick={handleDismissOptimizeRun}
                          className="underline decoration-dotted underline-offset-2 hover:no-underline"
                        >
                          Masquer
                        </button>
                      </p>
                    </div>
                  )}

                  {!isOptimizing && optimizeRun?.status === 'failed' && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <p>
                        {optimizeRun.error}{' '}
                        <button
                          type="button"
                          onClick={handleDismissOptimizeRun}
                          className="underline decoration-dotted underline-offset-2 hover:no-underline"
                        >
                          Masquer
                        </button>
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOptimizeTable('SquadMatchTelemetry', 'optimize')}
                      disabled={
                        isOptimizing ||
                        isPurging ||
                        !optimizeAssessment ||
                        optimizeAssessment.verdict === 'blocked_disk' ||
                        optimizeAssessment.verdict === 'blocked_unknown_disk'
                      }
                      className="inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-indigo-600 px-3 sm:px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isOptimizing ? (
                        <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                      ) : (
                        <HardDrive className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                      {isOptimizing
                        ? 'Compactage en cours…'
                        : optimizeAssessment?.verdict === 'blocked_disk' ||
                          optimizeAssessment?.verdict === 'blocked_unknown_disk'
                        ? 'Compactage indisponible'
                        : 'Compacter SquadMatchTelemetry (OPTIMIZE)'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOptimizeTable('SquadMatchTelemetry', 'analyze')}
                      disabled={analyzing || isOptimizing || isPurging}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-300 shadow-xs hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700 disabled:opacity-50"
                    >
                      <Zap className={cx('h-3.5 w-3.5 text-amber-500', analyzing && 'animate-pulse')} />
                      Recalculer les stats d&apos;index (ANALYZE)
                    </button>

                    {optimizeMsg && (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {optimizeMsg}
                      </span>
                    )}

                    {optimizeError && (
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {optimizeError}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
