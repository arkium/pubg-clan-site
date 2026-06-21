'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SectionNav from '@/components/SectionNav'

interface QueueMetrics {
  queued: number
  running: number
  success: number
  failed: number
  total: number
}

interface WorkerMetrics {
  jobsProcessed: number
  jobsSucceeded: number
  jobsFailed: number
  avgDurationMs: number
  peakMemory: number
  currentMemory: number
  isHealthy: boolean
}

export default function TelemetryDashboard() {
  const params = useParams()
  const clanId = params.clanId as string

  const [queue, setQueue] = useState<QueueMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchMetrics = async () => {
    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-batch-manual`)
      if (response.ok) {
        const data = await response.json()
        if (data.queue) {
          setQueue(data.queue)
        }
      }
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to fetch metrics:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchMetrics, 30000) // 30s refresh
    return () => clearInterval(interval)
  }, [autoRefresh])

  if (loading) {
    return <div className="max-w-6xl mx-auto p-4">Chargement...</div>
  }

  if (!queue) {
    return <div className="max-w-6xl mx-auto p-4">Aucune données disponibles</div>
  }

  const successRate =
    queue.total > 0 ? ((queue.success / (queue.success + queue.failed || 1)) * 100).toFixed(1) : 'N/A'
  const failureRate = queue.total > 0 ? ((queue.failed / queue.total) * 100).toFixed(1) : 'N/A'

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Dashboard télémétrie"
          subtitle="Métriques en temps réel de la queue de traitement télémétrie."
          actions={
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                <span>Auto (30s)</span>
              </label>
              <button
                onClick={fetchMetrics}
                className="app-btn app-btn--sm app-btn--secondary"
              >
                Actualiser
              </button>
            </div>
          }
        />
        <SectionNav section="owner-menu" />
      </section>

      {/* Queue Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="border rounded-lg p-4 bg-amber-50">
          <div className="text-sm text-amber-700 font-semibold">En attente</div>
          <div className="text-3xl font-bold text-amber-900">{queue.queued}</div>
        </div>

        <div className="border rounded-lg p-4 bg-blue-50">
          <div className="text-sm text-blue-700 font-semibold">En traitement</div>
          <div className="text-3xl font-bold text-blue-900">{queue.running}</div>
        </div>

        <div className="border rounded-lg p-4 bg-emerald-50">
          <div className="text-sm text-emerald-700 font-semibold">Succès</div>
          <div className="text-3xl font-bold text-emerald-900">{queue.success}</div>
        </div>

        <div className="border rounded-lg p-4 bg-rose-50">
          <div className="text-sm text-rose-700 font-semibold">Échoués</div>
          <div className="text-3xl font-bold text-rose-900">{queue.failed}</div>
        </div>

        <div className="border rounded-lg p-4 bg-slate-50">
          <div className="text-sm text-slate-700 font-semibold">Total</div>
          <div className="text-3xl font-bold text-slate-900">{queue.total}</div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-4">Taux de succès</h3>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-emerald-600">{successRate}%</div>
            <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${successRate}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-4">Taux d'erreur</h3>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-rose-600">{failureRate}%</div>
            <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
              <div className="bg-rose-500 h-full" style={{ width: `${failureRate}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="border rounded-lg p-4 mb-8">
        <h3 className="font-semibold mb-4">Actions rapides</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              await fetch(`/api/clans/${clanId}/telemetry/queue-cleanup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reorder-priority' }),
              })
              await fetchMetrics()
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            Réorganiser priorités
          </button>
          <button
            onClick={async () => {
              await fetch(`/api/clans/${clanId}/telemetry/queue-cleanup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cleanup-stale', maxAgeHours: 24 }),
              })
              await fetchMetrics()
            }}
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
          >
            Nettoyer les anciens jobs
          </button>
          <button
            onClick={async () => {
              const response = await fetch(`/api/clans/${clanId}/telemetry/metrics?format=prometheus`)
              const text = await response.text()
              const element = document.createElement('a')
              element.href = URL.createObjectURL(new Blob([text]))
              element.download = `metrics-${clanId}.txt`
              element.click()
            }}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
          >
            Exporter métriques (Prometheus)
          </button>
        </div>
      </div>

      {/* Last Refresh */}
      <div className="text-xs text-gray-500 text-right">
        Dernière actualisation: {lastRefresh.toLocaleTimeString('fr-FR')}
      </div>
    </main>
  )
}
