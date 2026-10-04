'use client'

import { AlertTriangle, ShieldCheck, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

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
 *
 * Modale de la charte UI (docs/ui/index.html#modales) : voile `app-modal-backdrop`, carte `app-panel`, tuile d'icône
 * au jeton négatif, titre de section, action destructive en bouton négatif teinté (jamais jaune), Annuler à gauche.
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

  // Échap ferme la modale, sauf pendant la suppression.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [deleting, onClose])

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
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-delete-title"
      aria-describedby="tournament-delete-text"
      data-testid="tournament-delete-modal"
    >
      <div className="app-panel w-full max-w-lg p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--theme-ui-negative)_12%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--theme-ui-negative)_40%,transparent)]"
            aria-hidden="true"
          >
            <AlertTriangle className="h-[18px] w-[18px] text-[var(--theme-ui-negative)]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="tournament-delete-title" className="t-section-title break-words">
              Supprimer « {tournamentTitle} » ?
            </h2>
            <p id="tournament-delete-text" className="t-body text-gray-700">
              Cette action retire le tournoi, son barème et son classement. Elle est définitive.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            aria-label="Fermer"
            className="-mr-1 -mt-1 shrink-0 rounded-[8px] p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="app-panel-muted mt-4 flex items-start gap-2.5 p-3">
          <ShieldCheck className="t-pos mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="t-body text-gray-700">
            <b className="text-gray-900">Vos données de jeu sont préservées.</b> Les matchs PUBG, la télémétrie et les
            statistiques des membres restent en base : seule la configuration du tournoi disparaît.
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-[13px] font-semibold text-[var(--theme-ui-negative)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={deleting} className="app-btn app-btn--md app-btn--secondary">
            Annuler
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting} className="app-btn app-btn--md app-btn--danger gap-1.5">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {deleting ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  )
}
