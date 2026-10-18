import { describe, expect, it } from 'vitest'

import { appThemeCookie, DEFAULT_APP_THEME, resolveAppTheme } from './app-theme'
import { bootstrapAuthState, isVisitorState, type ShellBootstrap } from './shell-bootstrap'

const VISITOR: ShellBootstrap = { authDisabled: true, hasSession: false, setupState: 'completed', theme: 'dark' }
const LOADING = { loading: true, authenticated: false, authDisabled: true }

describe('bootstrapAuthState', () => {
  it('connaît le mode visiteur dès le premier rendu', () => {
    expect(bootstrapAuthState(VISITOR).authDisabled).toBe(true)
    expect(bootstrapAuthState({ ...VISITOR, authDisabled: false }).authDisabled).toBe(false)
  })

  it('laisse toujours la session en chargement : aucune garde ne conclut « pas connecté » avant l’API', () => {
    expect(bootstrapAuthState(VISITOR).loading).toBe(true)
    expect(bootstrapAuthState({ ...VISITOR, hasSession: true }).loading).toBe(true)
  })

  it('hors du layout (pas de bootstrap), garde l’ancien comportement', () => {
    expect(bootstrapAuthState(null)).toEqual({ loading: true, authDisabled: false })
  })
})

describe('isVisitorState', () => {
  it('reconnaît le visiteur sans session dès le HTML, pendant le chargement', () => {
    expect(isVisitorState(LOADING, VISITOR)).toBe(true)
  })

  it('ne montre pas un visiteur pendant le chargement d’une session vue par le serveur', () => {
    expect(isVisitorState(LOADING, { ...VISITOR, hasSession: true })).toBe(false)
  })

  it('suit la réponse de l’API une fois chargée', () => {
    expect(isVisitorState({ ...LOADING, loading: false }, { ...VISITOR, hasSession: true })).toBe(true)
    expect(isVisitorState({ ...LOADING, loading: false, authenticated: true }, VISITOR)).toBe(false)
  })

  it('jamais hors du mode visiteur', () => {
    expect(isVisitorState({ ...LOADING, authDisabled: false }, VISITOR)).toBe(false)
  })
})

describe('thème', () => {
  it('lit le cookie, et retombe sur le thème sombre si la valeur est absente ou inconnue', () => {
    expect(resolveAppTheme('light')).toBe('light')
    expect(resolveAppTheme('dark')).toBe('dark')
    expect(resolveAppTheme(undefined)).toBe(DEFAULT_APP_THEME)
    expect(resolveAppTheme('rose')).toBe('dark')
  })

  it('écrit un cookie d’un an valable sur tout le site', () => {
    expect(appThemeCookie('light')).toBe('pubg_app_theme=light; Path=/; Max-Age=31536000; SameSite=Lax')
  })
})
