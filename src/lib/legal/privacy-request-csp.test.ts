import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Sans `unsafe-eval` dans la CSP, zod 4 ne doit jamais essayer `Function("")` dans le navigateur : seul module zod du
 * navigateur, `privacy-request.ts` le passe en mode sans compilation (`jitless`). La configuration de zod est commune
 * au processus et survit au rechargement des modules : elle est remise à zéro autour de chaque cas.
 */

async function resetZodConfig() {
  const { z } = await import('zod')
  z.config({ jitless: undefined })
}

beforeEach(resetZodConfig)

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.resetModules()
  await resetZodConfig()
})

describe('privacy-request — zod sous la CSP', () => {
  it('passe zod en mode sans compilation dans le navigateur', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    const { z } = await import('zod')
    await import('./privacy-request')

    expect(z.config().jitless).toBe(true)
  })

  it('ne change rien côté serveur', async () => {
    vi.resetModules()
    const { z } = await import('zod')
    await import('./privacy-request')

    expect(z.config().jitless).not.toBe(true)
  })

  it('le formulaire valide toujours en mode sans compilation', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    const { validatePrivacyRequest } = await import('./privacy-request')

    expect(validatePrivacyRequest({ kind: 'hide', pubgName: '', email: 'pas-une-adresse' }).ok).toBe(false)
  })
})
