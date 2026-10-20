import { describe, expect, it } from 'vitest'

import { auditRawHtml, sitemapUrls } from '@/lib/seo/raw-html-audit'

/** Audit du HTML brut (docs/TODO/geo-seo-propositions.md §7). */

const PAGE = `<!DOCTYPE html><html lang="fr"><head>
<title>Ligue des clans PUBG &amp; Power score · chickendinner.fr</title>
<meta name="description" content="Le classement des clans">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://chickendinner.fr/clans-leaderboard">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},{"@type":"ItemList"}]}</script>
</head><body>
<header><nav>Menu</nav></header>
<main><h1>Ligue des clans</h1><h2>Podium <span>de la semaine</span></h2>
<p>Trente-trois clans suivis, 510 joueurs.</p>
<img src="/a.jpg" alt="Podium"><img src="/deco.svg" alt=""><img src="/oubli.png">
<script>window.__DATA__ = "ne compte pas comme des mots visibles"</script>
</main></body></html>`

describe('auditRawHtml', () => {
  it('relève titre, description, robots, canonique, titres, mots visibles, images sans alt, <main> et JSON-LD', () => {
    expect(auditRawHtml(PAGE)).toEqual({
      title: 'Ligue des clans PUBG & Power score · chickendinner.fr',
      description: 'Le classement des clans',
      robots: 'index, follow',
      canonical: 'https://chickendinner.fr/clans-leaderboard',
      h1: ['Ligue des clans'],
      h2: ['Podium de la semaine'],
      // Menu + Ligue des clans + Podium de la semaine + Trente-trois clans suivis, 510 joueurs.
      words: 13,
      // `alt=""` est une image décorative, pas une erreur.
      imagesWithoutAlt: 1,
      hasMain: true,
      jsonLdTypes: ['BreadcrumbList', 'ItemList'],
    })
  })

  it('page rendue par le seul JavaScript : aucun titre, presque aucun mot', () => {
    const report = auditRawHtml('<html><head><title>x</title></head><body><div id="root"></div><script>render()</script></body></html>')
    expect(report).toMatchObject({ h1: [], words: 0, hasMain: false, jsonLdTypes: [] })
  })
})

describe('sitemapUrls', () => {
  it('lit chaque <loc>', () => {
    expect(
      sitemapUrls('<urlset><url><loc>https://chickendinner.fr/</loc></url><url><loc> https://chickendinner.fr/clans?a=1&amp;b=2 </loc></url></urlset>')
    ).toEqual(['https://chickendinner.fr/', 'https://chickendinner.fr/clans?a=1&b=2'])
  })
})
