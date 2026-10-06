import type { Metadata, MetadataRoute } from 'next'

/**
 * Référencement (docs/features/seo.md) : titre, description, indexation et adresse canonique de chaque page, calculés à
 * un seul endroit à partir du chemin demandé, plus le contenu du sitemap. Module pur — le proxy (edge) en importe
 * `PATHNAME_HEADER`, le layout racine et `app/sitemap.ts` le reste.
 *
 * Indexés : les pages publiques du menu, une page par entrée du menu de chaque clan suivi, les tournois lancés et les
 * pages légales. Jamais : les pages joueur (`/members/…`, pseudos — décision du 2026-10-05), le compte,
 * l'administration et les écrans techniques des clans.
 */

/** En-tête posé par le proxy : le layout racine n'a pas d'autre moyen de connaître le chemin de la page. */
export const PATHNAME_HEADER = 'x-pathname'

export const SITE_NAME = 'chickendinner.fr'
export const DEFAULT_TITLE = 'chickendinner.fr — stats, classements et Top 1 des clans PUBG'
export const DEFAULT_DESCRIPTION =
  'Le QG des clans PUBG francophones : chaque partie importée, chaque kill compté, chaque Top 1 fêté. Classement des ' +
  'clans, comparateur, tournois, débriefs de parties, entraînement au mortier et carte des ressources.'

// Image de partage (ratio ≈ 1,91:1 des aperçus Discord, Facebook, X).
export const SHARE_IMAGE = {
  url: '/chickendinnerfr.jpg',
  width: 1024,
  height: 541,
  alt: 'Une escouade PUBG face au nom chickendinner.fr sculpté dans la roche du désert',
}

/** Adresse publique du site : `NEXT_PUBLIC_APP_URL` (liens Discord et e-mails), sinon https://chickendinner.fr. */
export function siteUrl(env: Record<string, string | undefined> = process.env) {
  try {
    return new URL(env.NEXT_PUBLIC_APP_URL?.trim() || `https://${SITE_NAME}`)
  } catch {
    return new URL(`https://${SITE_NAME}`)
  }
}

type SitemapHint = { priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }
type StaticPage = { title: string; description: string; index: boolean; sitemap?: SitemapHint }

const LEGAL_SITEMAP: SitemapHint = { priority: 0.3, changeFrequency: 'monthly' }

