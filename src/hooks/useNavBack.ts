'use client'

import { useSyncExternalStore } from 'react'

/**
 * Destination du retour de la page affichée (« ‹ Retour à … »). Calculée et publiée par `NavigationTrail`, reprise par
 * le bandeau collant (`DockingToolbar`) une fois docké : le retour reste à portée quand le fil d'Ariane est hors de vue.
 */
export type NavBackEntry = { href: string; label: string }

let current: NavBackEntry | null = null
const listeners = new Set<() => void>()

export function publishNavBack(entry: NavBackEntry | null) {
  if (current?.href === entry?.href && current?.label === entry?.label) return
  current = entry
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useNavBack() {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
