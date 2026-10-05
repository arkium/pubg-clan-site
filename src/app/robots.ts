import type { MetadataRoute } from 'next'

import { robotsRules, siteUrl } from '@/lib/seo/page-seo'

/** /robots.txt (docs/features/seo.md) : règles d'exploration et adresse du sitemap. */
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return robotsRules(siteUrl())
}
