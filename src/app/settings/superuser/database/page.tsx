'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
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

type PurgeStatus = {
  totalMatches: number
  matchesToPurge: number
  purgedMatches: number
  percentPurged: number
  olderThanDays: number | string
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
  const [purgeStatus, setPurgeStatus] = useState<PurgeStatus | null>(null)
  const [loadingPurgeStatus, setLoadingPurgeStatus] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const [purgedCountSession, setPurgedCountSession] = useState(0)
  const [totalToPurgeSession, setTotalToPurgeSession] = useState(0)
  const [purgeError, setPurgeError] = useState('')
  const [purgeSuccess, setPurgeSuccess] = useState('')
  const cancelPurgeRef = useRef(false)

  // Table optimization state
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizeMsg, setOptimizeMsg] = useState('')
  const [optimizeError, setOptimizeError] = useState('')

  useEffect(() => {
    if (sessionLoading) return
    if (!authenticated || !isSuperUser) {
      router.replace(clanId ? `/clans/${clanId}/overview` : '/clans')
    }
  }, [authenticated, isSuperUser, clanId, router, sessionLoading])

  const fetchPurgeStatus = useCallback(async (age: string = selectedAge) => {
    try {
      setLoadingPurgeStatus(true)
      const res = await fetch(`/api/superuser/database/purge-telemetry?olderThanDays=${age}`)
      if (res.ok) {
        const data = (await res.json()) as PurgeStatus
        setPurgeStatus(data)
      }
    } catch (err) {
      console.error('Erreur lecture statut de purge:', err)
    } finally {
      setLoadingPurgeStatus(false)
    }
  }, [selectedAge])

  const fetchStats = async () => {
    try {
      setLoading(true)
      setError('')
      const [statsRes] = await Promise.all([
        fetch('/api/superuser/database'),
        fetchPurgeStatus(selectedAge),
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

  const handleAgeChange = (newAge: string) => {
    setSelectedAge(newAge)
    setPurgeError('')
    setPurgeSuccess('')
    void fetchPurgeStatus(newAge)
  }

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

  const handleCancelPurge = () => {
    cancelPurgeRef.current = true
  }

  const handleOptimizeTable = async (
    table: string = 'SquadMatchTelemetry',
    action: 'optimize' | 'analyze' = 'optimize'
  ) => {
    if (
      action === 'optimize' &&
      !confirm(
        `Voulez-vous compacter la table ${table} ?\n\nCette opération reconstruit le fichier de données (.ibd) sous MySQL InnoDB pour restituer physiquement l'espace libre au disque dur et actualiser la taille de la table. Cela peut prendre 30 secondes à 1 minute.`
      )
    ) {
      return
    }

    setIsOptimizing(true)
    setOptimizeMsg('')
    setOptimizeError('')

    try {
      const res = await fetch('/api/superuser/database/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, action }),
      })

      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        durationMs?: number
        stats?: TableStats | null
        message?: string
      } | null

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || `Erreur serveur HTTP ${res.status}`)
      }

      const durSec = payload.durationMs ? (payload.durationMs / 1000).toFixed(1) : '1'
      const newSize = payload.stats ? ` (Nouvelle taille : ${payload.stats.totalSizeMb.toFixed(1)} Mo)` : ''
      setOptimizeMsg(`${payload.message || 'Opération réussie'}${newSize} en ${durSec}s.`)

      void fetchStats()
    } catch (err: any) {
      setOptimizeError(err?.message || 'Échec de l’opération de compactage')
    } finally {
      setIsOptimizing(false)
    }
  }

  const handlePurge = async () => {
    const initialToPurge = purgeStatus?.matchesToPurge ?? 0
    if (initialToPurge === 0) {
      setPurgeSuccess('Aucun match ne correspond au filtre sélectionné pour la purge.')
      return
    }

    const ageLabel =
      selectedAge === 'all'
        ? 'l’ensemble de l’historique (tous les matchs)'
        : `les matchs de plus de ${selectedAge} jours`

    if (
      !confirm(
        `Êtes-vous sûr de vouloir purger l'historique de géolocalisation pour ${ageLabel} (${initialToPurge.toLocaleString()} matchs ciblés) ?\n\nCette opération s'exécutera par lots sécurisés avec affichage en direct.`
      )
    ) {
      return
    }

    setIsPurging(true)
    setPurgeError('')
    setPurgeSuccess('')
    cancelPurgeRef.current = false
    setTotalToPurgeSession(initialToPurge)
    setPurgedCountSession(0)

    let done = false
    let currentPurged = 0
    let lastRemaining = initialToPurge

    try {
      while (!done && !cancelPurgeRef.current) {
        const res = await fetch('/api/superuser/database/purge-telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchSize: 250,
            olderThanDays: selectedAge,
          }),
        })

        const payload = (await res.json().catch(() => null)) as {
          ok?: boolean
          error?: string
          purgedInBatch?: number
          remaining?: number
          done?: boolean
        } | null

        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || `Erreur serveur HTTP ${res.status} lors de la purge`)
        }

        const batchPurged = payload.purgedInBatch ?? 0
        currentPurged += batchPurged
        lastRemaining = payload.remaining ?? Math.max(0, lastRemaining - batchPurged)
        done = Boolean(payload.done || lastRemaining === 0 || batchPurged === 0)

        setPurgedCountSession(currentPurged)
        setPurgeStatus((prev) =>
          prev
            ? {
                ...prev,
                matchesToPurge: lastRemaining,
                purgedMatches: Math.max(0, prev.totalMatches - lastRemaining),
                percentPurged:
                  prev.totalMatches > 0
                    ? Math.round(((prev.totalMatches - lastRemaining) / prev.totalMatches) * 100)
                    : 100,
              }
            : null
        )

        if (!done && !cancelPurgeRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 60))
        }
      }

      if (cancelPurgeRef.current) {
        setPurgeSuccess(
          `Purge interrompue à la demande. ${currentPurged.toLocaleString()} matchs ont été nettoyés avec succès.`
        )
      } else {
        setPurgeSuccess(
          `Purge terminée avec succès ! ${currentPurged.toLocaleString()} matchs nettoyés. Cliquez sur « Compacter la table » ci-dessous pour restituer immédiatement les gigaoctets libérés sur le disque.`
        )
      }

      void fetchStats()
    } catch (err: any) {
      setPurgeError(err.message || 'Erreur inattendue lors de la purge')
    } finally {
      setIsPurging(false)
    }
  }

  if (sessionLoading || !authenticated || !isSuperUser) return null

  const progressPercent =
    totalToPurgeSession > 0
      ? Math.min(100, Math.round((purgedCountSession / totalToPurgeSession) * 100))
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

                {/* Status Badges */}
                {purgeStatus && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <span className="text-xs text-slate-500">Total matchs télémétrie</span>
                      <p className="mt-1 text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">
                        {purgeStatus.totalMatches.toLocaleString()}
                      </p>
                    </div>

                    <div className={cx(
                      "rounded-lg border p-3",
                      purgeStatus.matchesToPurge > 0
                        ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-900/20"
                        : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-900/20"
                    )}>
                      <span className="text-xs text-slate-500">
                        Cible du filtre ({selectedAge === 'all' ? 'tous' : `> ${selectedAge}j`}) à purger
                      </span>
                      <p className={cx(
                        "mt-1 text-sm sm:text-base font-semibold",
                        purgeStatus.matchesToPurge > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                      )}>
                        {purgeStatus.matchesToPurge.toLocaleString()}
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <span className="text-xs text-slate-500">Hors cible / Déjà allégés</span>
                      <p className="mt-1 text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">
                        {purgeStatus.purgedMatches.toLocaleString()} <span className="text-xs font-normal text-slate-400">({purgeStatus.percentPurged}%)</span>
                      </p>
                    </div>
                  </div>
                )}

                {/* Progress Card when purging */}
                {isPurging && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                        Purge par lots ({selectedAge === 'all' ? 'tous matchs' : `> ${selectedAge} jours`}) en cours...
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
                        Nettoyés : <strong>{purgedCountSession.toLocaleString()}</strong> / {totalToPurgeSession.toLocaleString()}
                      </span>
                      <span>
                        Restants : <strong>{Math.max(0, totalToPurgeSession - purgedCountSession).toLocaleString()}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCancelPurge}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
                    >
                      <Square className="h-3 w-3 text-red-500 fill-red-500" />
                      Interrompre la purge
                    </button>
                  </div>
                )}

                {/* Actions and messages */}
                <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4">
                  {!isPurging && (
                    <button
                      type="button"
                      onClick={handlePurge}
                      disabled={isPurging || purgeStatus?.matchesToPurge === 0}
                      className="app-btn app-btn--md gap-2 bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      <Trash2 className="h-4 w-4" />
                      {purgeStatus?.matchesToPurge === 0
                        ? `Aucun match ${selectedAge === 'all' ? '' : `> ${selectedAge}j`} à purger`
                        : purgeError
                        ? 'Reprendre la purge'
                        : selectedAge === 'all'
                        ? 'Purger tous les matchs'
                        : `Purger les matchs > ${selectedAge} jours`}
                    </button>
                  )}

                  {purgeStatus?.matchesToPurge === 0 && !isPurging && !purgeSuccess && (
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Filtre déjà optimisé (0 match à purger)
                    </span>
                  )}

                  {purgeSuccess && (
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      {purgeSuccess}
                    </span>
                  )}
                </div>

                {purgeError && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs sm:text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                    <p className="font-semibold">Détail de l&apos;erreur :</p>
                    <p className="mt-0.5">{purgeError}</p>
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      Vous pouvez cliquer sur <strong>« Reprendre la purge »</strong> ci-dessus pour relancer l&apos;opération là où elle s&apos;est arrêtée.
                    </p>
                  </div>
                )}

                {/* InnoDB Compaction Callout */}
                <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 sm:p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20 space-y-3">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs sm:text-sm font-semibold text-indigo-950 dark:text-indigo-200">
                        Pourquoi la taille affichée ne diminue-t-elle pas immédiatement après la purge ?
                      </h4>
                      <p className="text-xs text-indigo-900/80 dark:text-indigo-300/80 leading-relaxed">
                        Sous MySQL (moteur <strong>InnoDB</strong>), vider des colonnes libère l&apos;espace en mémoire interne mais ne réduit <strong>jamais</strong> automatiquement le fichier sur le disque dur (<code>.ibd</code>). 
                        Pour restituer physiquement les gigaoctets libérés au système d&apos;exploitation et mettre à jour la taille affichée, lancez un <strong>compactage (OPTIMIZE TABLE)</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOptimizeTable('SquadMatchTelemetry', 'optimize')}
                      disabled={isOptimizing || isPurging}
                      className="inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-indigo-600 px-3 sm:px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isOptimizing ? (
                        <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                      ) : (
                        <HardDrive className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                      {isOptimizing ? 'Compactage en cours...' : 'Compacter SquadMatchTelemetry (OPTIMIZE)'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOptimizeTable('SquadMatchTelemetry', 'analyze')}
                      disabled={isOptimizing || isPurging}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-300 shadow-xs hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700 disabled:opacity-50"
                    >
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
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
