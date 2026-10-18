import { describe, expect, it } from 'vitest'

import nextConfig from '../../../next.config'
import {
  AI_TRAINING_BOTS,
  buildPageMetadata,
  CLAN_PAGES,
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
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
    expect(pageSeo('/clans-leaderboard')).toMatchObject({ title: 'Ligue des clans PUBG — Power score', index: true })
    expect(pageSeo('/mortier/')).toMatchObject({ title: 'Entraînement au mortier PUBG', index: true })
    expect(pageSeo('/mortier/guide')).toMatchObject({ title: 'Guide du mortier PUBG à la grille', index: true })
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
    for (const path of ['/clans', '/clans-leaderboard', '/clans/comparator', '/tournaments', '/mortier', '/mortier/guide', '/carte-des-ressources', '/lecture-de-zone', '/join', '/mentions-legales', '/confidentialite', '/a-propos']) {
      expect(urls, path).toContain(`https://chickendinner.fr${path}`)
    }
    for (const path of ['/login', '/account', '/members', '/clans/mutations', '/confidentialite/demande']) {
      expect(urls, path).not.toContain(`https://chickendinner.fr${path}`)
    }
  })

  it('n’annonce que la vue d’ensemble de chaque clan suivi, datée de sa dernière partie', () => {
    expect(urls.filter((url) => url.startsWith('https://chickendinner.fr/clans/7/'))).toEqual(['https://chickendinner.fr/clans/7/overview'])
    expect(entries.find((entry) => entry.url === 'https://chickendinner.fr/clans/7/overview')).toMatchObject({
      lastModified: new Date('2026-10-04T21:00:00Z'),
      priority: 0.7,
    })
    expect(entries.find((entry) => entry.url === 'https://chickendinner.fr/clans/9/overview')?.lastModified).toBeUndefined()
    expect(urls).toContain('https://chickendinner.fr/tournaments/ckt1')
  })

  it('garde indexables les pages de clan absentes du sitemap', () => {
    expect(urls).not.toContain('https://chickendinner.fr/clans/7/leaderboard')
    for (const page of CLAN_PAGES) {
      expect(pageSeo(`/clans/7${page.path}`, { clan: CLAN }).index, page.path).toBe(true)
    }
  })

  it('n’a aucune adresse en double', () => {
    expect(new Set(urls).size).toBe(urls.length)
  })
})

describe('robotsRules', () => {
  type Group = { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] }
  const robots = robotsRules(new URL('https://chickendinner.fr'))
  const groups = robots.rules as Group[]
  const list = (value: string | string[] | undefined) => (value === undefined ? [] : Array.isArray(value) ? value : [value])
  const general = groups.find((group) => group.userAgent === '*')!
  const blockedForAll = (path: string) => list(general.disallow).some((prefix) => path.startsWith(prefix))

  it('écarte les écrans privés et l’API interne, et annonce le sitemap', () => {
    expect(robots.sitemap).toBe('https://chickendinner.fr/sitemap.xml')
    expect(general.allow).toBe('/')
    for (const path of ['/account', '/settings/cron', '/login', '/api/internal/clan-subdomains', '/api/cron/opponent-stats']) {
      expect(blockedForAll(path), path).toBe(true)
    }
    // Les pages joueur restent accessibles au robot, pour qu'il y lise le noindex.
    expect(blockedForAll('/members/12/dashboard')).toBe(false)
  })

  it('laisse le rendu de Google appeler l’API des pages publiques (sinon le shell redirige vers /login)', () => {
    const shellAndPageApis = [
      '/api/auth/mode',
      '/api/auth/session',
      '/api/setup/status',
      '/api/settings/nav-permissions',
      '/api/settings/login-welcome',
      '/api/clans',
      '/api/clans/directory',
      '/api/clans-leaderboard?period=week',
      '/api/tournaments',
      '/api/zone-reading?mode=squad',
      '/api/home/showcase',
    ]
    expect(shellAndPageApis.filter(blockedForAll)).toEqual([])
  })

  it('refuse les robots d’entraînement, laisse les robots de recherche et de réponse à la règle générale', () => {
    const training = groups.find((group) => group !== general)!
    expect(list(training.userAgent)).toEqual(AI_TRAINING_BOTS)
    expect(training.disallow).toBe('/')
    const named = groups.flatMap((group) => list(group.userAgent)).map((agent) => agent.toLowerCase())
    for (const searchBot of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot']) {
      expect(named, searchBot).not.toContain(searchBot.toLowerCase())
    }
  })
})

describe('next.config.ts — en-têtes', () => {
  it('marque toutes les réponses de l’API noindex, et aucune page', async () => {
    const rules = await nextConfig.headers!()
    const noindex = rules.filter((rule) => rule.headers.some((header) => header.key === 'X-Robots-Tag'))
    expect(noindex).toEqual([{ source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] }])
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
  it('a un titre et une description pour chaque page indexée, aux longueurs que Google affiche sans couper', () => {
    for (const [path, page] of Object.entries(STATIC_PAGES).filter(([, entry]) => entry.index)) {
      expect(page.title.length, path).toBeGreaterThan(3)
      expect(`${page.title} · chickendinner.fr`.length, `${path} : titre complet`).toBeLessThanOrEqual(MAX_TITLE_LENGTH)
      expect(page.description.length, path).toBeGreaterThan(60)
      expect(page.description.length, path).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH)
    }
    expect(DEFAULT_TITLE.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH)
    expect(DEFAULT_DESCRIPTION.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH)
  })

  it('titre d’une page de clan au nom long : sans le suffixe, plutôt que coupé', () => {
    const clan = { id: 9, name: 'Les Grands Anciens Du Plateau', tag: 'GADP', indexable: true }
    const metadata = buildPageMetadata('/clans/9/stats/positions', pageSeo('/clans/9/stats/positions', { clan }), {})
    expect(metadata.title).toEqual({ absolute: 'Les Grands Anciens Du Plateau [GADP] — Cartographie tactique' })
  })
})
