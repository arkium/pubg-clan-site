'use client'

import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/ui/CharteKit'

/**
 * « Supprimer le fil » d'une réponse relue ou d'un essai du SuperUser (/settings/coach, 2026-10-30) : modale de
 * confirmation de la charte, puis DELETE /api/settings/coach/conversations/[id]. Questions, réponses et votes du fil
 * partent ; le coût dépensé reste compté. `onDeleted` retire le fil de la liste appelante.
 */
export default function CoachConversationDelete({
  conversationId,
  ownedBySomeoneElse,
  onDeleted,
  onError,
}: {
  conversationId: number
  /** Fil d'un membre (réponse relue) : la modale rappelle qu'il disparaît aussi de son historique. */
  ownedBySomeoneElse: boolean
  onDeleted: (conversationId: number) => void
  onError: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      const response = await fetch(`/api/settings/coach/conversations/${conversationId}`, { method: 'DELETE' })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Suppression impossible')
      setOpen(false)
      onDeleted(conversationId)
    } catch (caught) {
      setOpen(false)
      onError(caught instanceof Error ? caught.message : 'Suppression impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1" onClick={() => setOpen(true)} data-testid={`coach-conversation-delete-${conversationId}`}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Supprimer le fil
      </button>
      {open ? (
        <ConfirmDialog
          icon={Trash2}
          title="Supprimer ce fil ?"
          confirmLabel="Supprimer"
          tone="danger"
          busy={busy}
          onCancel={() => setOpen(false)}
          onConfirm={() => void remove()}
          testId="coach-conversation-delete-dialog"
        >
          Ses questions, ses réponses et leurs votes disparaissent des statistiques{ownedBySomeoneElse ? ' et de l’historique du joueur' : ''}. Le
          coût déjà dépensé reste compté dans le mois. Action journalisée, sans retour possible.
        </ConfirmDialog>
      ) : null}
    </>
  )
}
