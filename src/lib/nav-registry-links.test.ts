import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'
import { NAV_REGISTRY } from '@/lib/nav-permissions-registry'

/**
 * Chaque lien du registre des menus mène à une page existante ou à une redirection de `next.config.ts`
 * (docs/TODO/administration.md, lot 2 : `clan.items`, `clan.reports`, `admin.weapon-categories` menaient à des pages
 * supprimées). Les entrées propres à la base (`NavItem`) sont vérifiées par scripts/cleanup-admin-nav.ts.
 */

const APP_DIR = path.resolve(__dirname, '../app')

function isDynamicSegment(name: string) {
  return /^\[[^\]]+\]$/.test(name)
}

/** Résout `/clans/:clanId/stats` contre l'arborescence `src/app` (segments `[x]` et groupes `(x)` compris). */
function hasPage(href: string) {
  const segments = href.split('?')[0].split('#')[0].split('/').filter(Boolean)

  function walk(dir: string, rest: string[]): boolean {
    const entries = readdirSync(dir).filter((entry) => statSync(path.join(dir, entry)).isDirectory())
    // Groupes de routes : transparents dans l'adresse
    if (entries.some((entry) => /^\(.+\)$/.test(entry) && walk(path.join(dir, entry), rest))) return true
    if (rest.length === 0) return existsSync(path.join(dir, 'page.tsx'))
    const [head, ...tail] = rest
    const candidates = head.startsWith(':') ? entries.filter(isDynamicSegment) : entries.filter((entry) => entry === head)
    return candidates.some((entry) => walk(path.join(dir, entry), tail))
  }

  return walk(APP_DIR, segments)
}

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

  it('le résolveur repère bien une page absente', () => {
    expect(hasPage('/clans/:clanId/stats')).toBe(true)
    expect(hasPage('/clans/:clanId/reports')).toBe(false)
  })
})
