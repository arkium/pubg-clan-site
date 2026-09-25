import { expect, test as base, type Page, type Request } from '@playwright/test'

import { CLAN_ID, clanList } from './data'

/**
 * Interception de TOUTES les API du navigateur — docs/ops/tests-e2e.md.
 *
 * Chaque appel `/api/**` reçoit une réponse figée ; un appel sans réponse prévue est bloqué et fait
 * échouer le test. Aucun test ne peut donc écrire en base, et les écrans restent stables malgré les
 * dates relatives et les compteurs. Seules les lectures du rendu serveur (état d'installation)
 * atteignent la base configurée dans `.env`.
 */

export type ApiReply = { status?: number; body: unknown }
export type ApiHandler = ApiReply | ((url: URL, request: Request) => ApiReply)

/** Le shell (header, navigation, session) : mode visiteur, sans session. */
const SHELL_HANDLERS: Record<string, ApiHandler> = {
  'GET /api/auth/mode': { body: { authDisabled: true } },
  'GET /api/auth/session': { status: 401, body: { authenticated: false } },
  // Sans session, le client purge un éventuel cookie expiré.
  'POST /api/auth/logout': { body: { ok: true } },
  'GET /api/setup/status': { body: { setupState: 'completed', firstRun: false, pendingActivation: false } },
  // Réponse vide : la navigation retombe sur le registre par défaut.
  'GET /api/settings/nav-permissions': { body: {} },
  'GET /api/settings/login-welcome': { body: { settings: null, clanLabel: null } },
  // Nom du clan sélectionné, affiché dans le header.
  'GET /api/clans': { body: clanList() },
}

export class ApiMock {
  private readonly handlers = new Map<string, ApiHandler>(Object.entries(SHELL_HANDLERS))
  /** Appels sans réponse prévue : bloqués, le test échoue à la fin. */
  readonly unexpected: string[] = []
  /** Requêtes servies, dans l'ordre. */
  readonly served: Array<{ method: string; url: URL }> = []

  constructor(private readonly page: Page) {}

  async install() {
    await this.page.route('**/api/**', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const key = `${request.method()} ${url.pathname}`
      const handler = this.handlers.get(key)
      if (!handler) {
        this.unexpected.push(`${key}${url.search}`)
        return route.abort('blockedbyclient')
      }
      this.served.push({ method: request.method(), url })
      const reply = typeof handler === 'function' ? handler(url, request) : handler
      return route.fulfill({ status: reply.status ?? 200, json: reply.body })
    })
  }

  /** Déclare la réponse d'une API (`GET /api/clans/1/leaderboard`, paramètres ignorés). */
  on(method: 'GET' | 'POST', pathname: string, handler: ApiHandler) {
    this.handlers.set(`${method} ${pathname}`, handler)
    return this
  }

  /** Valeurs successives du paramètre `name` dans les appels servis sur `pathname`. */
  paramValues(pathname: string, name: string) {
    return this.served.filter((call) => call.url.pathname === pathname).map((call) => call.url.searchParams.get(name))
  }
}

export const test = base.extend<{ api: ApiMock; pageErrors: string[] }>({
  page: async ({ page }, use) => {
    // Visiteur qui revient : clan déjà choisi. Sans cela, un lien direct vers une page de clan
    // renvoie aujourd'hui un premier visiteur vers /clans (useSelectedClan), hors du sujet testé.
    await page.addInitScript((clanId) => {
      window.localStorage.setItem('selectedClanId', String(clanId))
      window.localStorage.setItem('canSwitchClan', '1')
    }, CLAN_ID)
    await use(page)
  },
  pageErrors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await use(errors)
    expect(errors, 'erreurs JavaScript de la page').toEqual([])
  },
  api: async ({ page, pageErrors }, use) => {
    void pageErrors
    const api = new ApiMock(page)
    await api.install()
    await use(api)
    expect(api.unexpected, "appels d'API sans réponse prévue (bloqués)").toEqual([])
  },
})

export { expect }
