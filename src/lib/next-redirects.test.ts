import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'

/**
 * Redirections de `next.config.ts` (anciennes adresses de pages refondues). Une redirection s'applique avant les
 * pages : une destination qui n'existe pas donne un 404, une source qui est encore une page la rend inaccessible sans
 * aucun message. Ce test relie chaque règle au système de fichiers de `src/app`.
 */

const APP = path.resolve(__dirname, '../app')

/** `/clans/:clanId/stats/weapons?cat=AR` → `src/app/clans/[clanId]/stats/weapons/page.tsx`. */
function pageFile(route: string) {
  const pathname = route.split(/[?#]/)[0]
  const segments = pathname.split('/').filter(Boolean).map((segment) => (segment.startsWith(':') ? `[${segment.slice(1)}]` : segment))
  return path.join(APP, ...segments, 'page.tsx')
}

describe('next.config.ts — redirections', () => {
  it('chaque destination est une page qui existe', async () => {
    const rules = await nextConfig.redirects!()
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.filter((rule) => !existsSync(pageFile(rule.destination))).map((rule) => rule.destination)).toEqual([])
  })

  it('aucune source n’est encore une page (elle serait masquée par la redirection)', async () => {
    const rules = await nextConfig.redirects!()
    expect(rules.filter((rule) => existsSync(pageFile(rule.source))).map((rule) => rule.source)).toEqual([])
  })

  it('les anciennes pages de tournoi par clan mènent aux pages globales, identifiant compris', async () => {
    const rules = await nextConfig.redirects!()
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/clans/:clanId/tournaments', destination: '/tournaments', permanent: false }),
        expect.objectContaining({
          source: '/clans/:clanId/tournaments/:tournamentId',
          destination: '/tournaments/:tournamentId',
          permanent: false,
        }),
      ])
    )
  })
})
