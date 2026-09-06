'use client'

import { useEffect } from 'react'

const APP_THEME_STORAGE_KEY = 'pubg_app_theme'

export default function ThemeInitializer() {
  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY)
      const nextTheme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : 'dark'

      document.documentElement.setAttribute('data-app-theme', nextTheme)
      document.body.setAttribute('data-app-theme', nextTheme)
      document.documentElement.classList.toggle('dark', nextTheme === 'dark')
      document.body.classList.toggle('dark', nextTheme === 'dark')
    } catch {
      // Ignore client storage access errors.
    }
  }, [])

  return null
}