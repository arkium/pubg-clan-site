/**
 * Thème clair ou sombre du site. La préférence vit dans le navigateur (`localStorage`) **et** dans un cookie du même
 * nom : le cookie permet au layout racine de poser `data-app-theme` côté serveur, donc de rendre le shell et la page
 * dans la bonne couleur dès le premier affichage (sans flash, et sans écart d'hydratation — 2026-10-18).
 */

export type AppTheme = 'light' | 'dark'

/** Clé `localStorage` et nom du cookie. */
export const APP_THEME_STORAGE_KEY = 'pubg_app_theme'

/** Thème d'un premier visiteur. */
export const DEFAULT_APP_THEME: AppTheme = 'dark'

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

export function isAppTheme(value: unknown): value is AppTheme {
  return value === 'light' || value === 'dark'
}

/** Thème d'une valeur lue (cookie, stockage), celui par défaut si elle est absente ou invalide. */
export function resolveAppTheme(value: string | null | undefined): AppTheme {
  return isAppTheme(value) ? value : DEFAULT_APP_THEME
}

/** Valeur de `document.cookie` qui enregistre le thème pour un an, sur tout le site. */
export function appThemeCookie(theme: AppTheme) {
  return `${APP_THEME_STORAGE_KEY}=${theme}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`
}

/** Applique le thème au document et l'enregistre (stockage et cookie). Navigateur seulement. */
export function persistAppTheme(theme: AppTheme) {
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
  } catch {
    // Stockage indisponible (navigation privée, données bloquées) : le cookie suffit.
  }
  document.cookie = appThemeCookie(theme)
  for (const element of [document.documentElement, document.body]) {
    element.setAttribute('data-app-theme', theme)
    element.classList.toggle('dark', theme === 'dark')
  }
}

/** Thème gardé dans le navigateur, `null` s'il n'y en a pas ou si le stockage est inaccessible. */
export function readStoredAppTheme(): AppTheme | null {
  try {
    const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY)
    return isAppTheme(stored) ? stored : null
  } catch {
    return null
  }
}
