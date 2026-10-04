'use client'

import { AlertTriangle, Trash2, X } from 'lucide-react'
import { useEffect } from 'react'

import type { ResourcePointView } from '@/lib/resources/resource-api'
import { pointKindLabel } from '@/lib/resources/resource-view'

/**
 * Confirmation « Annuler ma proposition » — modale de la charte (docs/ui/index.html#modales) : voile
 * `app-modal-backdrop`, carte `app-panel`, tuile d'icône au jeton négatif, « Garder » à gauche, action négative teintée.
 */
export default function ResourceCancelModal({
  point,
  sending,
  error,
  onClose,
  onConfirm,
}: {
  point: ResourcePointView
  sending: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}) {
  // Échap ferme la modale, sauf pendant l'envoi.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sending) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, sending])

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-cancel-title"
      aria-describedby="resource-cancel-text"
      data-testid="resource-cancel-modal"
    >
      <div className="app-panel w-full max-w-md p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--theme-ui-negative)_12%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--theme-ui-negative)_40%,transparent)]"
            aria-hidden="true"
          >
            <Trash2 className="h-[18px] w-[18px] text-[var(--theme-ui-negative)]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="resource-cancel-title" className="t-section-title">
              Annuler ta proposition ?
            </h2>
            <p id="resource-cancel-text" className="t-body text-gray-700">
              {pointKindLabel(point.kind)} en grille {point.grid} : le point disparaît de la carte et de la file de validation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Fermer"
            className="-mr-1 -mt-1 shrink-0 rounded-[8px] p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-[13px] font-semibold text-[var(--theme-ui-negative)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={sending} className="app-btn app-btn--md app-btn--secondary">
            Garder
          </button>
          <button type="button" onClick={onConfirm} disabled={sending} className="app-btn app-btn--md app-btn--danger gap-1.5">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {sending ? 'Annulation…' : 'Annuler la proposition'}
          </button>
        </div>
      </div>
    </div>
  )
}
