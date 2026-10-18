'use client'

import { useEffect } from 'react'

import { persistAppTheme, readStoredAppTheme, resolveAppTheme } from '@/lib/app-theme'

/**
 * Le layout pose déjà le thème du cookie côté serveur (src/lib/app-theme.ts). Ce composant aligne le document sur la
 * préférence du navigateur et réécrit le cookie : il migre une préférence enregistrée avant le cookie, y compris sur
 * les pages sans shell (accueil, /join).
 */
export default function ThemeInitializer() {
  useEffect(() => {
    persistAppTheme(readStoredAppTheme() ?? resolveAppTheme(document.documentElement.getAttribute('data-app-theme')))
  }, [])

  return null
}
