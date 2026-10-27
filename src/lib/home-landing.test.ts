import { describe, expect, it } from 'vitest'

import { HOME_SHOWCASE_HREF, homeLandingRedirect, memberProfileHref } from '@/lib/home-landing'

describe('arrivée sur l’accueil', () => {
  it('envoie un membre connecté sur son profil', () => {
    expect(homeLandingRedirect({ activeMemberId: 284 }, {})).toBe('/members/284/dashboard')
    expect(memberProfileHref(284)).toBe('/members/284/dashboard')
  })

  it('montre la vitrine à un visiteur, à un connecté sans membre actif, et par l’entrée « Accueil » du menu', () => {
    expect(homeLandingRedirect(null, {})).toBeNull()
    expect(homeLandingRedirect({ activeMemberId: null }, {})).toBeNull()
    expect(homeLandingRedirect({ activeMemberId: 284 }, { vitrine: '' })).toBeNull()
    expect(homeLandingRedirect({ activeMemberId: 284 }, { vitrine: '1' })).toBeNull()
    expect(HOME_SHOWCASE_HREF).toBe('/?vitrine')
  })
})
