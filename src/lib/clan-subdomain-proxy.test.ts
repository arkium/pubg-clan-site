import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createSubdomainTargetsCache,
  extractSubdomainLabel,
  readSubdomainRoot,
  subdomainRedirectLocation,
} from './clan-subdomain-host'

const ROOT = 'chickendinner.fr'
const TARGETS = { smk: 1, kilslms: 2 }

describe('extractSubdomainLabel', () => {
  it('extrait le libellé d’un sous-domaine du domaine racine', () => {
    expect(extractSubdomainLabel('smk.chickendinner.fr', ROOT)).toBe('smk')
    expect(extractSubdomainLabel('SMK.ChickenDinner.fr:443', ROOT)).toBe('smk')
  })

  it('ignore le domaine racine, www, localhost, les adresses IP et les autres domaines', () => {
    for (const host of ['chickendinner.fr', 'www.chickendinner.fr', 'localhost:3000', '127.0.0.1:3000', 'autre.fr', 'fakechickendinner.fr', '', null]) {
      expect(extractSubdomainLabel(host, ROOT)).toBeNull()
    }
  })
})

describe('readSubdomainRoot', () => {
  it('est désactivé sans CLAN_SUBDOMAIN_ROOT', () => {
    expect(readSubdomainRoot({})).toBeNull()
    expect(readSubdomainRoot({ CLAN_SUBDOMAIN_ROOT: '  ' })).toBeNull()
    expect(readSubdomainRoot({ CLAN_SUBDOMAIN_ROOT: ' .ChickenDinner.fr ' })).toBe(ROOT)
  })
})

describe('subdomainRedirectLocation', () => {
  const location = (label: string, pathname = '/') => subdomainRedirectLocation({ label, pathname, root: ROOT, targets: TARGETS })

  it('mène un sous-domaine attribué à la vue d’ensemble du clan, chemin ignoré', () => {
    expect(location('smk')).toBe('https://chickendinner.fr/clans/1/overview')
    expect(location('kilslms', '/stats')).toBe('https://chickendinner.fr/clans/2/overview')
  })

  it('mène un sous-domaine inconnu, réservé ou à plusieurs niveaux vers la liste des clans', () => {
    expect(location('bidon')).toBe('https://chickendinner.fr/clans')
    expect(location('api')).toBe('https://chickendinner.fr/clans')
    expect(location('a.smk')).toBe('https://chickendinner.fr/clans')
  })

  it('relaie un lien court de match au domaine racine avec le clan', () => {
    expect(location('smk', '/m/cmuiawkib067x04zz8htx378f')).toBe(
      'https://chickendinner.fr/m/cmuiawkib067x04zz8htx378f?c=smk'
    )
    expect(location('api', '/m/cmuiawkib067x04zz8htx378f')).toBe('https://chickendinner.fr/m/cmuiawkib067x04zz8htx378f')
  })
})

describe('createSubdomainTargetsCache', () => {
  it('ne recharge la table qu’à l’expiration', async () => {
    let now = 0
    const load = vi.fn().mockResolvedValue(TARGETS)
    const getTargets = createSubdomainTargetsCache(load, { ttlMs: 1000, now: () => now })
    await Promise.all([getTargets(), getTargets()])
    now = 999
    await getTargets()
    expect(load).toHaveBeenCalledTimes(1)
    now = 1001
    await getTargets()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('garde la table précédente quand le rechargement échoue', async () => {
    let now = 0
    const load = vi.fn().mockResolvedValueOnce(TARGETS).mockRejectedValueOnce(new Error('panne'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const getTargets = createSubdomainTargetsCache(load, { ttlMs: 1000, retryMs: 100, now: () => now })
    await getTargets()
    now = 2000
    expect(await getTargets()).toEqual(TARGETS)
    errors.mockRestore()
  })
})

describe('proxy — sous-domaines de clan', () => {
  const previousRoot = process.env.CLAN_SUBDOMAIN_ROOT
  const previousInternal = process.env.INTERNAL_APP_URL
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset().mockImplementation(async (input: string) => {
      if (input.endsWith('/api/internal/clan-subdomains')) return Response.json({ targets: TARGETS })
      if (input.endsWith('/api/setup/status')) return Response.json({ setupState: 'completed' })
      throw new Error(`appel imprévu : ${input}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    process.env.INTERNAL_APP_URL = 'http://127.0.0.1:3000'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (previousRoot === undefined) delete process.env.CLAN_SUBDOMAIN_ROOT
    else process.env.CLAN_SUBDOMAIN_ROOT = previousRoot
    if (previousInternal === undefined) delete process.env.INTERNAL_APP_URL
    else process.env.INTERNAL_APP_URL = previousInternal
  })

  const request = (url: string, host: string) => new NextRequest(url, { headers: { host } })

  it('redirige en 307 vers la vue d’ensemble, avant la logique d’installation, via la route interne', async () => {
    process.env.CLAN_SUBDOMAIN_ROOT = ROOT
    const { proxy } = await import('../proxy')
    const response = await proxy(request('https://smk.chickendinner.fr/stats', 'smk.chickendinner.fr'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://chickendinner.fr/clans/1/overview')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:3000/api/internal/clan-subdomains')
  })

  it('ne consulte la table qu’une fois pour plusieurs requêtes (cache)', async () => {
    process.env.CLAN_SUBDOMAIN_ROOT = ROOT
    const { proxy } = await import('../proxy')
    await proxy(request('https://smk.chickendinner.fr/', 'smk.chickendinner.fr'))
    const second = await proxy(request('https://bidon.chickendinner.fr/', 'bidon.chickendinner.fr'))
    expect(second.headers.get('location')).toBe('https://chickendinner.fr/clans')
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/clan-subdomains'))).toHaveLength(1)
  })

  it('laisse passer le domaine racine sans consulter la table', async () => {
    process.env.CLAN_SUBDOMAIN_ROOT = ROOT
    const { proxy } = await import('../proxy')
    await proxy(request('https://chickendinner.fr/login', 'chickendinner.fr'))
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/clan-subdomains'))).toBe(false)
  })

  it('est inactif sans CLAN_SUBDOMAIN_ROOT', async () => {
    delete process.env.CLAN_SUBDOMAIN_ROOT
    const { proxy } = await import('../proxy')
    const response = await proxy(request('https://smk.chickendinner.fr/login', 'smk.chickendinner.fr'))
    expect(response.status).not.toBe(307)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/clan-subdomains'))).toBe(false)
  })
})
