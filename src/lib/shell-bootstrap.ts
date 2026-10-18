import type { AppTheme } from '@/lib/app-theme'
import type { SetupState } from '@/lib/setup-service'

/**
 * Ce que le layout racine sait déjà au moment du rendu serveur, transmis aux composants client
 * (`ShellBootstrapProvider`) pour que leur **premier rendu** soit le bon : le shell (menu, `<main>`) et les pages
 * publiques sont alors dans le HTML, au lieu d'attendre `/api/auth/mode` et `/api/auth/session` côté navigateur.
 * Les robots qui n'exécutent pas le JavaScript lisaient sinon des pages vides (docs/TODO/geo-seo-propositions.md, lot 1).
 */
export type ShellBootstrap = {
  /** `DISABLE_AUTH_PERMISSIONS=true` : mode visiteur, lecture publique. */
  authDisabled: boolean
  /** Session valide lue dans le cookie par le layout. */
  hasSession: boolean
  setupState: SetupState
  theme: AppTheme
}

/**
 * Point de départ de `useAuthSession` : le mode visiteur est connu dès le premier rendu, ce qui suffit au shell (menu,
 * `<main>`) et aux pages de lecture publique. La session, elle, reste « en chargement » jusqu'à la réponse de
 * `/api/auth/session` : une garde ne conclut jamais « pas connecté » avant (les tests Playwright simulent la session
 * dans le navigateur seulement, et un cookie posé après le rendu doit compter).
 */
export function bootstrapAuthState(bootstrap: ShellBootstrap | null): { loading: true; authDisabled: boolean } {
  return { loading: true, authDisabled: bootstrap?.authDisabled ?? false }
}

/**
 * Visiteur (mode visiteur, sans session) : le shell affiche « Se connecter » et le badge « Visiteur ». Pendant le
 * chargement, seule une session vue par le serveur fait attendre — sinon le HTML montrerait un faux membre.
 */
export function isVisitorState(state: { loading: boolean; authenticated: boolean; authDisabled: boolean }, bootstrap: ShellBootstrap | null) {
  if (state.authenticated || !state.authDisabled) return false
  return !state.loading || !bootstrap?.hasSession
}
