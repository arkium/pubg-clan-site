import { describe, expect, it } from 'vitest'

import { RESERVED_SUBDOMAINS, normalizeSubdomain, pickClanSubdomain, validateSubdomain } from './clan-subdomain'

const none = new Set<string>()

describe('normalizeSubdomain', () => {
  it('passe en minuscules et retire les accents', () => {
    expect(normalizeSubdomain('Équipe Éclair')).toBe('equipe-eclair')
  })

  it('remplace les caractères interdits par un tiret et fusionne les tirets', () => {
    expect(normalizeSubdomain('FR-Alliance--BE')).toBe('fr-alliance-be')
    expect(normalizeSubdomain('[B.E.E] Killer_Bees !')).toBe('b-e-e-killer-bees')
  })

  it('retire les tirets aux extrémités et borne la longueur', () => {
    expect(normalizeSubdomain('--smk--')).toBe('smk')
    const long = normalizeSubdomain('a'.repeat(62) + '-b')
    expect(long.length).toBeLessThanOrEqual(63)
    expect(long.endsWith('-')).toBe(false)
  })
})

describe('validateSubdomain', () => {
  it('accepte un libellé DNS valide', () => {
    expect(validateSubdomain('smk')).toBeNull()
    expect(validateSubdomain('fr-alliance-be')).toBeNull()
  })

  it('refuse les libellés trop courts, trop longs ou mal formés', () => {
    expect(validateSubdomain('a')).toBe('too_short')
    expect(validateSubdomain('a'.repeat(64))).toBe('too_long')
    expect(validateSubdomain('-smk')).toBe('invalid_characters')
    expect(validateSubdomain('smk-')).toBe('invalid_characters')
    expect(validateSubdomain('SMK')).toBe('invalid_characters')
    expect(validateSubdomain('s.mk')).toBe('invalid_characters')
  })

  it('refuse tous les mots réservés', () => {
    for (const reserved of RESERVED_SUBDOMAINS) expect(validateSubdomain(reserved)).toBe('reserved')
  })
})

describe('pickClanSubdomain', () => {
  it('prend le tag en minuscules quand il est libre et porté par ce seul clan', () => {
    expect(pickClanSubdomain({ clanId: 1, tag: 'SMK', name: 'Smoky', tagShared: false, taken: none })).toBe('smk')
  })

  it('prend le nom quand le tag est déjà attribué', () => {
    expect(pickClanSubdomain({ clanId: 3, tag: 'SMK', name: 'Smoky Kings', tagShared: false, taken: new Set(['smk']) })).toBe(
      'smoky-kings'
    )
  })

  it('prend le nom quand le tag est réservé ou invalide', () => {
    expect(pickClanSubdomain({ clanId: 4, tag: 'WWW', name: 'World Wide', tagShared: false, taken: none })).toBe('world-wide')
    expect(pickClanSubdomain({ clanId: 5, tag: 'B.E', name: 'Bee', tagShared: false, taken: none })).toBe('bee')
    expect(pickClanSubdomain({ clanId: 6, tag: 'X', name: 'Xenon', tagShared: false, taken: none })).toBe('xenon')
  })

  it('ajoute un suffixe numérique quand le nom est pris aussi', () => {
    const taken = new Set(['smk', 'smoky'])
    expect(pickClanSubdomain({ clanId: 7, tag: 'SMK', name: 'Smoky', tagShared: false, taken })).toBe('smoky-2')
    expect(
      pickClanSubdomain({ clanId: 8, tag: 'SMK', name: 'Smoky', tagShared: false, taken: new Set([...taken, 'smoky-2']) })
    ).toBe('smoky-3')
  })

  it('retombe sur clan-<id> quand ni le tag ni le nom ne donnent de base', () => {
    expect(pickClanSubdomain({ clanId: 9, tag: '?', name: '!!', tagShared: false, taken: none })).toBe('clan-9')
  })

  it('applique les quatre attributions décidées pour les tags en double (§4.B)', () => {
    const decisions = [
      { clanId: 2, tag: 'KMS', name: 'KilslMS', expected: 'kilslms' },
      { clanId: 180, tag: 'KMS', name: 'KeepMoveSurvive', expected: 'keepmovesurvive' },
      { clanId: 7, tag: 'FR', name: 'FR-Alliance-BE', expected: 'fr-alliance-be' },
      { clanId: 24, tag: 'FR', name: 'teambaguette', expected: 'teambaguette' },
    ]
    for (const decision of decisions) {
      expect(pickClanSubdomain({ ...decision, tagShared: true, taken: none })).toBe(decision.expected)
    }
  })
})
