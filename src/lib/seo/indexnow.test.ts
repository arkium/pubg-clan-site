import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET as getIndexNowKey } from '@/app/api/indexnow-key/route'
import { INDEXNOW_ENDPOINT, indexNowRequest, notifyIndexNow, readIndexNowKey } from '@/lib/seo/indexnow'

/** IndexNow (docs/TODO/geo-seo-propositions.md, 4.3) : coupé par défaut, aucun appel réseau dans ces tests. */

const KEY = 'a1b2c3d4e5f6a7b8'
const PROD = { INDEXNOW_KEY: KEY, NEXT_PUBLIC_APP_URL: 'https://chickendinner.fr' }

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('indexNowRequest', () => {
  it('coupé sans clé, ou avec une clé hors format', () => {
    expect(indexNowRequest(['/tournaments/abc'], { NEXT_PUBLIC_APP_URL: 'https://chickendinner.fr' })).toEqual({ skip: 'disabled' })
    expect(readIndexNowKey({ INDEXNOW_KEY: 'court' })).toBeNull()
    expect(readIndexNowKey({ INDEXNOW_KEY: 'pas de espaces ici' })).toBeNull()
  })

  it('jamais depuis un poste de développement ou une préproduction', () => {
    expect(indexNowRequest(['/clans'], { INDEXNOW_KEY: KEY, NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })).toEqual({ skip: 'not_production' })
    expect(indexNowRequest(['/clans'], { INDEXNOW_KEY: KEY, NEXT_PUBLIC_APP_URL: 'https://preprod.chickendinner.fr' })).toEqual({
      skip: 'not_production',
    })
  })

  it('corps du protocole : hôte, clé, emplacement de la clé, adresses absolues sans doublon', () => {
    expect(indexNowRequest(['/tournaments/abc', '/tournaments', '/tournaments', 'https://evil.example/x'], PROD)).toEqual({
      body: {
        host: 'chickendinner.fr',
        key: KEY,
        keyLocation: 'https://chickendinner.fr/indexnow.txt',
        urlList: ['https://chickendinner.fr/tournaments/abc', 'https://chickendinner.fr/tournaments'],
      },
    })
    expect(indexNowRequest([], PROD)).toEqual({ skip: 'empty' })
  })
})

describe('notifyIndexNow', () => {
  it('envoie une seule requête POST JSON à api.indexnow.org', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }))

    await expect(notifyIndexNow(['/clans/7/overview'], { env: PROD, fetchImpl })).resolves.toEqual({ sent: true, status: 202 })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(INDEXNOW_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body)).urlList).toEqual(['https://chickendinner.fr/clans/7/overview'])
  })

  it('coupé : aucun appel ; réseau en panne : jamais d’erreur pour l’écriture appelante', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('réseau coupé')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(notifyIndexNow(['/clans'], { env: {}, fetchImpl })).resolves.toEqual({ sent: false, reason: 'disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(notifyIndexNow(['/clans'], { env: PROD, fetchImpl })).resolves.toEqual({ sent: false, reason: 'failed' })
    warn.mockRestore()
  })
})

describe('/indexnow.txt', () => {
  it('404 sans clé, la clé seule en texte sinon', async () => {
    vi.stubEnv('INDEXNOW_KEY', '')
    expect(getIndexNowKey().status).toBe(404)

    vi.stubEnv('INDEXNOW_KEY', KEY)
    const response = getIndexNowKey()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    await expect(response.text()).resolves.toBe(KEY)
  })
})
