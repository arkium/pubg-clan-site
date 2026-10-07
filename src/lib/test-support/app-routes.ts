import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Pour les tests : une adresse (`/clans/:clanId/stats?x=1`, `/settings/clans`) mène-t-elle à une `page.tsx` de
 * `src/app` ? Gère les segments dynamiques (`:clanId` ↔ `[clanId]`, `[id]`…) et les groupes de routes `(nom)`,
 * transparents dans l'adresse.
 */
const APP_DIR = path.resolve(__dirname, '../../app')

function isDynamicSegment(name: string) {
  return /^\[[^\]]+\]$/.test(name)
}

function isRouteGroup(name: string) {
  return /^\(.+\)$/.test(name)
}

export function hasAppPage(route: string) {
  const segments = route.split(/[?#]/)[0].split('/').filter(Boolean)

  function walk(dir: string, rest: string[]): boolean {
    const entries = readdirSync(dir).filter((entry) => statSync(path.join(dir, entry)).isDirectory())
    if (entries.some((entry) => isRouteGroup(entry) && walk(path.join(dir, entry), rest))) return true
    if (rest.length === 0) return existsSync(path.join(dir, 'page.tsx'))
    const [head, ...tail] = rest
    const candidates = head.startsWith(':') ? entries.filter(isDynamicSegment) : entries.filter((entry) => entry === head)
    return candidates.some((entry) => walk(path.join(dir, entry), tail))
  }

  return walk(APP_DIR, segments)
}
