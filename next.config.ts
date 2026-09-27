import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['prisma', '@prisma/client'],
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) config.cache = { type: 'memory' }
    return config
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
    ]
  },
  //allowedDevOrigins: ['smk.arkium.group', 'localhost', '127.0.0.1', '10.1.0.248'],
};

export default nextConfig;
