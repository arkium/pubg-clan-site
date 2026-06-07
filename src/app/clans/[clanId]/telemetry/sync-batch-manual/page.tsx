'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'

type SyncMode = 'direct' | 'capture' | 'queue'

export default function TelemetrySyncBatchPage() {
  const params = useParams()
  const clanId = params.clanId as string

  const [squadMatchIds, setSquadMatchIds] = useState<string[]>([])
  const [matchInput, setMatchInput] = useState('')
  const [syncMode, setSyncMode] = useState<SyncMode>('direct')
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

  const clearMatches = () => {
    setSquadMatchIds([])
  }

  const handleDirectSync = async () => {
    if (squadMatchIds.length === 0) {
      setError('Sélectionne au moins 1 match')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-selected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squadMatchIds,
          recalculateAggregates: recalcAgg,
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

  const handleCapture = async () => {
    if (squadMatchIds.length === 0) {
      setError('Sélectionne au moins 1 match')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/fetch-files-selected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ squadMatchIds }),
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

  const handleQueueSync = async () => {
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
    <main className="max-w-6xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-2">Télémétrie - Récupération manuelle</h1>
      <p className="text-gray-600 mb-6">Trois modes: Direct (simple), Capture (sauvegarde locale), Queue (asynchrone)</p>

      <div className="grid gap-6">
        {/* Input matches */}
        <div className="border rounded-lg p-4 bg-slate-50">
          <h2 className="text-xl font-semibold mb-3">Étape 1: Sélectionne les matches</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="squadMatchId (paste or type)"
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
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-700">{squadMatchIds.length} match(s) sélectionné(s)</span>
                <button
                  onClick={clearMatches}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Vider la sélection
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {squadMatchIds.map((id, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200">
                    <code className="text-xs">{id}</code>
                    <button
                      onClick={() => removeMatch(idx)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mode selection */}
        <div className="border rounded-lg p-4 bg-slate-50">
          <h2 className="text-xl font-semibold mb-4">Étape 2: Choisir le mode de récupération</h2>

          <div className="grid gap-4 md:grid-cols-3">
            {/* Direct Sync */}
            <div
              onClick={() => setSyncMode('direct')}
              className={`border-2 rounded-lg p-4 cursor-pointer transition ${
                syncMode === 'direct'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-lg">Direct Sync</h3>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Rapide</span>
              </div>
              <p className="text-sm text-gray-700 mb-3">
                Télécharge, capture et traite en une seule opération.
              </p>
              <ul className="text-xs text-gray-600 space-y-1 mb-3">
                <li>✓ Résultat immédiat</li>
                <li>✓ Pas de fichiers locaux</li>
                <li>⚠ Peut bloquer si gros batch</li>
              </ul>
              <div className="text-xs text-gray-500">
                Recommandé: &lt;50 matches
              </div>
            </div>

            {/* Capture Only */}
            <div
              onClick={() => setSyncMode('capture')}
              className={`border-2 rounded-lg p-4 cursor-pointer transition ${
                syncMode === 'capture'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-lg">Capture seule</h3>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Stockage</span>
              </div>
              <p className="text-sm text-gray-700 mb-3">
                Télécharge et sauvegarde localement (sans traitement).
              </p>
              <ul className="text-xs text-gray-600 space-y-1 mb-3">
                <li>✓ Non-bloquant</li>
                <li>✓ Fichiers locaux conservés</li>
                <li>✓ Rejouer anytime</li>
              </ul>
              <div className="text-xs text-gray-500">
                Ensuite: Mode Queue pour traiter
              </div>
            </div>

            {/* Queue Resync */}
            <div
              onClick={() => setSyncMode('queue')}
              className={`border-2 rounded-lg p-4 cursor-pointer transition ${
                syncMode === 'queue'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-lg">Queue Resync</h3>
                <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Worker</span>
              </div>
              <p className="text-sm text-gray-700 mb-3">
                Traite fichiers capturés (worker asynchrone).
              </p>
              <ul className="text-xs text-gray-600 space-y-1 mb-3">
                <li>✓ Non-bloquant</li>
                <li>✓ Scalable</li>
                <li>✓ Reprise auto</li>
              </ul>
              <div className="text-xs text-gray-500">
                Prérequis: Fichiers capturés
              </div>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="border rounded-lg p-4 bg-slate-50">
          <h2 className="text-xl font-semibold mb-3">Étape 3: Options</h2>
          <div className="space-y-3">
            {syncMode !== 'capture' && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={resetBefore}
                  onChange={(e) => setResetBefore(e.target.checked)}
                />
                <span>Réinitialiser télémétrie avant traitement</span>
              </label>
            )}
            {syncMode !== 'capture' && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={recalcAgg}
                  onChange={(e) => setRecalcAgg(e.target.checked)}
                />
                <span>Recalculer agrégats après traitement</span>
              </label>
            )}
            {syncMode === 'capture' && (
              <p className="text-sm text-gray-600">
                Les fichiers seront sauvegardés dans <code className="bg-gray-100 px-2 py-1 rounded text-xs">.telemetry-captured/</code>
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border rounded-lg p-4 bg-slate-50">
          <h2 className="text-xl font-semibold mb-3">Étape 4: Exécuter</h2>
          <div className="flex flex-wrap gap-2">
            {syncMode === 'direct' && (
              <button
                onClick={handleDirectSync}
                disabled={loading || squadMatchIds.length === 0}
                className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 disabled:bg-gray-400 font-semibold"
              >
                {loading ? 'Traitement...' : 'Direct Sync'}
              </button>
            )}
            {syncMode === 'capture' && (
              <button
                onClick={handleCapture}
                disabled={loading || squadMatchIds.length === 0}
                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 font-semibold"
              >
                {loading ? 'Capture en cours...' : 'Capturer fichiers'}
              </button>
            )}
            {syncMode === 'queue' && (
              <button
                onClick={handleQueueSync}
                disabled={loading || squadMatchIds.length === 0}
                className="bg-purple-500 text-white px-6 py-2 rounded hover:bg-purple-600 disabled:bg-gray-400 font-semibold"
              >
                {loading ? 'Enqueue...' : 'Enqueue Resync'}
              </button>
            )}
            <button
              onClick={handleGetStatus}
              disabled={loading}
              className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600 disabled:bg-gray-400"
            >
              {loading ? '...' : 'Vérifier statut'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-red-300 bg-red-50 rounded-lg p-4">
            <p className="text-red-700 font-semibold mb-2">❌ Erreur:</p>
            <pre className="text-sm whitespace-pre-wrap bg-white p-3 rounded overflow-auto max-h-40">{error}</pre>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="border border-green-300 bg-green-50 rounded-lg p-4">
            <p className="text-green-700 font-semibold mb-3">✓ Résultat:</p>
            <div className="bg-white rounded p-3 overflow-auto max-h-96 border border-gray-200">
              <pre className="text-xs">{JSON.stringify(result, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>

      {/* CLI info */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">💡 Mode CLI (alternative)</h3>
        <p className="text-sm text-blue-800 mb-2">Traite tout en une seule commande (capture + queue + worker):</p>
        <pre className="text-sm bg-white p-2 rounded overflow-auto border border-blue-200">
{`npm run telemetry:batch -- --clan ${clanId} --all-matches
npm run telemetry:batch -- --check`}
        </pre>
      </div>
    </main>
  )
}
