import { describe, expect, it } from 'vitest'

import { pageSeo, STATIC_PAGES } from './page-seo'
import { breadcrumbTrail, itemListJsonLd, pageJsonLd, sportsEventJsonLd, STATIC_CRUMBS, toJsonLd } from './structured-data'

const BASE = new URL('https://chickendinner.fr')
const CLAN = { id: 7, name: 'D32', tag: 'SMK', indexable: true }
const TOURNAMENT = { id: 'ckt1', title: 'Coupe FR', indexable: true }

type Graph = { '@graph': Array<Record<string, unknown>> }
const parse = (json: string | null) => JSON.parse(json ?? 'null') as Graph | null
const typesOf = (json: string | null) => parse(json)?.['@graph'].map((node) => node['@type']) ?? []

describe('breadcrumbTrail', () => {
  it('page fixe, sous-page et accueil', () => {
    expect(breadcrumbTrail('/clans-leaderboard')).toEqual([
      { name: 'Accueil', path: '/' },
      { name: 'Ligue des clans', path: '/clans-leaderboard' },
    ])
    expect(breadcrumbTrail('/mortier/guide/').map((crumb) => crumb.name)).toEqual(['Accueil', 'Mortier', 'Guide'])
    expect(breadcrumbTrail('/clans/comparator').map((crumb) => crumb.path)).toEqual(['/', '/clans', '/clans/comparator'])
    expect(breadcrumbTrail('/')).toEqual([])
  })

  it('pages d’un clan : l’annuaire, le clan, puis la page', () => {
    expect(breadcrumbTrail('/clans/7/stats/weapons', { clan: CLAN })).toEqual([
      { name: 'Accueil', path: '/' },
      { name: 'Les clans', path: '/clans' },
      { name: 'D32 [SMK]', path: '/clans/7/overview' },
      { name: 'Armurerie', path: '/clans/7/stats/weapons' },
    ])
    expect(breadcrumbTrail('/clans/7/overview', { clan: CLAN }).map((crumb) => crumb.name)).toEqual(['Accueil', 'Les clans', 'D32 [SMK]'])
    expect(breadcrumbTrail('/clans/7/settings', { clan: CLAN })).toEqual([])
  })

  it('page d’un tournoi', () => {
    expect(breadcrumbTrail('/tournaments/ckt1', { tournament: TOURNAMENT }).map((crumb) => crumb.name)).toEqual(['Accueil', 'Tournois', 'Coupe FR'])
  })

  it('chaque page fixe indexée a un nom court', () => {
    const indexed = Object.entries(STATIC_PAGES).filter(([, page]) => page.index).map(([path]) => path)
    expect(indexed.filter((path) => !STATIC_CRUMBS[path])).toEqual([])
  })
})

