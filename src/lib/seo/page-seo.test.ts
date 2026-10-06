import { describe, expect, it } from 'vitest'

import {
  buildPageMetadata,
  CLAN_PAGES,
  DEFAULT_TITLE,
  homeJsonLd,
  pageSeo,
  robotsRules,
  seoLookupFor,
  siteUrl,
  sitemapEntries,
  STATIC_PAGES,
} from './page-seo'

const CLAN = { id: 7, name: 'D32', tag: 'SMK', indexable: true }

describe('pageSeo', () => {
  it('donne aux pages publiques leur titre et les indexe', () => {
    expect(pageSeo('/clans-leaderboard')).toMatchObject({ title: 'Ligue des clans PUBG — classement Power score', index: true })
    expect(pageSeo('/mortier/')).toMatchObject({ title: 'Entraînement au mortier PUBG', index: true })
    expect(pageSeo('/mentions-legales')).toMatchObject({ title: 'Mentions légales et CGU', index: true })
  })

  it('n’indexe jamais les pages joueur, le compte ni l’administration', () => {
    for (const path of ['/members/12/dashboard', '/members/12/nemesis', '/members', '/members/add', '/account', '/settings/cron', '/login', '/clans/mutations']) {
      expect(pageSeo(path).index, path).toBe(false)
    }
    expect(pageSeo('/members/12/dashboard').title).toBe('Profil joueur')
  })

  it('titre chaque page du menu d’un clan avec le nom du clan, et l’indexe s’il est suivi', () => {
    expect(pageSeo('/clans/7/overview', { clan: CLAN })).toMatchObject({ title: 'D32 [SMK] — clan PUBG', index: true })
    expect(pageSeo('/clans/7/leaderboard', { clan: CLAN })).toMatchObject({ title: 'D32 [SMK] — Classement', index: true })
    expect(pageSeo('/clans/7/stats/weapons', { clan: CLAN }).description).toContain('D32 [SMK]')
    expect(pageSeo('/clans/7/leaderboard', { clan: { ...CLAN, indexable: false } }).index).toBe(false)
  })

  it('garde hors index les écrans techniques d’un clan et un clan introuvable', () => {
    for (const path of ['/clans/7/settings/discord', '/clans/7/telemetry/dashboard', '/clans/7/members/pending', '/clans/7/matches/abc/telemetry']) {
      expect(pageSeo(path, { clan: CLAN }), path).toMatchObject({ title: 'D32 [SMK]', index: false })
    }
    expect(pageSeo('/clans/999/overview', { clan: null }).index).toBe(false)
  })

  it('indexe la page d’un tournoi lancé, pas ses manches ni un brouillon', () => {
    const tournament = { id: 'ckt1', title: 'Coupe FR', indexable: true }
    expect(pageSeo('/tournaments/ckt1', { tournament })).toMatchObject({ title: 'Coupe FR — tournoi PUBG', index: true })
    expect(pageSeo('/tournaments/ckt1/matches/3', { tournament }).index).toBe(false)
    expect(pageSeo('/tournaments/ckt1', { tournament: { ...tournament, indexable: false } }).index).toBe(false)
  })

  it('indexe l’accueil, mais pas une adresse non déclarée (page oubliée ou 404)', () => {
    expect(pageSeo('/')).toMatchObject({ title: null, index: true })
    expect(pageSeo('/une-page-inconnue')).toMatchObject({ title: null, index: false })
  })
})

describe('seoLookupFor', () => {
  it('dit quoi charger en base', () => {
    expect(seoLookupFor('/clans/7/stats')).toEqual({ clanId: 7 })
    expect(seoLookupFor('/tournaments/ckt1/matches/2')).toEqual({ tournamentId: 'ckt1' })
    expect(seoLookupFor('/clans/comparator')).toBeNull()
    expect(seoLookupFor('/mortier')).toBeNull()
  })
})

describe('buildPageMetadata', () => {
  it('suffixe le titre, pose la canonique sans requête et les aperçus de partage', () => {
    const metadata = buildPageMetadata('/clans/7/leaderboard', pageSeo('/clans/7/leaderboard', { clan: CLAN }), {})
    expect(metadata.title).toEqual({ absolute: 'D32 [SMK] — Classement · chickendinner.fr' })
    expect(metadata.alternates).toEqual({ canonical: '/clans/7/leaderboard' })
    expect(metadata.robots).toEqual({ index: true, follow: true })
    expect(metadata.metadataBase?.toString()).toBe('https://chickendinner.fr/')
    expect(metadata.openGraph).toMatchObject({ locale: 'fr_FR', siteName: 'chickendinner.fr', url: '/clans/7/leaderboard' })
    expect(metadata.verification).toBeUndefined()
  })

  it('n’a pas de canonique sur une page hors index, mais laisse suivre ses liens', () => {
    const metadata = buildPageMetadata('/members/3/dashboard', pageSeo('/members/3/dashboard'), {})
    expect(metadata.alternates).toBeUndefined()
    expect(metadata.robots).toEqual({ index: false, follow: true })
  })

  it('prend le titre par défaut, l’adresse publique et le code Search Console de l’environnement', () => {
    const metadata = buildPageMetadata('/', pageSeo('/'), {
      NEXT_PUBLIC_APP_URL: 'https://preprod.chickendinner.fr',
      GOOGLE_SITE_VERIFICATION: ' abc123 ',
    })
    expect(metadata.title).toEqual({ absolute: DEFAULT_TITLE })
    expect(metadata.metadataBase?.toString()).toBe('https://preprod.chickendinner.fr/')
    expect(metadata.verification).toEqual({ google: 'abc123' })
  })
})

