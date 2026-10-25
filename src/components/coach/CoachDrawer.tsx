'use client'

import { useEffect, useRef } from 'react'

import { useCoach } from '@/components/coach/CoachContext'
import CoachPanel from '@/components/coach/CoachPanel'

/**
 * Tiroir du Coach IA (docs/TODO/chatbot-ia.md §8.2, §8.4) : 440 px à droite, panneau montant sous 768 px (CSS).
 * Monté à la première ouverture puis gardé (caché) pour conserver le fil ; Échap ferme, le focus va à la saisie à
 * l'ouverture et revient au déclencheur à la fermeture (`opener`, relevé par le contexte à l'appel : le bouton flottant
 * est déjà masqué quand cet effet s'exécute).
 */
export default function CoachDrawer() {
  const { isOpen, everOpened, close, opener } = useCoach()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const returnTo = opener.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    const textarea = dialogRef.current?.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)')
    textarea?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnTo?.focus()
    }
  }, [isOpen, close, opener])

  if (!everOpened) return null

  return (
    <>
      {isOpen ? <div className="coach-backdrop" onClick={close} aria-hidden="true" /> : null}
      <div ref={dialogRef} id="coach-drawer" className="coach-drawer charte game-ui" role="dialog" aria-modal="true" aria-label="Coach IA" hidden={!isOpen} data-testid="coach-drawer">
        <div className="coach-handle" aria-hidden="true" />
        <CoachPanel variant="drawer" active={isOpen} onClose={close} />
      </div>
    </>
  )
}