/** Pages à adresse fixe. Absentes d'ici (hors pages de clan et de tournoi) : hors index, titre par défaut. */
export const STATIC_PAGES: Record<string, StaticPage> = {
  '/clans': {
    title: 'Annuaire des clans PUBG francophones',
    description:
      'Tous les clans PUBG suivis sur chickendinner.fr : joueurs, parties, kills, clans en feu cette semaine et style de jeu (Fragger, Medic, Ghost).',
    index: true,
    sitemap: { priority: 0.8, changeFrequency: 'daily' },
  },
  '/clans-leaderboard': {
    title: 'Ligue des clans PUBG — classement Power score',
    description:
      'Le classement des clans PUBG francophones au Power score (placement, dégâts, kills, knocks), sur la semaine, le mois ou depuis le début, par type de partie.',
    index: true,
    sitemap: { priority: 0.9, changeFrequency: 'daily' },
  },
  '/clans/comparator': {
    title: 'Comparateur de clans PUBG',
    description:
      'Mets plusieurs clans PUBG face à face : win rate, top 10, dégâts et kills par partie, duels directs, hot drops et survie.',
    index: true,
    sitemap: { priority: 0.7, changeFrequency: 'weekly' },
  },
  '/tournaments': {
    title: 'Tournois PUBG — classements et manches',
    description:
      'Les tournois PUBG des clans francophones : parties personnalisées importées automatiquement, classement par manche et MVP, sans inscription.',
    index: true,
    sitemap: { priority: 0.8, changeFrequency: 'daily' },
  },
  '/mortier': {
    title: 'Entraînement au mortier PUBG',
    description:
      'Apprends à régler le mortier de PUBG à la grille de la carte : 10 cibles par série, trois difficultés, dénivelé, classement des artilleurs et guide.',
    index: true,
    sitemap: { priority: 0.7, changeFrequency: 'weekly' },
  },
  '/carte-des-ressources': {
    title: 'Carte des ressources PUBG — véhicules, essence, garages',
    description:
      'Où trouver un véhicule sur chaque carte PUBG : emplacements observés dans les vraies parties, stations-service, garages, pontons et salles secrètes.',
    index: true,
    sitemap: { priority: 0.7, changeFrequency: 'weekly' },
  },
  '/lecture-de-zone': {
    title: 'Lecture de zone PUBG — avion, cercles et zone finale',
    description:
      'Ce que la ligne de vol du C-130 dit vraiment des cercles PUBG, mesuré sur des milliers de parties, et un entraînement pour deviner la zone finale.',
    index: true,
    sitemap: { priority: 0.7, changeFrequency: 'weekly' },
  },
  '/join': {
    title: 'Inscrire ou rejoindre son clan PUBG',
    description:
      'Donne ton pseudo PUBG : on retrouve ton compte et ton clan. Rejoins-le sur chickendinner.fr ou propose-le pour qu’il soit suivi.',
    index: true,
    sitemap: { priority: 0.6, changeFrequency: 'monthly' },
  },
  '/mentions-legales': {
    title: 'Mentions légales et CGU',
    description: 'Éditeur, hébergement, affiliation KRAFTON, origine des données et conditions d’utilisation de chickendinner.fr.',
    index: true,
    sitemap: LEGAL_SITEMAP,
  },
  '/confidentialite': {
    title: 'Confidentialité',
    description: 'Ce que chickendinner.fr sait de toi, ce qu’il ne collecte pas, les cookies et comment retirer tes données.',
    index: true,
    sitemap: LEGAL_SITEMAP,
  },
  '/confidentialite/demande': {
    title: 'Retirer mes données',
    description: 'Demande de masquage de ton profil, de purge de ton historique ou de correction d’une donnée sur chickendinner.fr.',
    index: true,
  },
  '/a-propos': {
    title: 'À propos',
    description: 'chickendinner.fr, projet communautaire, gratuit et non officiel : ce que le site fait, ce qu’il ne fait pas, d’où viennent les données.',
    index: true,
    sitemap: LEGAL_SITEMAP,
  },
  '/login': { title: 'Connexion', description: DEFAULT_DESCRIPTION, index: false },
  '/activate': { title: 'Activation du compte', description: DEFAULT_DESCRIPTION, index: false },
  '/reset-password': { title: 'Nouveau mot de passe', description: DEFAULT_DESCRIPTION, index: false },
  '/account': { title: 'Mon compte', description: DEFAULT_DESCRIPTION, index: false },
  '/members': { title: 'Joueurs', description: DEFAULT_DESCRIPTION, index: false },
  '/clans/mutations': { title: 'Mouvements de clan', description: DEFAULT_DESCRIPTION, index: false },
}

