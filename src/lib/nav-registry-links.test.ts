import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'
import { NAV_REGISTRY } from '@/lib/nav-permissions-registry'
import { hasAppPage as hasPage } from '@/lib/test-support/app-routes'

/**
 * Chaque lien du registre des menus mène à une page existante ou à une redirection de `next.config.ts`
 * (docs/TODO/administration.md, lot 2 : `clan.items`, `clan.reports`, `admin.weapon-categories` menaient à des pages
 * supprimées). Les entrées propres à la base (`NavItem`) sont vérifiées par scripts/cleanup-admin-nav.ts.
 */

function toRegExp(source: string) {
  const pattern = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z]+/g, '[^/]+')
  return new RegExp(`^${pattern}$`)
}

describe('liens du registre des menus', () => {
  it('chaque entrée mène à une page ou à une redirection', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? []
    const isRedirected = (href: string) => redirects.some((rule) => toRegExp(rule.source).test(href.split('?')[0]))

    const broken = NAV_REGISTRY.filter((item) => !hasPage(item.hrefTemplate) && !isRedirected(item.hrefTemplate)).map(
      (item) => `${item.navKey} → ${item.hrefTemplate}`
    )
    expect(broken).toEqual([])
  })

  it('chaque ancienne adresse d’administration est redirigée vers une page existante', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? []
    const MOVED = [
      ['/settings/admin', '/settings/owner'],
      ['/members/manage', '/members'],
      ['/settings/superuser', '/settings'],
      ['/settings/superuser/database', '/settings/database'],
      ['/settings/opponents', '/settings/clans'],
      ['/settings/opponents/players', '/settings/players'],
      ['/settings/opponents/resolution', '/settings/players/resolution'],
      ['/settings/opponents/triage', '/settings/players/triage'],
      ['/settings/clan-lifecycle', '/settings/clans/lifecycle'],
      ['/settings/telemetry-recoveries', '/settings/telemetry'],
      ['/clans/:clanId/members/pending', '/clans/:clanId/settings/members?tab=demandes'],
    ]
    for (const [source, destination] of MOVED) {
      expect([source, hasPage(source)]).toEqual([source, false])
      expect([source, redirects.find((rule) => rule.source === source)?.destination]).toEqual([source, destination])
      expect([destination, hasPage(destination)]).toEqual([destination, true])
    }
  })

  it('le résolveur repère bien une page absente', () => {
    expect(hasPage('/clans/:clanId/stats')).toBe(true)
    expect(hasPage('/clans/:clanId/reports')).toBe(false)
  })
})
