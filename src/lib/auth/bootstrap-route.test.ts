import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest ne collecte que `src/lib/**` : la route est importée depuis src/app. Le service est simulé : rien n'est écrit.
const mocks = vi.hoisted(() => ({ createOwnerBootstrapInvite: vi.fn() }))
vi.mock('@/lib/auth-service', () => ({ createOwnerBootstrapInvite: mocks.createOwnerBootstrapInvite }))

import { POST } from '@/app/api/auth/bootstrap-owner-invite/route'
import { matchesSecret, secretState, usableSecret } from '@/lib/auth/secrets'

const GOOD_SECRET = 'Zs1pW8kQ2mVt7rXc4bN9yL0e'

function post(secret: string | null) {
  return new Request('http://localhost:3000/api/auth/bootstrap-owner-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-bootstrap-secret': secret }) },
    body: JSON.stringify({ clanId: 1, email: 'owner@exemple.fr' }),
  })
}

describe('secrets du .env', () => {
  it('état : absent, valeur d’exemple, trop court, utilisable', () => {
    expect(secretState(undefined)).toBe('missing')
    expect(secretState('  ')).toBe('missing')
    expect(secretState('change-me-long-random-string')).toBe('example')
    // Exemples du secret du cron (.env.example, docs/ops/deployment.md) : publics eux aussi.
    expect(secretState('change-me-cron-secret')).toBe('example')
    expect(secretState('ton-secret-long')).toBe('example')
    expect(secretState('court')).toBe('too_short')
    expect(secretState(GOOD_SECRET)).toBe('ok')
    expect(usableSecret(` ${GOOD_SECRET} `)).toBe(GOOD_SECRET)
  })

  it('compare seulement à un secret utilisable', () => {
    expect(matchesSecret(GOOD_SECRET, GOOD_SECRET)).toBe(true)
    expect(matchesSecret('autre', GOOD_SECRET)).toBe(false)
    expect(matchesSecret('change-me-long-random-string', 'change-me-long-random-string')).toBe(false)
    expect(matchesSecret('court', 'court')).toBe(false)
    expect(matchesSecret(null, GOOD_SECRET)).toBe(false)
  })
})

describe('POST /api/auth/bootstrap-owner-invite', () => {
  const previous = process.env.AUTH_BOOTSTRAP_SECRET

  beforeEach(() => {
    mocks.createOwnerBootstrapInvite.mockReset().mockResolvedValue({
      inviteId: 'i1',
      expiresAt: new Date('2026-10-12T00:00:00Z'),
      activationUrl: 'https://chickendinner.fr/activate?token=t',
      ownerMember: { id: 1, displayName: 'Owner', clan: { id: 1, name: 'Clan', tag: 'CLN' } },
    })
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.AUTH_BOOTSTRAP_SECRET
    else process.env.AUTH_BOOTSTRAP_SECRET = previous
  })

  it('fermée quand le .env garde la valeur d’exemple, même envoyée telle quelle', async () => {
    process.env.AUTH_BOOTSTRAP_SECRET = 'change-me-long-random-string'
    const response = await POST(post('change-me-long-random-string'))
    expect(response.status).toBe(401)
    expect(mocks.createOwnerBootstrapInvite).not.toHaveBeenCalled()
  })

  it('fermée avec un secret trop court, sans secret configuré, ou un mauvais secret', async () => {
    process.env.AUTH_BOOTSTRAP_SECRET = 'court'
    expect((await POST(post('court'))).status).toBe(401)
    delete process.env.AUTH_BOOTSTRAP_SECRET
    expect((await POST(post(GOOD_SECRET))).status).toBe(401)
    process.env.AUTH_BOOTSTRAP_SECRET = GOOD_SECRET
    expect((await POST(post('mauvais-secret-de-meme-taille'))).status).toBe(401)
    expect((await POST(post(null))).status).toBe(401)
    expect(mocks.createOwnerBootstrapInvite).not.toHaveBeenCalled()
  })

  it('ouverte avec le vrai secret', async () => {
    process.env.AUTH_BOOTSTRAP_SECRET = GOOD_SECRET
    const response = await POST(post(GOOD_SECRET))
    expect(response.status).toBe(200)
    expect(mocks.createOwnerBootstrapInvite).toHaveBeenCalledWith({ clanId: 1, email: 'owner@exemple.fr' })
  })
})
