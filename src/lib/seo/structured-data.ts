import { METHODOLOGY_PATH, METHODOLOGY_UPDATED_AT } from '@/lib/legal/legal-info'
import {
  CLAN_PAGES,
  PUBLISHER_ORGANIZATION,
  SHARE_IMAGE,
  SITE_NAME,
  STATIC_PAGES,
  type ClanRef,
  type PageSeo,
  type TournamentRef,
} from '@/lib/seo/page-seo'

/**
 * Données structurées schema.org (docs/features/seo.md §6 ; docs/TODO/geo-seo-propositions.md, lot 3). Règle de
 * Google : ne décrire que ce que la page montre. D'où deux sources :
 *
 * - `pageJsonLd` (layout racine) : ce que donne le chemin de la page — fil d'Ariane, outils (`WebApplication`), clan
 *   (`SportsTeam`) ;
 * - les blocs « En bref » rendus par le serveur, qui ont les données : `ItemList` des clans et du podium de la Ligue,
 *   `SportsEvent` d'un tournoi.
 *
 * Jamais de pseudo de joueur (pages joueur hors index, seo.md §2). Module pur.
 */

/** L'éditeur, Arkium (décision du 2026-10-18) : une seule définition, celle de l'accueil (`homeJsonLd`). */
export const PUBLISHER = PUBLISHER_ORGANIZATION
export const PUBG_SPORT = 'PUBG: BATTLEGROUNDS'

type JsonLdNode = Record<string, unknown>

/** Chaîne prête pour un `<script type="application/ld+json">` : `<` échappé, aucune balise possible. */
export function toJsonLd(nodes: JsonLdNode | JsonLdNode[]): string {
  const data = Array.isArray(nodes) ? { '@context': 'https://schema.org', '@graph': nodes } : { '@context': 'https://schema.org', ...nodes }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

const absolute = (base: URL, path: string) => new URL(path, base).toString()

// --- Fil d'Ariane -----------------------------------------------------------------------------------------------------

export type Crumb = { name: string; path: string }

const HOME_CRUMB: Crumb = { name: 'Accueil', path: '/' }
const CLANS_CRUMB: Crumb = { name: 'Les clans', path: '/clans' }
const TOURNAMENTS_CRUMB: Crumb = { name: 'Tournois', path: '/tournaments' }

/** Nom court de chaque page fixe dans le fil d'Ariane, et sa page parente quand elle en a une. */
export const STATIC_CRUMBS: Record<string, { name: string; parent?: string }> = {
  '/clans': { name: 'Les clans' },
  '/clans-leaderboard': { name: 'Ligue des clans' },
  '/clans/comparator': { name: 'Comparateur', parent: '/clans' },
  '/tournaments': { name: 'Tournois' },
  '/mortier': { name: 'Mortier' },
  '/mortier/guide': { name: 'Guide', parent: '/mortier' },
  '/carte-des-ressources': { name: 'Carte des ressources' },
  '/lecture-de-zone': { name: 'Lecture de zone' },
  '/join': { name: 'Inscription' },
  '/mentions-legales': { name: 'Mentions légales' },
  '/confidentialite': { name: 'Confidentialité' },
  '/confidentialite/demande': { name: 'Retirer mes données', parent: '/confidentialite' },
  '/a-propos': { name: 'À propos' },
  '/a-propos/methodologie': { name: 'Méthodologie', parent: '/a-propos' },
}

const CLAN_PATH = /^\/clans\/(\d+)(\/.*)?$/
const TOURNAMENT_PATH = /^\/tournaments\/([^/]+)$/

/** Fil d'Ariane d'une page indexée, accueil compris ; `[]` si la page n'en a pas. */
export function breadcrumbTrail(pathname: string, refs: { clan?: ClanRef | null; tournament?: TournamentRef | null } = {}): Crumb[] {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/') return []

  const known = STATIC_CRUMBS[path]
  if (known) {
    const trail: Crumb[] = [{ name: known.name, path }]
    let parent = known.parent
    while (parent) {
      const entry = STATIC_CRUMBS[parent]
      if (!entry) break
      trail.unshift({ name: entry.name, path: parent })
      parent = entry.parent
    }
    return [HOME_CRUMB, ...trail]
  }

  const clanMatch = CLAN_PATH.exec(path)
  if (clanMatch && refs.clan) {
    const clanCrumb = { name: `${refs.clan.name} [${refs.clan.tag}]`, path: `/clans/${refs.clan.id}/overview` }
    const page = CLAN_PAGES.find((entry) => entry.path === (clanMatch[2] ?? ''))
    if (!page) return []
    return page.path === '/overview' ? [HOME_CRUMB, CLANS_CRUMB, clanCrumb] : [HOME_CRUMB, CLANS_CRUMB, clanCrumb, { name: page.label, path }]
  }

  if (TOURNAMENT_PATH.test(path) && refs.tournament) {
    return [HOME_CRUMB, TOURNAMENTS_CRUMB, { name: refs.tournament.title, path }]
  }
  return []
}

export function breadcrumbJsonLd(base: URL, trail: Crumb[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: absolute(base, crumb.path) })),
  }
}

