'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'

export default function TelemetrySyncBatchPage() {
  const params = useParams()
  const clanId = params.clanId as string

  const [squadMatchIds, setSquadMatchIds] = useState<string[]>([])
  const [matchInput, setMatchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [resetBefore, setResetBefore] = useState(false)
  const [recalcAgg, setRecalcAgg] = useState(true)

  const addMatch = () => {
    if (matchInput.trim()) {
      setSquadMatchIds([...squadMatchIds, matchInput.trim()])
      setMatchInput('')
    }
  }

  const removeMatch = (idx: number) => {
    setSquadMatchIds(squadMatchIds.filter((_, i) => i !== idx))
  }

  const handleSync = async () => {
    if (squadMatchIds.length === 0) {
      setError('Sélectionne au moins 1 match')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-batch-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squadMatchIds,
          resetBeforeSync: resetBefore,
          recalculateAggregates: recalcAgg,
          batchLabel: `Batch ${new Date().toISOString().split('T')[0]}`,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Erreur')
        return
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  const handleGetStatus = async () => {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-batch-manual`)
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Erreur')
        return
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Télémétrie - Sync Batch Manual (Phase 1)</h1>

      <div className="grid gap-6">
        {/* Input matches */}
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">1. Sélectionne les matches</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="squadMatchId"
              value={matchInput}
              onChange={(e) => setMatchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMatch()}
              className="flex-1 border rounded px-3 py-2"
            />
            <button
              onClick={addMatch}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Ajouter
            </button>
          </div>

          {squadMatchIds.length > 0 && (
            <div className="space-y-2">
              {squadMatchIds.map((id, idx) => (
                <div key={idx} className="flex justify-between items-center bg-gray-100 p-2 rounded">
                  <code>{id}</code>
                  <button
                    onClick={() => removeMatch(idx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Options */}
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">2. Options</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={resetBefore}
                onChange={(e) => setResetBefore(e.target.checked)}
              />
              <span>Réinitialiser télémétrie avant resync</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={recalcAgg}
                onChange={(e) => setRecalcAgg(e.target.checked)}
              />
              <span>Recalculer agrégats après sync</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">3. Actions</h2>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={loading || squadMatchIds.length === 0}
              className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 disabled:bg-gray-400"
            >
              {loading ? 'Traitement...' : 'Enqueue sync'}
            </button>
            <button
              onClick={handleGetStatus}
              disabled={loading}
              className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600 disabled:bg-gray-400"
            >
              {loading ? '...' : 'Check status'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-red-300 bg-red-50 rounded-lg p-4">
            <p className="text-red-700 font-semibold">Erreur:</p>
            <pre className="text-sm mt-2 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="border border-green-300 bg-green-50 rounded-lg p-4">
            <p className="text-green-700 font-semibold mb-3">Résultat:</p>
            <div className="bg-white rounded p-3 overflow-auto max-h-96">
              <pre className="text-xs">{JSON.stringify(result, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-900">💡 Mode CLI (alternative)</h3>
        <pre className="text-sm bg-white p-2 rounded mt-2 overflow-auto">
{`npm run telemetry:batch -- --clan ${clanId}
npm run telemetry:batch -- --check`}
        </pre>
      </div>
    </main>
  )
}
