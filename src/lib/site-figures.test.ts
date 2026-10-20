import { describe, expect, it } from 'vitest'

import { citableSiteSentence, figuresDate } from '@/lib/site-figures'

/** Phrase citable de « À propos » (docs/TODO/geo-seo-propositions.md, 4.7). */

describe('citableSiteSentence', () => {
  it('chiffres du moment, au format français', () => {
    expect(citableSiteSentence({ clans: 33, players: 510, analyzedMatches: 31_205 })).toBe(
      'chickendinner.fr suit 33 clans PUBG francophones, soit 510 joueurs, et a analysé 31 205 parties d’escouade.'
    )
  })

  it('accorde le singulier', () => {
    expect(citableSiteSentence({ clans: 1, players: 1, analyzedMatches: 1 })).toBe(
      'chickendinner.fr suit 1 clan PUBG francophone, soit 1 joueur, et a analysé 1 partie d’escouade.'
    )
  })
})

describe('figuresDate', () => {
  it('jour de Paris, même tard le soir en UTC', () => {
    expect(figuresDate(new Date('2026-10-20T22:30:00.000Z'))).toEqual({ iso: '2026-10-21', label: '21 octobre 2026' })
  })
})