describe('siteUrl', () => {
  it('retombe sur chickendinner.fr sans adresse ou avec une adresse invalide', () => {
    expect(siteUrl({}).toString()).toBe('https://chickendinner.fr/')
    expect(siteUrl({ NEXT_PUBLIC_APP_URL: 'pas une url' }).toString()).toBe('https://chickendinner.fr/')
  })
})

describe('sitemapEntries', () => {
  const base = new URL('https://chickendinner.fr')
  const entries = sitemapEntries(
    base,
    [{ id: 7, lastMatchAt: new Date('2026-10-04T21:00:00Z') }, { id: 9, lastMatchAt: null }],
    [{ id: 'ckt1', updatedAt: new Date('2026-10-01T10:00:00Z') }]
  )
  const urls = entries.map((entry) => entry.url)

  it('liste l’accueil, les pages publiques et les pages légales, sans les pages hors index ni le formulaire', () => {
    expect(urls[0]).toBe('https://chickendinner.fr/')
    for (const path of ['/clans', '/clans-leaderboard', '/clans/comparator', '/tournaments', '/mortier', '/carte-des-ressources', '/lecture-de-zone', '/join', '/mentions-legales', '/confidentialite', '/a-propos']) {
      expect(urls, path).toContain(`https://chickendinner.fr${path}`)
    }
    for (const path of ['/login', '/account', '/members', '/clans/mutations', '/confidentialite/demande']) {
      expect(urls, path).not.toContain(`https://chickendinner.fr${path}`)
    }
  })

  it('met les pages du menu de chaque clan suivi, datées de sa dernière partie', () => {
    expect(urls.filter((url) => url.startsWith('https://chickendinner.fr/clans/7/'))).toHaveLength(CLAN_PAGES.length)
    expect(entries.find((entry) => entry.url === 'https://chickendinner.fr/clans/7/overview')).toMatchObject({
      lastModified: new Date('2026-10-04T21:00:00Z'),
      priority: 0.7,
    })
    expect(entries.find((entry) => entry.url === 'https://chickendinner.fr/clans/9/leaderboard')?.lastModified).toBeUndefined()
    expect(urls).toContain('https://chickendinner.fr/tournaments/ckt1')
  })

  it('n’a aucune adresse en double', () => {
    expect(new Set(urls).size).toBe(urls.length)
  })
})

describe('robotsRules', () => {
  it('écarte l’API et les écrans privés, et annonce le sitemap', () => {
    const robots = robotsRules(new URL('https://chickendinner.fr'))
    expect(robots.sitemap).toBe('https://chickendinner.fr/sitemap.xml')
    expect(robots.rules).toMatchObject({ userAgent: '*', allow: '/' })
    expect((robots.rules as { disallow: string[] }).disallow).toEqual(expect.arrayContaining(['/api/', '/account', '/settings']))
    // Les pages joueur restent accessibles au robot, pour qu'il y lise le noindex.
    expect((robots.rules as { disallow: string[] }).disallow).not.toContain('/members')
  })
})

describe('homeJsonLd', () => {
  it('décrit le site et son éditeur, sans balise HTML possible dans le script', () => {
    const json = homeJsonLd(new URL('https://chickendinner.fr'))
    expect(json).not.toContain('<')
    const data = JSON.parse(json)
    expect(data['@graph'][0]).toMatchObject({ '@type': 'WebSite', name: 'chickendinner.fr', url: 'https://chickendinner.fr/', inLanguage: 'fr-FR' })
    expect(data['@graph'][1]).toMatchObject({ '@type': 'Organization', name: 'Arkium', url: 'https://arkium.eu' })
  })
})

describe('STATIC_PAGES', () => {
  it('a un titre et une description pour chaque page indexée', () => {
    for (const [path, page] of Object.entries(STATIC_PAGES).filter(([, entry]) => entry.index)) {
      expect(page.title.length, path).toBeGreaterThan(3)
      expect(page.description.length, path).toBeGreaterThan(60)
      expect(page.description.length, path).toBeLessThanOrEqual(170)
    }
  })
})
