'use client'

import { useEffect, useState } from 'react'
import { useAuthSession } from '@/hooks/useAuthSession'

const STATUS_LABELS: Record<string, string> = {
  NEVER_ATTEMPTED: 'Jamais tenté',
  RETRY_PENDING: 'Nouvel essai prévu',
  FAILED: 'Échec définitif',
}
const TRIAGE_STATUS_FILTERS = ['NEVER_ATTEMPTED', 'RETRY_PENDING', 'FAILED']

export default function OpponentsTriagePage() {
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [triagePayload, setTriagePayload] = useState<any>(null)
  const [triageLoading, setTriageLoading] = useState(false)
  const [triageError, setTriageError] = useState('')

  const [triageStatuses, setTriageStatuses] = useState<Set<string>>(
    new Set(['NEVER_ATTEMPTED', 'RETRY_PENDING', 'FAILED'])
  )
  const [triagePage, setTriagePage] = useState(1)
  const [resolvePending, setResolvePending] = useState<Set<string>>(new Set())
  const [resolveResults, setResolveResults] = useState<Record<string, string>>({})

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return

    let cancelled = false
    async function loadTriage() {
      try {
        setTriageLoading(true)
        setTriageError('')

        const searchParams = new URLSearchParams({
          triagePage: String(triagePage),
          triageStatuses: Array.from(triageStatuses).join(','),
        })

        const response = await fetch(`/api/settings/opponents/triage?${searchParams.toString()}`, {
          cache: 'no-store',
        })

        const data = await response.json().catch(() => null)
        if (!response.ok) {
          // If the specialized endpoint doesn't exist yet, we fall back to the old one that returns everything
          // Wait, the user said we keep the old API for now!
          // So I will fetch the main API and extract `triage`.
          const mainResponse = await fetch(`/api/settings/opponents?${searchParams.toString()}`, {
            cache: 'no-store',
          })
          const mainData = await mainResponse.json().catch(() => null)
          if (!mainResponse.ok) throw new Error(mainData?.error ?? 'Chargement impossible')
          if (!cancelled) setTriagePayload(mainData.triage)
          return
        }

        if (!cancelled) {
          setTriagePayload(data)
        }
      } catch (err: any) {
        if (!cancelled) setTriageError(err.message)
      } finally {
        if (!cancelled) setTriageLoading(false)
      }
    }

    void loadTriage()
    return () => { cancelled = true }
  }, [authenticated, isSuperUser, loading, triagePage, triageStatuses])

  function toggleTriageStatus(status: string) {
    setTriagePage(1)
    setTriageStatuses((current) => {
      const next = new Set(current)
      if (next.has(status)) {
        if (next.size > 1) next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  async function handleResolvePlayer(row: any, isRetry: boolean) {
    try {
      setResolvePending((current) => new Set(current).add(row.id))
      setResolveResults((current) => ({ ...current, [row.id]: 'En cours...' }))

      const response = await fetch('/api/settings/opponents/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resolutionId: row.id,
          pubgPlayerName: row.pubgPlayerName,
          forceRetry: isRetry,
        }),
      })

      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? 'Erreur inattendue')

      setResolveResults((current) => ({ ...current, [row.id]: 'Succès' }))
      
      // Update local state to reflect the success
      setTriagePayload((prev: any) => {
        if (!prev) return prev
        return {
          ...prev,
          players: prev.players.map((p: any) =>
            p.id === row.id ? { ...p, status: 'RESOLVED' } : p
          ).filter((p: any) => p.status !== 'RESOLVED' || triageStatuses.has('RESOLVED')) // Keep it simple, remove if success
        }
      })
      
    } catch (err: any) {
      setResolveResults((current) => ({ ...current, [row.id]: err.message }))
    } finally {
      setResolvePending((current) => {
        const next = new Set(current)
        next.delete(row.id)
        return next
      })
    }
  }

  if (loading || !authenticated || !isSuperUser) return null

  return (
    <div className={`space-y-4 ${triageLoading ? 'opacity-50 pointer-events-none transition-opacity duration-200' : ''}`}>
      <section className="app-panel p-6 sm:p-8">
        <h2 className="text-sm font-bold text-slate-900">Triage des joueurs non résolus</h2>
        
        <div className="mt-4 flex flex-wrap gap-2">
          {TRIAGE_STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => toggleTriageStatus(status)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                triageStatuses.has(status)
                  ? 'border-slate-700 bg-slate-700 text-white'
                  : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        {triageError ? <p className="mt-3 text-sm text-rose-700">{triageError}</p> : null}

        <div className="app-table-shell mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="app-table-head uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1.5">Joueur</th>
                <th className="px-2 py-1.5">Clan suivi</th>
                <th className="px-2 py-1.5">Statut</th>
                <th className="px-2 py-1.5 text-right" title="Nombre de clans suivis ayant croisé ce compte">
                  Clans
                </th>
                <th className="px-2 py-1.5 text-right">Tentatives</th>
                <th className="px-2 py-1.5">Résultat</th>
                <th className="px-2 py-1.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {(triagePayload?.players.length ?? 0) === 0 ? (
                <tr className="app-table-row">
                  <td colSpan={7} className="px-2 py-6 text-center text-slate-500">
                    {triageLoading ? 'Chargement...' : 'Aucun joueur pour ces filtres.'}
                  </td>
                </tr>
              ) : (
                triagePayload?.players.map((row: any) => (
                  <tr key={row.id} className="app-table-row align-top">
                    <td className="px-2 py-1.5 font-medium text-slate-900">{row.pubgPlayerName}</td>
                    <td className="px-2 py-1.5 text-slate-700">[{row.clanTag}]</td>
                    <td className="px-2 py-1.5 text-slate-700">{STATUS_LABELS[row.status] || row.status}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.distinctClanCount > 1 ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700">
                          {row.distinctClanCount}
                        </span>
                      ) : (
                        row.distinctClanCount
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.resolveAttempts}/{triagePayload?.thresholds.maxAttempts}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">{resolveResults[row.id] ?? '-'}</td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        disabled={resolvePending.has(row.id)}
                        onClick={() => handleResolvePlayer(row, row.status === 'FAILED')}
                        className="app-btn app-btn--sm app-btn--secondary"
                      >
                        {resolvePending.has(row.id)
                          ? '...'
                          : row.status === 'FAILED'
                          ? 'Forcer nouvel essai'
                          : 'Résoudre maintenant'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {triagePayload && triagePayload.total > triagePayload.pageSize ? (
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
            <p>
              Page {triagePayload.page} / {Math.max(1, Math.ceil(triagePayload.total / triagePayload.pageSize))}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="app-btn app-btn--sm app-btn--secondary"
                disabled={triagePage === 1}
                onClick={() => setTriagePage((page) => Math.max(1, page - 1))}
              >
                Précédent
              </button>
              <button
                type="button"
                className="app-btn app-btn--sm app-btn--secondary"
                disabled={triagePage * triagePayload.pageSize >= triagePayload.total}
                onClick={() => setTriagePage((page) => page + 1)}
              >
                Suivant
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
