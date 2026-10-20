import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getAccountLinkBaseUrl,
  getPublicSiteBaseUrl,
  resetPublicBaseUrlWarningsForTests,
} from '@/lib/public-base-url'

/** Adresse du site dans les liens envoyés hors du site (docs/TODO/url-masking.md §4.D). */

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetPublicBaseUrlWarningsForTests()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warn.mockRestore()
})

describe('getPublicSiteBaseUrl — messages Discord et alertes', () => {
  it('préfère NEXT_PUBLIC_APP_URL, sans barre finale', () => {
    expect(getPublicSiteBaseUrl({ NEXT_PUBLIC_APP_URL: 'https://chickendinner.fr//', APP_URL: 'https://autre.fr' })).toBe(
      'https://chickendinner.fr'
    )
  })

  it('retombe sur APP_URL, y compris quand NEXT_PUBLIC_APP_URL est vide', () => {
    expect(getPublicSiteBaseUrl({ APP_URL: 'https://chickendinner.fr' })).toBe('https://chickendinner.fr')
    expect(getPublicSiteBaseUrl({ NEXT_PUBLIC_APP_URL: '  ', APP_URL: ' https://chickendinner.fr/ ' })).toBe(
      'https://chickendinner.fr'
    )
  })

  it('rien de configuré : chaîne vide et un seul avertissement par processus', () => {
    expect(getPublicSiteBaseUrl({})).toBe('')
    expect(getPublicSiteBaseUrl({ NEXT_PUBLIC_APP_URL: '', APP_URL: '' })).toBe('')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('sans lien')
  })

  it('aucun avertissement quand une adresse est configurée', () => {
    getPublicSiteBaseUrl({ NEXT_PUBLIC_APP_URL: 'https://chickendinner.fr' })
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('getAccountLinkBaseUrl — activation et mot de passe', () => {
  it('préfère APP_URL, puis NEXT_PUBLIC_APP_URL', () => {
    expect(getAccountLinkBaseUrl({ APP_URL: 'https://compte.fr/', NEXT_PUBLIC_APP_URL: 'https://chickendinner.fr' })).toBe(
      'https://compte.fr'
    )
    expect(getAccountLinkBaseUrl({ APP_URL: '', NEXT_PUBLIC_APP_URL: 'https://chickendinner.fr' })).toBe(
      'https://chickendinner.fr'
    )
  })

  it('retombe sur localhost ; n’avertit qu’en production', () => {
    expect(getAccountLinkBaseUrl({ NODE_ENV: 'development' })).toBe('http://localhost:3000')
    expect(warn).not.toHaveBeenCalled()

    expect(getAccountLinkBaseUrl({ NODE_ENV: 'production' })).toBe('http://localhost:3000')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
