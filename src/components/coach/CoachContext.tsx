'use client'

import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * État d'ouverture du tiroir du Coach IA (docs/TODO/chatbot-ia.md §8.1) : partagé entre le bouton de l'en-tête, la
 * palette Ctrl+K, les boutons contextuels et le tiroir lui-même. Hors fournisseur (pages sans shell), `useCoach()`
 * rend des fonctions sans effet. Sur la page plein écran, le tiroir ne s'ouvre pas : la page est le Coach.
 */

export type CoachContextValue = {
  isOpen: boolean
  /** Le tiroir a déjà été ouvert : il reste monté (fermé) pour garder le fil en cours. */
  everOpened: boolean
  onFullPage: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const NOOP: CoachContextValue = { isOpen: false, everOpened: false, onFullPage: false, open: () => {}, close: () => {}, toggle: () => {} }

const CoachContext = createContext<CoachContextValue>(NOOP)

export function useCoach(): CoachContextValue {
  return useContext(CoachContext)
}

export const COACH_FULL_PAGE = /^\/clans\/\d+\/coach\/?$/

export function CoachProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const onFullPage = COACH_FULL_PAGE.test(pathname ?? '')
  const [isOpen, setIsOpen] = useState(false)
  const [everOpened, setEverOpened] = useState(false)

  const open = useCallback(() => {
    if (onFullPage) return
    setIsOpen(true)
    setEverOpened(true)
  }, [onFullPage])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => {
    if (onFullPage) return
    setEverOpened(true)
    setIsOpen((current) => !current)
  }, [onFullPage])

  // Sur la page plein écran, le tiroir est fermé par construction (pas d'effet : dérivé du chemin).
  const effectiveOpen = isOpen && !onFullPage
  const value = useMemo<CoachContextValue>(
    () => ({ isOpen: effectiveOpen, everOpened, onFullPage, open, close, toggle }),
    [effectiveOpen, everOpened, onFullPage, open, close, toggle]
  )

  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>
}
