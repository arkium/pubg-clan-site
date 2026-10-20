import { describe, expect, it } from 'vitest'

import { boldName, joinLinkedLines } from '@/lib/discord/embed-lines'
import { matchShortUrl, playerShortUrl, tournamentShortUrl } from '@/lib/short-links'

/** Fabrication des liens courts (docs/TODO/url-masking.md §4). */

const MATCH = 'cmatch0000000000000000001'
const TOURNAMENT = 'ctour00000000000000000001'
const SITE = { siteUrl: 'https://chickendinner.fr/' }

describe('matchShortUrl', () => {
  it('passe par le domaine principal, barre finale retirée', () => {
    expect(matchShortUrl(SITE, MATCH)).toBe(`https://chickendinner.fr/m/${MATCH}`)
  })

  it('passe par le sous-domaine du clan seulement quand la racine est configurée', () => {
    expect(matchShortUrl({ ...SITE, subdomainRoot: 'chickendinner.fr' }, MATCH, 'SMK')).toBe(
      `https://smk.chickendinner.fr/m/${MATCH}`
    )
    expect(matchShortUrl({ ...SITE, subdomainRoot: null }, MATCH, 'smk')).toBe(`https://chickendinner.fr/m/${MATCH}`)
    expect(matchShortUrl({ ...SITE, subdomainRoot: 'chickendinner.fr' }, MATCH, null)).toBe(
      `https://chickendinner.fr/m/${MATCH}`
    )
  })

  it('aucun lien sans base publique ni pour un identifiant hors format', () => {
    expect(matchShortUrl({ siteUrl: '' }, MATCH)).toBeNull()
    expect(matchShortUrl({ siteUrl: '  ' }, MATCH)).toBeNull()
    expect(matchShortUrl(SITE, 'test')).toBeNull()
    expect(matchShortUrl(SITE, `${MATCH}/../x`)).toBeNull()
  })
})

describe('tournamentShortUrl', () => {
  it('tournoi, manche et manche ouverte sur le Replay 2D', () => {
    expect(tournamentShortUrl(SITE, TOURNAMENT)).toBe(`https://chickendinner.fr/t/${TOURNAMENT}`)
    expect(tournamentShortUrl(SITE, TOURNAMENT, { squadMatchId: MATCH })).toBe(
      `https://chickendinner.fr/t/${TOURNAMENT}/${MATCH}`
    )
    expect(tournamentShortUrl(SITE, TOURNAMENT, { squadMatchId: MATCH, replay: true })).toBe(
      `https://chickendinner.fr/t/${TOURNAMENT}/${MATCH}?tab=replay`
    )
  })

  it('aucun lien pour un tournoi ou une manche hors format', () => {
    expect(tournamentShortUrl(SITE, 'coupe-automne')).toBeNull()
    expect(tournamentShortUrl(SITE, TOURNAMENT, { squadMatchId: 'test' })).toBeNull()
    expect(tournamentShortUrl({ siteUrl: '' }, TOURNAMENT)).toBeNull()
  })
})

describe('playerShortUrl', () => {
  it('identifiant ClanMember positif seulement', () => {
    expect(playerShortUrl(SITE, 42)).toBe('https://chickendinner.fr/j/42')
    expect(playerShortUrl(SITE, 0)).toBeNull()
    expect(playerShortUrl(SITE, null)).toBeNull()
    expect(playerShortUrl(SITE, undefined)).toBeNull()
    expect(playerShortUrl({ siteUrl: '' }, 42)).toBeNull()
  })
})

describe('embed-lines', () => {
  it('boldName : lien masqué, crochets du libellé échappés', () => {
    expect(boldName('Alpha', null)).toBe('**Alpha**')
    expect(boldName('Alpha', 'https://x.fr/j/1')).toBe('[**Alpha**](https://x.fr/j/1)')
    expect(boldName('[TAG]Alpha', 'https://x.fr/j/1')).toBe('[**\\[TAG\\]Alpha**](https://x.fr/j/1)')
  })

  it('joinLinkedLines : garde les liens tant que tout tient', () => {
    const lines = [
      { linked: '[**A**](https://x.fr/j/1)', plain: '**A**' },
      { linked: '[**B**](https://x.fr/j/2)', plain: '**B**' },
    ]
    expect(joinLinkedLines(lines, 1024)).toBe('[**A**](https://x.fr/j/1)\n[**B**](https://x.fr/j/2)')
    // 26 + 1 + 5 caractères : le second nom perd son lien, le premier le garde.
    expect(joinLinkedLines(lines, 32)).toBe('[**A**](https://x.fr/j/1)\n**B**')
  })
})
