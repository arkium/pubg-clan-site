import type { MetadataRoute } from 'next'

import { siteUrl, sitemapEntries } from '@/lib/seo/page-seo'
import { loadSitemapData } from '@/lib/seo/seo-service'

/**
 * /sitemap.xml (docs/features/seo.md) : accueil, pages publiques, pages du menu de chaque clan suivi, tournois lancés.
 * Calculé à chaque appel : la liste des clans suit leur cycle de vie, et le build n'a pas accès à la base.
 */
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  try {
    const { clans, tournaments } = await loadSitemapData()
    return sitemapEntries(base, clans, tournaments)
  } catch (error) {
    // Base indisponible : les pages fixes restent annoncées plutôt qu'une erreur 500 au robot.
    console.error('[sitemap] Database read failed', { name: error instanceof Error ? error.name : 'UnknownError' })
    return sitemapEntries(base, [], [])
  }
}