/** Pages du menu latéral d'un clan (accès « Tous »), indexées pour chaque clan suivi. */
export const CLAN_PAGES: Array<{ path: string; label: string; describe: (clan: string) => string }> = [
  {
    path: '/overview',
    label: 'clan PUBG',
    describe: (clan) => `Le clan PUBG ${clan} en un coup d’œil : briefing de la semaine, palmarès, Top 1 et joueurs en forme.`,
  },
  {
    path: '/leaderboard',
    label: 'Classement',
    describe: (clan) => `Classement des joueurs du clan PUBG ${clan} : kills, dégâts, win rate et distinctions, à la semaine, au mois ou depuis le début.`,
  },
  {
    path: '/members',
    label: 'Membres',
    describe: (clan) => `Les joueurs du clan PUBG ${clan} et leur rôle dans l’escouade : Fragger, Medic ou Ghost.`,
  },
  {
    path: '/matches',
    label: 'Matchs',
    describe: (clan) => `Les soirées et les parties du clan PUBG ${clan} : placements, kills, Top 1 et plan de vol.`,
  },
  {
    path: '/stats',
    label: 'Stats',
    describe: (clan) => `Les statistiques du clan PUBG ${clan} : KPI, style de jeu, objets consommés et tendances.`,
  },
  {
    path: '/stats/career',
    label: 'Carrière PUBG',
    describe: (clan) => `La carrière PUBG des joueurs du clan ${clan} : saisons, classés, hauts faits.`,
  },
  {
    path: '/stats/weapons',
    label: 'Armurerie',
    describe: (clan) => `Les armes du clan PUBG ${clan} : kills, dégâts et précision par arme et par catégorie.`,
  },
  {
    path: '/stats/heatmap-kills',
    label: 'Heatmap des kills',
    describe: (clan) => `Où le clan PUBG ${clan} fait ses kills, carte par carte.`,
  },
  {
    path: '/stats/positions',
    label: 'Cartographie tactique',
    describe: (clan) => `Les positions du clan PUBG ${clan} sur chaque carte, phase par phase.`,
  },
  {
    path: '/stats/zone-closures',
    label: 'Fin de zone',
    describe: (clan) => `Où finit la zone dans les parties du clan PUBG ${clan}, et où le clan se place.`,
  },
  {
    path: '/drop-zones',
    label: 'Drop zones',
    describe: (clan) => `Les zones d’atterrissage du clan PUBG ${clan} et la pression adverse au drop.`,
  },
  {
    path: '/awards',
    label: 'Awards',
    describe: (clan) => `Les meilleurs joueurs du clan PUBG ${clan} et leurs distinctions de la période.`,
  },
  {
    path: '/challenges',
    label: 'Challenges',
    describe: (clan) => `Les défis du clan PUBG ${clan} et leurs gagnants.`,
  },
]

export type ClanRef = { id: number; name: string; tag: string; indexable: boolean }
export type TournamentRef = { id: string; title: string; indexable: boolean }
export type PageSeo = { title: string | null; description: string; index: boolean }

const CLAN_PATH = /^\/clans\/(\d+)(\/.*)?$/
const TOURNAMENT_PATH = /^\/tournaments\/([^/]+)(\/.*)?$/

/** Ce qu'il faut charger en base pour décrire la page (nom du clan, titre du tournoi). */
export function seoLookupFor(pathname: string): { clanId: number } | { tournamentId: string } | null {
  const clan = CLAN_PATH.exec(pathname)
  if (clan) return { clanId: Number(clan[1]) }
  const tournament = TOURNAMENT_PATH.exec(pathname)
  if (tournament) return { tournamentId: decodeURIComponent(tournament[1]) }
  return null
}

const NOINDEX: PageSeo = { title: null, description: DEFAULT_DESCRIPTION, index: false }

export function pageSeo(pathname: string, refs: { clan?: ClanRef | null; tournament?: TournamentRef | null } = {}): PageSeo {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const known = STATIC_PAGES[path]
  if (known) return { title: known.title, description: known.description, index: known.index }

  if (path.startsWith('/settings') || path.startsWith('/members/')) {
    return { ...NOINDEX, title: path.startsWith('/settings') ? 'Administration' : 'Profil joueur' }
  }

  const clanMatch = CLAN_PATH.exec(path)
  if (clanMatch) {
    const clan = refs.clan
    if (!clan) return NOINDEX
    const label = `${clan.name} [${clan.tag}]`
    const page = CLAN_PAGES.find((entry) => entry.path === (clanMatch[2] ?? ''))
    if (!page) return { ...NOINDEX, title: label }
    return {
      title: page.path === '/overview' ? `${label} — clan PUBG` : `${label} — ${page.label}`,
      description: page.describe(label),
      index: clan.indexable,
    }
  }

  const tournamentMatch = TOURNAMENT_PATH.exec(path)
  if (tournamentMatch) {
    const tournament = refs.tournament
    if (!tournament) return NOINDEX
    return {
      title: `${tournament.title} — tournoi PUBG`,
      description: `Le tournoi PUBG ${tournament.title} : classement, manches, MVP et parties personnalisées importées automatiquement.`,
      // Seule la page du tournoi ; ses écrans de manche restent hors index.
      index: tournament.indexable && !tournamentMatch[2],
    }
  }

  // Liste blanche : une adresse non déclarée ici (page oubliée, 404) n'est pas indexée et n'a pas de canonique.
  return path === '/' ? { title: null, description: DEFAULT_DESCRIPTION, index: true } : NOINDEX
}

