'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { AlertTriangle, Database, Trash2, RefreshCw, DatabaseZap } from 'lucide-react'

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
}

type GlobalStats = {
  totalDataMb: number
  totalIndexMb: number
  totalSizeMb: number
}

type DbStatsResponse = {
  globalStats: GlobalStats
  tables: TableStats[]
}

export default function DatabaseStatsPage() {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  
  const { loading: sessionLoading, authenticated, isSuperUser } = useAuthSession()

  const [stats, setStats] = useState<DbStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sessionLoading) return
    if (!authenticated || !isSuperUser) {
      router.replace(clanId ? `/clans/${clanId}/overview` : '/clans')
    }
  }, [authenticated, isSuperUser, clanId, router, sessionLoading])

  const fetchStats = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch('/api/superuser/database')
      if (!res.ok) throw new Error('Erreur lors de la récupération des statistiques')
      const data = await res.json()
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
  }, [authenticated, isSuperUser])

  // Sorting
  const [sortField, setSortField] = useState<keyof TableStats>('totalSizeMb')
  const [sortAsc, setSortAsc] = useState(false)
  
  const [isPurging, setIsPurging] = useState(false)
  const [purgeError, setPurgeError] = useState('')
  const [purgeSuccess, setPurgeSuccess] = useState('')

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

  const handlePurge = async () => {
    if (!confirm('Êtes-vous sûr de vouloir purger positionSamples et trajectorySegments de tous les matchs ? Cette action est irréversible.')) return
    
    setIsPurging(true)
    setPurgeError('')
    setPurgeSuccess('')
    try {
      const res = await fetch('/api/superuser/database/purge-telemetry', { method: 'POST' })
      if (!res.ok) throw new Error('Erreur lors de la purge')
      setPurgeSuccess('Purge terminée avec succès.')
      await fetchStats()
    } catch (err: any) {
      setPurgeError(err.message)
    } finally {
      setIsPurging(false)
    }
  }

  if (sessionLoading || !authenticated || !isSuperUser) return null

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="Base de données"
        currentHref="/settings/superuser/database"
        fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <SettingsPageHeader
          title="État de la base de données"
          subtitle="Visualisez la taille occupée par les tables pour anticiper le stockage."
        />
        
        <button
          onClick={fetchStats}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {stats && (
        <>
          {/* Global Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="app-panel p-6 flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--theme-ui-text-muted)]">Taille Totale</span>
              <span className="text-3xl font-bold text-[var(--theme-ui-text)]">
                {stats.globalStats.totalSizeMb.toFixed(2)} <span className="text-lg text-[var(--theme-ui-text-muted)]">Mo</span>
              </span>
            </div>
            <div className="app-panel p-6 flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--theme-ui-text-muted)]">Taille Données</span>
              <span className="text-3xl font-bold text-[var(--theme-ui-text)]">
                {stats.globalStats.totalDataMb.toFixed(2)} <span className="text-lg text-[var(--theme-ui-text-muted)]">Mo</span>
              </span>
            </div>
            <div className="app-panel p-6 flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--theme-ui-text-muted)]">Taille Index</span>
              <span className="text-3xl font-bold text-[var(--theme-ui-text)]">
                {stats.globalStats.totalIndexMb.toFixed(2)} <span className="text-lg text-[var(--theme-ui-text-muted)]">Mo</span>
              </span>
            </div>
          </div>

          {/* Table list */}
          <div className="app-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--theme-ui-border)] text-sm text-left">
                <thead className="bg-[var(--theme-ui-bg-hover)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-[var(--theme-ui-text-muted)]">
                      Table
                    </th>
                    <th 
                      className="px-4 py-3 font-semibold text-[var(--theme-ui-text-muted)] text-right cursor-pointer hover:text-[var(--theme-ui-text)] transition-colors"
                      onClick={() => handleSort('rowCount')}
                    >
                      Lignes {sortField === 'rowCount' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th 
                      className="px-4 py-3 font-semibold text-[var(--theme-ui-text-muted)] text-right cursor-pointer hover:text-[var(--theme-ui-text)] transition-colors"
                      onClick={() => handleSort('dataSizeMb')}
                    >
                      Données (Mo) {sortField === 'dataSizeMb' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th 
                      className="px-4 py-3 font-semibold text-[var(--theme-ui-text-muted)] text-right cursor-pointer hover:text-[var(--theme-ui-text)] transition-colors"
                      onClick={() => handleSort('indexSizeMb')}
                    >
                      Index (Mo) {sortField === 'indexSizeMb' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th 
                      className="px-4 py-3 font-semibold text-[var(--theme-ui-text-muted)] text-right cursor-pointer hover:text-[var(--theme-ui-text)] transition-colors"
                      onClick={() => handleSort('totalSizeMb')}
                    >
                      Total (Mo) {sortField === 'totalSizeMb' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-4 py-3 font-semibold text-[var(--theme-ui-text-muted)] w-32">
                      Proportion
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--theme-ui-border)]">
                  {sortedTables.map((t) => {
                    const percentage = stats.globalStats.totalSizeMb > 0 
                      ? (t.totalSizeMb / stats.globalStats.totalSizeMb) * 100 
                      : 0;
                    
                    return (
                      <tr key={t.tableName} className="hover:bg-[var(--theme-ui-bg-hover)] transition-colors">
                        <td className="px-4 py-3 font-medium text-[var(--theme-ui-text)]">
                          {t.tableName}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--theme-ui-text-muted)]">
                          {t.rowCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--theme-ui-text-muted)]">
                          {t.dataSizeMb.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--theme-ui-text-muted)]">
                          {t.indexSizeMb.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-[var(--theme-ui-text)]">
                          {t.totalSizeMb.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 rounded-full" 
                                style={{ width: `${Math.max(1, percentage)}%` }} 
                              />
                            </div>
                            <span className="text-xs text-[var(--theme-ui-text-muted)] w-8 text-right">
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
          <div className="app-panel p-6 border-l-4 border-l-amber-500">
            <div className="flex items-start gap-4">
              <div className="mt-1 bg-amber-100 p-2 rounded-full text-amber-600 dark:bg-amber-900/30 dark:text-amber-500">
                <Database className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="text-lg font-semibold text-[var(--theme-ui-text)] flex items-center gap-2">
                  Purger l&apos;historique de géolocalisation
                </h3>
                <p className="text-sm text-[var(--theme-ui-text-muted)] max-w-3xl">
                  Cette action vide les colonnes <strong>positionSamples</strong> et <strong>trajectorySegments</strong> de tous les matchs stockés en base (table <code>SquadMatchTelemetry</code>). 
                  Ces deux colonnes représentent souvent plus de 90% de la taille de la base de données.
                </p>
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p>
                    <strong>Conséquence :</strong> Les statistiques de combat (kills, dégâts, recalls) ne seront <strong>pas</strong> impactées. En revanche, le tracé GPS continu des joueurs sur une carte 2D ne sera plus disponible pour les anciens matchs.
                  </p>
                </div>
                
                <div className="pt-4 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handlePurge}
                    disabled={isPurging}
                    className="app-btn app-btn--md gap-2 bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isPurging ? 'Purge en cours...' : 'Purger les géolocalisations'}
                  </button>
                  {purgeSuccess && <span className="text-sm font-medium text-emerald-600">{purgeSuccess}</span>}
                  {purgeError && <span className="text-sm font-medium text-red-600">{purgeError}</span>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
