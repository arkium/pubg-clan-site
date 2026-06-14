'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SettingsSectionNav from '@/components/SettingsSectionNav'

interface FailedJob {
  id: string
  message: string
  details: Record<string, unknown> | null
  finishedAt: string
  createdAt: string
}

export default function TelemetryErrorsPage() {
  const params = useParams()
  const clanId = params.clanId as string

  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all') // all, hour, day, week

  const fetchFailedJobs = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-batch-manual`)
      if (response.ok) {
        const data = await response.json()
        // Filter to only failed jobs
        if (data.recentJobs) {
          const failed = data.recentJobs.filter((j: any) => j.status === 'failed')
          setFailedJobs(failed)
        }
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFailedJobs()
  }, [])

  const getFilteredJobs = () => {
    const now = Date.now()
    return failedJobs.filter((job) => {
      const jobAge = now - new Date(job.finishedAt).getTime()
      switch (filter) {
        case 'hour':
          return jobAge < 60 * 60 * 1000
        case 'day':
          return jobAge < 24 * 60 * 60 * 1000
        case 'week':
          return jobAge < 7 * 24 * 60 * 60 * 1000
        default:
          return true
      }
    })
  }

  const filtered = getFilteredJobs()

  if (loading) {
    return <div className="max-w-4xl mx-auto p-4">Chargement...</div>
  }

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Logs d'erreurs télémétrie"
          subtitle="Consultez et relancez les jobs échoués."
        />
        <SettingsSectionNav section="owner-menu" />
      </section>

      <section className="app-panel p-4">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded text-sm ${
              filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setFilter('hour')}
            className={`px-4 py-2 rounded text-sm ${
              filter === 'hour' ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}
          >
            Dernière heure
          </button>
          <button
            onClick={() => setFilter('day')}
            className={`px-4 py-2 rounded text-sm ${
              filter === 'day' ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}
          >
            Dernier jour
          </button>
          <button
            onClick={() => setFilter('week')}
            className={`px-4 py-2 rounded text-sm ${
              filter === 'week' ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}
          >
            Dernière semaine
          </button>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-gray-500">
          Aucune erreur {filter !== 'all' ? `dans la période sélectionnée` : ''}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((job) => (
            <div key={job.id} className="border rounded-lg p-4 bg-rose-50">
              <div
                className="cursor-pointer flex items-start justify-between"
                onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
              >
                <div className="flex-1">
                  <div className="font-semibold text-rose-900">{job.message}</div>
                  <div className="text-sm text-rose-700 mt-1">
                    Job ID: {job.id.slice(0, 12)}... • Finished:{' '}
                    {new Date(job.finishedAt).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div className="text-rose-700 ml-4">
                  {expandedId === job.id ? '▼' : '▶'}
                </div>
              </div>

              {expandedId === job.id && (
                <div className="mt-4 pt-4 border-t border-rose-200">
                  {job.details && (
                    <div className="bg-white rounded p-3 overflow-auto max-h-48">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                        {JSON.stringify(job.details, null, 2)}
                      </pre>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      await fetch(`/api/clans/${clanId}/telemetry/dead-letter`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jobIds: [job.id] }),
                      })
                      await fetchFailedJobs()
                    }}
                    className="mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  >
                    Relancer ce job
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm">
        <p className="font-semibold mb-2">💡 Conseil:</p>
        <p>
          Cliquez sur une erreur pour voir les détails complets. Si vous avez corrigé le
          problème, utilisez le bouton "Relancer" pour remettre le job en file d'attente.
        </p>
      </div>
    </main>
  )
}