describe('pageJsonLd', () => {
  it('fil d’Ariane avec des adresses absolues', () => {
    const graph = parse(pageJsonLd('/clans-leaderboard', pageSeo('/clans-leaderboard'), {}, BASE))!['@graph']
    expect(graph).toEqual([
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://chickendinner.fr/' },
          { '@type': 'ListItem', position: 2, name: 'Ligue des clans', item: 'https://chickendinner.fr/clans-leaderboard' },
        ],
      },
    ])
  })

  it('les trois outils sont des applications web gratuites', () => {
    for (const path of ['/mortier', '/carte-des-ressources', '/lecture-de-zone']) {
      const app = parse(pageJsonLd(path, pageSeo(path), {}, BASE))!['@graph'].find((node) => node['@type'] === 'WebApplication')
      expect(app, path).toMatchObject({ applicationCategory: 'GameApplication', isAccessibleForFree: true, url: `https://chickendinner.fr${path}` })
    }
  })

  it('la vue d’ensemble d’un clan est une équipe, sans aucun joueur', () => {
    const json = pageJsonLd('/clans/7/overview', pageSeo('/clans/7/overview', { clan: CLAN }), { clan: CLAN }, BASE)
    expect(typesOf(json)).toEqual(['BreadcrumbList', 'SportsTeam'])
    expect(parse(json)!['@graph'][1]).toEqual({
      '@type': 'SportsTeam',
      name: 'D32',
      alternateName: 'SMK',
      sport: 'PUBG: BATTLEGROUNDS',
      url: 'https://chickendinner.fr/clans/7/overview',
    })
    expect(json).not.toContain('athlete')
  })

  it('À propos décrit l’éditeur ; la méthodologie est un article daté, signé d’Arkium', () => {
    const about = parse(pageJsonLd('/a-propos', pageSeo('/a-propos'), {}, BASE))!['@graph']
    expect(about.find((node) => node['@type'] === 'AboutPage')).toMatchObject({
      url: 'https://chickendinner.fr/a-propos',
      about: { '@type': 'Organization', name: 'Arkium', contactPoint: { email: 'contact@chickendinner.fr' } },
    })

    const methodology = parse(pageJsonLd('/a-propos/methodologie', pageSeo('/a-propos/methodologie'), {}, BASE))!['@graph']
    expect(methodology.map((node) => node['@type'])).toEqual(['BreadcrumbList', 'Article'])
    expect(methodology[0].itemListElement.map((item: { name: string }) => item.name)).toEqual(['Accueil', 'À propos', 'Méthodologie'])
    expect(methodology[1]).toMatchObject({ dateModified: '2026-10-27', author: { name: 'Arkium' }, publisher: { name: 'Arkium' } })
  })

  it('rien pour l’accueil (il a les siennes) ni pour une page hors index', () => {
    expect(pageJsonLd('/', pageSeo('/'), {}, BASE)).toBeNull()
    expect(pageJsonLd('/members/3/dashboard', pageSeo('/members/3/dashboard'), {}, BASE)).toBeNull()
    expect(pageJsonLd('/clans/7/overview', pageSeo('/clans/7/overview', { clan: { ...CLAN, indexable: false } }), { clan: CLAN }, BASE)).toBeNull()
  })
})

describe('blocs « En bref »', () => {
  it('liste ordonnée de pages', () => {
    expect(itemListJsonLd(BASE, 'Clans', [{ name: 'D32 [SMK]', path: '/clans/7/overview' }])).toEqual({
      '@type': 'ItemList',
      name: 'Clans',
      numberOfItems: 1,
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'D32 [SMK]', url: 'https://chickendinner.fr/clans/7/overview' }],
    })
  })

  it('tournoi : compétition en ligne, organisée par un clan, participants nommés', () => {
    const event = sportsEventJsonLd(BASE, {
      id: 'ckt1',
      title: 'Coupe FR',
      description: 'Terminé. Vainqueur : [FUN] FunsNRoses.',
      startDate: '2026-10-10T19:00:00.000Z',
      endDate: '2026-10-10T22:00:00.000Z',
      organizer: { id: 7, label: '[FR] FR-Alliance-BE' },
      competitors: ['[FUN] FunsNRoses'],
    })
    expect(event).toMatchObject({
      '@type': 'SportsEvent',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: { '@type': 'VirtualLocation', url: 'https://chickendinner.fr/tournaments/ckt1' },
      organizer: { '@type': 'SportsTeam', name: '[FR] FR-Alliance-BE', url: 'https://chickendinner.fr/clans/7/overview' },
      competitor: [{ '@type': 'SportsTeam', name: '[FUN] FunsNRoses' }],
      sport: 'PUBG: BATTLEGROUNDS',
    })
  })

  it('aucune balise possible dans le script', () => {
    const json = toJsonLd(itemListJsonLd(BASE, '</script><script>alert(1)</script>', []))
    expect(json).not.toContain('<')
    expect(JSON.parse(json).name).toBe('</script><script>alert(1)</script>')
  })
})
