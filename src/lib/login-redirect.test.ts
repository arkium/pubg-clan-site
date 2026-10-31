import { describe, expect, it } from 'vitest'

import { redirectClanId, safeRedirectPath } from '@/lib/login-redirect'

describe('safeRedirectPath', () => {
  it('garde les chemins internes, requête comprise', () => {
    expect(safeRedirectPath('/clans/3/overview')).toBe('/clans/3/overview')
    expect(safeRedirectPath('/lecture-de-zone?tab=training')).toBe('/lecture-de-zone?tab=training')
    expect(safeRedirectPath('  /account  ')).toBe('/account')
  })

  it('refuse toute adresse qui sortirait du site', () => {
    for (const raw of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      'javascript:alert(1)',
      'clans/3/overview',
      '',
      null,
      undefined,
    ]) {
      expect(safeRedirectPath(raw), String(raw)).toBeNull()
    }
  })
})

describe('redirectClanId', () => {
  it('lit le clan d’un chemin /clans/<id>/…', () => {
    expect(redirectClanId('/clans/3/overview')).toBe(3)
    expect(redirectClanId('/clans/12')).toBe(12)
    expect(redirectClanId('/clans/7?tab=x')).toBe(7)
  })

  it('ignore les autres chemins', () => {
    expect(redirectClanId('/clans')).toBeNull()
    expect(redirectClanId('/clans/comparator')).toBeNull()
    expect(redirectClanId('/clans/0/overview')).toBeNull()
    expect(redirectClanId('/settings/clans/3')).toBeNull()
    expect(redirectClanId(null)).toBeNull()
  })
})
