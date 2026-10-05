'use client'

import { useState } from 'react'

/**
 * Recherche des fenêtres « Changer de clan » et « Sélectionner un joueur » : masquée à chaque ouverture, pour ne pas
 * ouvrir le clavier sur mobile ; la loupe de l'en-tête l'affiche et y place le focus. Une recherche en cours reste
 * affichée d'une ouverture à l'autre (la liste est filtrée : le filtre doit se voir).
 */
export function useSwitchModalSearch(isOpen: boolean) {
  const [query, setQuery] = useState('')
  const [requested, setRequested] = useState(false)
  const [lastOpen, setLastOpen] = useState(isOpen)

  // Remise à zéro à chaque ouverture, pendant le rendu plutôt que dans un effet (pas de rendu en cascade).
  if (lastOpen !== isOpen) {
    setLastOpen(isOpen)
    if (isOpen) setRequested(false)
  }

  const visible = requested || query !== ''

  return {
    query,
    setQuery,
    visible,
    /** Vrai seulement après un appui sur la loupe : le champ prend alors le focus (et le clavier s'ouvre). */
    focusOnShow: requested,
    toggle() {
      if (visible) {
        setRequested(false)
        setQuery('')
      } else {
        setRequested(true)
      }
    },
  }
}