/** Métadonnées complètes d'une page : titre, description, robots, canonique, aperçus de partage, vérification Google. */
export function buildPageMetadata(
  pathname: string,
  seo: PageSeo,
  env: Record<string, string | undefined> = process.env
): Metadata {
  const title = seo.title ? `${seo.title} · ${SITE_NAME}` : DEFAULT_TITLE
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const verification = env.GOOGLE_SITE_VERIFICATION?.trim()
  return {
    metadataBase: siteUrl(env),
    title: { absolute: title },
    description: seo.description,
    applicationName: SITE_NAME,
    // Adresse sans la requête (`?period=`…) : une seule version de chaque page pour Google.
    alternates: seo.index ? { canonical: path } : undefined,
    robots: seo.index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'fr_FR',
      url: path,
      title,
      description: seo.description,
      images: [SHARE_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description: seo.description, images: [SHARE_IMAGE.url] },
    ...(verification ? { verification: { google: verification } } : {}),
  }
}

/** Contenu de /sitemap.xml : accueil, pages publiques, pages du menu de chaque clan suivi, tournois lancés. */
export function sitemapEntries(
  base: URL,
  clans: Array<{ id: number; lastMatchAt: Date | null }>,
  tournaments: Array<{ id: string; updatedAt: Date }>
): MetadataRoute.Sitemap {
  const url = (path: string) => new URL(path, base).toString()
  return [
    { url: url('/'), changeFrequency: 'daily', priority: 1 },
    ...Object.entries(STATIC_PAGES)
      .filter(([, page]) => page.index && page.sitemap)
      .map(([path, page]) => ({ url: url(path), changeFrequency: page.sitemap!.changeFrequency, priority: page.sitemap!.priority })),
    ...clans.flatMap((clan) =>
      CLAN_PAGES.map((page) => ({
        url: url(`/clans/${clan.id}${page.path}`),
        ...(clan.lastMatchAt ? { lastModified: clan.lastMatchAt } : {}),
        changeFrequency: 'daily' as const,
        priority: page.path === '/overview' ? 0.7 : 0.5,
      }))
    ),
    ...tournaments.map((tournament) => ({
      url: url(`/tournaments/${encodeURIComponent(tournament.id)}`),
      lastModified: tournament.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
  ]
}

/**
 * Données structurées de l'accueil (schema.org) : le site et son éditeur, pour que Google associe le nom
 * « chickendinner.fr » au site. Chaîne prête pour un `<script type="application/ld+json">` (`<` échappé).
 */
export function homeJsonLd(base: URL) {
  const url = base.toString()
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${url}#website`,
        url,
        name: SITE_NAME,
        alternateName: 'chickendinner',
        description: DEFAULT_DESCRIPTION,
        inLanguage: 'fr-FR',
        publisher: { '@id': `${url}#publisher` },
      },
      { '@type': 'Organization', '@id': `${url}#publisher`, name: 'Arkium', url: 'https://arkium.eu' },
    ],
  }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/** Contenu de /robots.txt. Les pages joueur ne sont pas bloquées ici : Google doit pouvoir y lire leur `noindex`. */
export function robotsRules(base: URL): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/account', '/settings', '/login', '/activate', '/reset-password'],
    },
    sitemap: new URL('/sitemap.xml', base).toString(),
  }
}
