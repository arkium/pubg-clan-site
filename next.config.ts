import type { NextConfig } from "next";

/**
 * En-têtes de sécurité de toutes les réponses (docs/TODO/geo-seo-propositions.md, lot 0.1 ; docs/ops/deployment.md).
 * HSTS **sans** `includeSubDomains` ni `preload` : les sous-domaines de clan n'ont pas encore de certificat valide
 * (wildcard à poser), et un navigateur qui a vu `includeSubDomains` refuserait de les ouvrir en HTTP.
 * La CSP est posée par le proxy (`src/proxy.ts`), qui seul peut générer un nonce par requête.
 */
export const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  // Ne pas annoncer le framework (`X-Powered-By: Next.js`).
  poweredByHeader: false,
  serverExternalPackages: ['prisma', '@prisma/client'],
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) config.cache = { type: 'memory' }
    return config
  },
  // Réponses de l'API : ouvertes aux robots (le rendu des pages par Google en a besoin, voir `robotsRules` dans
  // src/lib/seo/page-seo.ts), mais jamais indexées.
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ]
  },
  // Fichier de clé IndexNow (src/lib/seo/indexnow.ts) servi par une route API : un dossier de route `src/app/indexnow.txt`
  // fait planter `next build` en code natif (Next 16.2.6, constaté le 2026-10-20, Turbopack comme webpack).
  async rewrites() {
    return [{ source: '/indexnow.txt', destination: '/api/indexnow-key' }]
  },
  // Ancienne page « Catégories armes », fondue dans l'armurerie du clan (docs/features/weapons.md §7). Vraie redirection
  // HTTP, avant tout rendu ; la requête (`period`, `cat`) est transmise telle quelle, sans `cat` on ouvre la première.
  async redirects() {
    const source = '/clans/:clanId/stats/weapons/categories'
    const destination = '/clans/:clanId/stats/weapons'
    return [
      { source, has: [{ type: 'query', key: 'cat' }], destination, permanent: false },
      { source, missing: [{ type: 'query', key: 'cat' }], destination: `${destination}?cat=AR`, permanent: false },
      // Écran « Alias catégories armes » supprimé le 2026-09-27 (liste unique : src/lib/weapons/weapon-categories.ts) :
      // un ancien lien ou l'entrée de menu restée en base mène à l'écran d'administration des armes qui subsiste.
      { source: '/settings/weapon-categories', destination: '/settings/weapon-labels', permanent: false },
      // Anciennes pages de tournoi par clan (supprimées le 2026-09-27) : elles chargeaient tout avant de rediriger
      // côté navigateur. Les tournois sont globaux, la redirection se fait maintenant avant tout rendu.
      { source: '/clans/:clanId/tournaments', destination: '/tournaments', permanent: false },
      { source: '/clans/:clanId/tournaments/:tournamentId', destination: '/tournaments/:tournamentId', permanent: false },
      // « Objets consommés » fondu dans « Style de jeu du clan » (2026-09-27) : même période, section `#sec-items`.
      { source: '/clans/:clanId/stats/items', destination: '/clans/:clanId/stats#sec-items', permanent: false },
      // Quatre profils (docs/TODO/administration.md §5.3, lot 2) : plus de profil Admin, son accueil mène à celui du clan.
      { source: '/settings/admin', destination: '/settings/owner', permanent: false },
      // Guide du mortier sur sa propre adresse (2026-10-18, référencement) : l'ancien onglet `?tab=guide` y mène.
      { source: '/mortier', has: [{ type: 'query', key: 'tab', value: 'guide' }], destination: '/mortier/guide', permanent: false },
      // Ancienne redirection côté navigateur vers la page des membres, sans lien depuis le 2026-10-07.
      { source: '/members/manage', destination: '/members', permanent: false },
      // Plateforme réorganisée (docs/TODO/administration.md, lot 3a) : la requête (`?tab=`, `?opponentsQ=`…) suit.
      { source: '/settings/superuser', destination: '/settings', permanent: false },
      { source: '/settings/superuser/database', destination: '/settings/database', permanent: false },
      { source: '/settings/opponents', destination: '/settings/clans', permanent: false },
      { source: '/settings/opponents/players', destination: '/settings/players', permanent: false },
      { source: '/settings/opponents/resolution', destination: '/settings/players/resolution', permanent: false },
      { source: '/settings/opponents/triage', destination: '/settings/players/triage', permanent: false },
      { source: '/settings/clan-lifecycle', destination: '/settings/clans/lifecycle', permanent: false },
      { source: '/settings/telemetry-recoveries', destination: '/settings/telemetry', permanent: false },
      // « Mon clan » (lot 3b) : les demandes d'adhésion sont un onglet de la gestion des membres.
      { source: '/clans/:clanId/members/pending', destination: '/clans/:clanId/settings/members?tab=demandes', permanent: false },
      // Outils de télémétrie d'un clan : onglets de « Données » (Q20), ramenés à trois le 2026-10-11 (§8) — chaque
      // ancienne adresse mène directement à sa destination finale, sans redirection en chaîne.
      { source: '/clans/:clanId/telemetry/dashboard', destination: '/clans/:clanId/settings/data', permanent: false },
      { source: '/clans/:clanId/settings/data/state', destination: '/clans/:clanId/settings/data', permanent: false },
      // Les échecs des deux files, avec leur relance, sont un bloc de « Récupérations ».
      { source: '/clans/:clanId/telemetry/errors', destination: '/clans/:clanId/settings/data/recoveries#echecs', permanent: false },
      { source: '/clans/:clanId/settings/data/errors', destination: '/clans/:clanId/settings/data/recoveries#echecs', permanent: false },
      // Synchronisation par identifiants supprimée : on agit sur une partie depuis sa soirée.
      { source: '/clans/:clanId/telemetry/sync-batch-manual', destination: '/clans/:clanId/settings/data/sessions', permanent: false },
      { source: '/clans/:clanId/settings/data/sync', destination: '/clans/:clanId/settings/data/sessions', permanent: false },
      { source: '/clans/:clanId/telemetry/recoveries', destination: '/clans/:clanId/settings/data/recoveries', permanent: false },
      // « Adversaires rencontrés » rejoint les statistiques du clan (Q5).
      { source: '/clans/:clanId/telemetry/opponents', destination: '/clans/:clanId/stats/opponents', permanent: false },
      // Soirées de télémétrie : les pages joueur font foi, le panneau d'exploitation devient l'onglet « Soirées » des
      // Données du clan. Le débriefing et la page « État » d'un match gardent leur adresse sous telemetry/matches/.
      { source: '/clans/:clanId/telemetry/matches', destination: '/clans/:clanId/matches', permanent: false },
      { source: '/clans/:clanId/telemetry/matches/session/:date', destination: '/clans/:clanId/matches/session/:date', permanent: false },
    ]
  },
  //allowedDevOrigins: ['smk.arkium.group', 'localhost', '127.0.0.1', '10.1.0.248'],
};

export default nextConfig;
