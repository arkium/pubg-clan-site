import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest ne collecte que `src/lib/**` (voir vitest.config.ts) : comme discord-route-contracts.test.ts, ce fichier vit
// dans src/lib et importe la route depuis src/app. Prisma, les notifications et l'e-mail sont simulés : rien n'est écrit.
const mocks = vi.hoisted(() => ({
  privacyRequestCreate: vi.fn(),
  notifyPrivacyRequest: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { privacyRequest: { create: mocks.privacyRequestCreate } },
}))

vi.mock('@/lib/notification-service', () => ({
  notifyPrivacyRequest: mocks.notifyPrivacyRequest,
}))

vi.mock('@/lib/email-service', () => ({
  sendEmail: mocks.sendEmail,
}))

const VALID = { pubgName: 'Arkium_FR', kind: 'purge', reason: 'Je ne joue plus.', email: 'joueur@exemple.fr', confirmOwner: true }
const STORED = { id: 12, ...VALID, status: 'pending', createdAt: new Date('2026-10-05T10:00:00Z'), handledAt: null }

function post(body: unknown, ip = '203.0.113.7') {
  return new Request('http://localhost:3000/api/privacy-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

// Les compteurs de fréquence vivent sur globalThis : un module neuf et des compteurs vides à chaque test.
async function loadRoute() {
  delete (globalThis as Record<string, unknown>).__privacyRequestLimiters
  vi.resetModules()
  return import('@/app/api/privacy-requests/route')
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.privacyRequestCreate.mockResolvedValue(STORED)
  mocks.notifyPrivacyRequest.mockResolvedValue(undefined)
  mocks.sendEmail.mockResolvedValue({ delivered: true })
})

describe('POST /api/privacy-requests', () => {
  it('enregistre la demande, prévient les SuperUsers et écrit à l’adresse de contact', async () => {
    const { POST } = await loadRoute()
    const response = await POST(post(VALID))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true, id: 12 })
    expect(mocks.privacyRequestCreate).toHaveBeenCalledWith({
      data: { pubgName: 'Arkium_FR', kind: 'purge', reason: 'Je ne joue plus.', email: 'joueur@exemple.fr' },
    })
    expect(mocks.notifyPrivacyRequest).toHaveBeenCalledWith({
      id: 12,
      title: 'Demande sur les données n° 12',
      message: 'Purger mon historique pour Arkium_FR. Réponse à joueur@exemple.fr avant le 5 novembre 2026.',
      data: { privacyRequestId: 12, kind: 'purge', pubgName: 'Arkium_FR', email: 'joueur@exemple.fr', reason: 'Je ne joue plus.' },
    })
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'contact@chickendinner.fr', subject: '[chickendinner.fr] Demande sur les données n° 12 : Purger mon historique' })
    )
  })

  it('n’enregistre pas un motif vide', async () => {
    const { POST } = await loadRoute()
    await POST(post({ ...VALID, reason: '   ' }))
    expect(mocks.privacyRequestCreate.mock.calls[0][0].data.reason).toBeNull()
  })

  it('garde la demande quand l’e-mail échoue', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('SMTP indisponible'))
    const { POST } = await loadRoute()
    const response = await POST(post(VALID))
    expect(response.status).toBe(201)
    expect(mocks.privacyRequestCreate).toHaveBeenCalledTimes(1)
  })

  it('répond 400 avec le détail par champ, sans rien enregistrer', async () => {
    const { POST } = await loadRoute()
    const response = await POST(post({ ...VALID, email: 'pas-un-mail', confirmOwner: false }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Certains champs sont à corriger.',
      fieldErrors: { email: 'Adresse e-mail invalide.', confirmOwner: 'Confirme être le titulaire de ce compte PUBG.' },
    })
    expect(mocks.privacyRequestCreate).not.toHaveBeenCalled()
  })

  it('répond 400 à un corps qui n’est pas du JSON', async () => {
    const { POST } = await loadRoute()
    const response = await POST(post('{pas du json'))
    expect(response.status).toBe(400)
    expect(mocks.privacyRequestCreate).not.toHaveBeenCalled()
  })

  it('fait croire au succès quand le champ piège est rempli, sans rien enregistrer', async () => {
    const { POST } = await loadRoute()
    const response = await POST(post({ ...VALID, website: 'http://spam.example' }))
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true, id: null })
    expect(mocks.privacyRequestCreate).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('limite à 3 demandes par heure et par adresse', async () => {
    const { POST } = await loadRoute()
    for (let index = 0; index < 3; index++) expect((await POST(post(VALID))).status).toBe(201)

    const blocked = await POST(post(VALID))
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toEqual({ error: 'Trop de demandes envoyées. Réessaie dans une heure.' })
    expect((await POST(post(VALID, '198.51.100.9'))).status).toBe(201)
    expect(mocks.privacyRequestCreate).toHaveBeenCalledTimes(4)
  })

  it('répond 500 quand l’enregistrement échoue', async () => {
    mocks.privacyRequestCreate.mockRejectedValue(new Error('base indisponible'))
    const { POST } = await loadRoute()
    const response = await POST(post(VALID))
    expect(response.status).toBe(500)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })
})

describe('proxy — pages légales', () => {
  const previousAuthDisabled = process.env.DISABLE_AUTH_PERMISSIONS

  beforeEach(() => {
    vi.resetModules()
    delete process.env.DISABLE_AUTH_PERMISSIONS
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (String(input).endsWith('/api/setup/status')) return Response.json({ setupState: 'completed' })
        throw new Error(`appel imprévu : ${input}`)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (previousAuthDisabled === undefined) delete process.env.DISABLE_AUTH_PERMISSIONS
    else process.env.DISABLE_AUTH_PERMISSIONS = previousAuthDisabled
  })

  it('ouvre les quatre pages sans session, même hors mode visiteur', async () => {
    const { proxy } = await import('../../proxy')
    for (const path of ['/mentions-legales', '/confidentialite', '/confidentialite/demande', '/a-propos']) {
      const response = await proxy(new NextRequest(`https://chickendinner.fr${path}`))
      expect(response.headers.get('location'), path).toBeNull()
    }
  })

  it('renvoie toujours une page privée vers la connexion', async () => {
    const { proxy } = await import('../../proxy')
    const response = await proxy(new NextRequest('https://chickendinner.fr/clans/1/overview'))
    expect(response.headers.get('location')).toContain('/login')
  })
})
