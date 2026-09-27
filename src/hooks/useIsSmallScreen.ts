'use client'

import { useSyncExternalStore } from 'react'

const SMALL_QUERY = '(max-width: 639px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(SMALL_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Moins de 640 px (point `sm` de Tailwind) : pages plus courtes sur mobile. Faux au rendu serveur. */
export function useIsSmallScreen() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(SMALL_QUERY).matches, () => false)
}
