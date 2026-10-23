import { describe, expect, it } from 'vitest'

import nextConfig, { SECURITY_HEADERS } from '../../../next.config'
import { wwwRedirectLocation } from '../seo/canonical-host'
import { buildCsp, createNonce, CSP_HEADER } from './csp'

const directive = (csp: string, name: string) => csp.split('; ').find((part) => part.startsWith(`${name} `))

describe('buildCsp', () => {
  const csp = buildCsp({ nonce: 'abc123' })

  it('scripts : le nonce de la requête et ce qu’ils chargent, rien d’autre ; jamais eval en production', () => {
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(csp).not.toContain('unsafe-eval')
    expect(buildCsp({ nonce: 'abc123', dev: true })).toContain("'unsafe-eval'")
  })

  it('ni plugin, ni base détournée, ni formulaire vers un autre site, ni cadre sur un autre site', () => {
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'self'")
  })

  it('le navigateur n’appelle que le site ; images externes en HTTPS seulement', () => {
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'")
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob: https:")
  })

  it('bloquante depuis le 2026-10-23, sans upgrade-insecure-requests (HSTS ; build local en http)', () => {
    expect(CSP_HEADER).toBe('Content-Security-Policy')
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  it('un nonce différent à chaque requête', () => {
    expect(createNonce()).not.toBe(createNonce())
  })
})

describe('next.config.ts — en-têtes de sécurité', () => {
  it('sur toutes les réponses, HSTS sans les sous-domaines (pas encore de certificat wildcard)', async () => {
    const rules = await nextConfig.headers!()
    expect(rules.find((rule) => rule.source === '/:path*')?.headers).toEqual(SECURITY_HEADERS)
    const hsts = SECURITY_HEADERS.find((header) => header.key === 'Strict-Transport-Security')?.value
    expect(hsts).toBe('max-age=31536000')
    expect(SECURITY_HEADERS.map((header) => header.key)).toEqual(
      expect.arrayContaining(['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy'])
    )
  })

  it('n’annonce pas le framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })
})

describe('wwwRedirectLocation', () => {
  const at = (host: string | null, forwardedProto: string | null = 'https') =>
    wwwRedirectLocation({ host, pathname: '/clans', search: '?period=week', forwardedProto })

  it('www. vers le domaine sans www, chemin et requête gardés', () => {
    expect(at('www.chickendinner.fr')).toBe('https://chickendinner.fr/clans?period=week')
    expect(at('WWW.chickendinner.fr', null)).toBe('https://chickendinner.fr/clans?period=week')
  })

  it('rien pour le domaine, un sous-domaine de clan ou un hôte local', () => {
    expect(at('chickendinner.fr')).toBeNull()
    expect(at('smk.chickendinner.fr')).toBeNull()
    expect(at('www.localhost:3000')).toBeNull()
    expect(at(null)).toBeNull()
  })
})