// --- Données de la page, d'après son chemin (layout racine) -------------------------------------------------------------

/** Outils du site : une application web gratuite chacun. */
const WEB_APPLICATIONS = ['/mortier', '/carte-des-ressources', '/lecture-de-zone']

/**
 * Données structurées que le chemin suffit à établir. `null` pour l'accueil (il a les siennes, `homeJsonLd`) et pour
 * toute page hors index.
 */
export function pageJsonLd(
  pathname: string,
  seo: PageSeo,
  refs: { clan?: ClanRef | null; tournament?: TournamentRef | null },
  base: URL
): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (!seo.index || path === '/') return null

  const nodes: JsonLdNode[] = []
  const trail = breadcrumbTrail(path, refs)
  if (trail.length > 1) nodes.push(breadcrumbJsonLd(base, trail))

  if (WEB_APPLICATIONS.includes(path)) {
    const page = STATIC_PAGES[path]
    nodes.push({
      '@type': 'WebApplication',
      name: page.title,
      description: page.description,
      url: absolute(base, path),
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
      inLanguage: 'fr-FR',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      publisher: PUBLISHER,
    })
  }

  // À propos : la page décrit l'éditeur (lot 4.1).
  if (path === '/a-propos') {
    nodes.push({ '@type': 'AboutPage', name: STATIC_PAGES[path].title, url: absolute(base, path), inLanguage: 'fr-FR', about: PUBLISHER })
  }

  // Méthodologie : un article daté, signé de l'éditeur (lot 3, décision §8).
  if (path === METHODOLOGY_PATH) {
    nodes.push({
      '@type': 'Article',
      headline: STATIC_PAGES[path].title,
      description: STATIC_PAGES[path].description,
      url: absolute(base, path),
      inLanguage: 'fr-FR',
      dateModified: METHODOLOGY_UPDATED_AT,
      author: PUBLISHER,
      publisher: PUBLISHER,
    })
  }

  const clanMatch = CLAN_PATH.exec(path)
  if (clanMatch && clanMatch[2] === '/overview' && refs.clan) {
    nodes.push({
      '@type': 'SportsTeam',
      name: refs.clan.name,
      alternateName: refs.clan.tag,
      sport: PUBG_SPORT,
      url: absolute(base, path),
    })
  }

  return nodes.length > 0 ? toJsonLd(nodes) : null
}

// --- Données des blocs « En bref » ------------------------------------------------------------------------------------

/** Liste ordonnée de pages (clans de l'annuaire, podium de la Ligue). */
export function itemListJsonLd(base: URL, name: string, items: Array<{ name: string; path: string }>): JsonLdNode {
  return {
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, url: absolute(base, item.path) })),
  }
}

export type SportsEventInput = {
  id: string
  title: string
  description: string
  startDate: string
  endDate: string
  organizer: { id: number; label: string } | null
  /** Clans participants, en inter-clans seulement (ailleurs, ce seraient des pseudos). */
  competitors: string[]
}

/** Un tournoi : une compétition en ligne, organisée par un clan. */
export function sportsEventJsonLd(base: URL, event: SportsEventInput): JsonLdNode {
  const url = absolute(base, `/tournaments/${encodeURIComponent(event.id)}`)
  return {
    '@type': 'SportsEvent',
    name: event.title,
    description: event.description,
    startDate: event.startDate,
    endDate: event.endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url },
    image: [absolute(base, SHARE_IMAGE.url)],
    sport: PUBG_SPORT,
    url,
    isAccessibleForFree: true,
    ...(event.organizer
      ? { organizer: { '@type': 'SportsTeam', name: event.organizer.label, url: absolute(base, `/clans/${event.organizer.id}/overview`) } }
      : { organizer: { '@type': 'Organization', name: SITE_NAME, url: absolute(base, '/') } }),
    ...(event.competitors.length > 0 ? { competitor: event.competitors.map((name) => ({ '@type': 'SportsTeam', name })) } : {}),
  }
}
