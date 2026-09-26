import { describe, expect, it } from 'vitest'

import { clanBackgroundImage, DEFAULT_CLAN_IMAGE } from './clan-image'

describe('clan-image — fond de carte', () => {
  it("pose l'image par défaut sous celle du clan, pour qu'un lien rompu ne laisse pas un cadre vide", () => {
    expect(clanBackgroundImage('/uploads/clans/clan-7.jpg')).toBe(`url('/uploads/clans/clan-7.jpg'), url('${DEFAULT_CLAN_IMAGE}')`)
  })

  it("n'affiche que l'image par défaut sans image propre", () => {
    expect(clanBackgroundImage(null)).toBe(`url('${DEFAULT_CLAN_IMAGE}')`)
    expect(clanBackgroundImage('   ')).toBe(`url('${DEFAULT_CLAN_IMAGE}')`)
    expect(clanBackgroundImage(DEFAULT_CLAN_IMAGE)).toBe(`url('${DEFAULT_CLAN_IMAGE}')`)
  })

  it('échappe les apostrophes de l’URL', () => {
    expect(clanBackgroundImage("https://exemple.fr/l'image.jpg")).toBe(`url('https://exemple.fr/l\\'image.jpg'), url('${DEFAULT_CLAN_IMAGE}')`)
  })
})
