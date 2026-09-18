'use client'

import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'

type TournamentDeleteModalProps = {
  clanId: number
  tournamentId: string
  tournamentTitle: string
  onClose: () => void
  onDeleted: (message: string) => void
}

/**
 * Confirmation de suppression d'un tournoi. Seule la configuration du tournoi disparaît : les matchs PUBG et les
 * statistiques restent en base, le message le dit explicitement pour lever le doute au moment de cliquer.
 */
export default function TournamentDeleteModal({
  clanId,
  tournamentId,
  tournamentTitle,
  onClose,
  onDeleted,
}: TournamentDeleteModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    try {
      setDeleting(true)
      setError(null)
      const response = await fetch(`/api/clans/${clanId}/tournaments/${tournamentId}`, { method: 'DELETE' })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Suppression impossible.')
      }
      onDeleted(`Tournoi « ${tournamentTitle} » supprimé. Les matchs et les statistiques sont intacts.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Suppression impossible.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-delete-title"
    >
      <div className="app-modal-card w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-500">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="tournament-delete-title" className="text-lg font-semibold text-gray-900">
              Supprimer « {tournamentTitle} » ?
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Cette action retire le tournoi, son barème et son classement. Elle est définitive.
            </p>
          </div>
        </div>

        <div className="app-modal-callout mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm">
            <strong>Vos données de jeu sont préservées.</strong> Les matchs PUBG, la télémétrie et les statistiques des
            membres restent en base : seule la configuration du tournoi disparaît.
          </p>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={deleting} className="app-btn app-btn--md app-btn--secondary">
            Annuler
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting} className="app-btn app-btn--md app-btn--danger">
            {deleting ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  )
}
