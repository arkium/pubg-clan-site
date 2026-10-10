import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Le lien « Ne plus recevoir ces e-mails » s'ouvre sans session : le proxy doit le laisser passer hors mode visiteur,
// sans ouvrir pour autant les pages joueur. Aucun appel réseau réel : `fetch` est simulé (état d'installation).
describe('proxy — page de désabonnement des e-mails', () => {
  const previous = {
    auth: process.env.DISABLE_AUTH_PERMISSIONS,
    root: process.env.CLAN_SUBDOMAIN_ROOT,
    internal: process.env.INTERNAL_APP_URL,
  }
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset().mockImplementation(async (input: string) => {
      if (String(input).endsWith('/api/setup/status')) return Response.json({ setupState: 'completed' })
      throw new Error(`appel imprévu : ${input}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    process.env.DISABLE_AUTH_PERMISSIONS = 'false'
    process.env.INTERNAL_APP_URL = 'http://127.0.0.1:3000'
    delete process.env.CLAN_SUBDOMAIN_ROOT
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const [key, value] of [
      ['DISABLE_AUTH_PERMISSIONS', previous.auth],
      ['CLAN_SUBDOMAIN_ROOT', previous.root],
      ['INTERNAL_APP_URL', previous.internal],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  const request = (path: string) => new NextRequest(`https://chickendinner.fr${path}`, { headers: { host: 'chickendinner.fr' } })

  it('laisse passer /notifications/desabonnement sans session', async () => {
    const { proxy } = await import('../proxy')
    const response = await proxy(request('/notifications/desabonnement?t=42.signature'))
    expect(response.headers.get('location')).toBeNull()
  })

  it('renvoie toujours une page joueur sans session vers la connexion', async () => {
    const { proxy } = await import('../proxy')
    const response = await proxy(request('/members/42/notification-preferences'))
    expect(response.headers.get('location')).toBe('https://chickendinner.fr/login')
  })
})
