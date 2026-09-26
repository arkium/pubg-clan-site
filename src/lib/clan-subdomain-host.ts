import { RESERVED_SUBDOMAINS } from '@/lib/clan-subdomain'

/**
 * Redirection des sous-domaines de clan dans le proxy — docs/TODO/chickendinnerfr.md §4.C.
 *
 * Aucune lecture Prisma ici (le proxy s'exécute avant toute page) : la table `sous-domaine → clan`
 * vient de `GET /api/internal/clan-subdomains`, gardée en cache mémoire. Sans `CLAN_SUBDOMAIN_ROOT`,
 * la fonctionnalité est inactive (développement local, ou avant le certificat wildcard).
 */

export type SubdomainTargets = Record<string, number>

/** Domaine racine (`chickendinner.fr`), ou `null` si la fonctionnalité est désactivée. */
export function readSubdomainRoot(env: Record<string, string | undefined> = process.env): string | null {
  const root = env.CLAN_SUBDOMAIN_ROOT?.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  return root ? root : null
}

/**
 * Libellé du sous-domaine d'un hôte (`smk.chickendinner.fr` → `smk`), ou `null` quand l'hôte n'est pas
 * un sous-domaine de clan : domaine racine, `www`, `localhost`, adresse IP, autre domaine.
 */
export function extractSubdomainLabel(host: string | null | undefined, root: string): string | null {
  if (!host) return null
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  if (!hostname.endsWith(`.${root}`)) return null
  const label = hostname.slice(0, -(root.length + 1))
  if (!label || label === 'www') return null
  return label
}

const SHORT_MATCH_PATH = /^\/m\/([A-Za-z0-9]+)\/?$/

/**
 * Adresse de redirection (307) pour une requête reçue sur un sous-domaine de clan.
 * - `/m/<match>` : lien court de débriefing, relayé au domaine racine avec le clan (url-masking.md §4.C) ;
 * - sous-domaine attribué à un clan actif : vue d'ensemble du clan (le chemin est ignoré) ;
 * - sous-domaine inconnu, réservé ou invalide : liste des clans.
 */
export function subdomainRedirectLocation(input: {
  label: string
  pathname: string
  root: string
  targets: SubdomainTargets
}): string {
  const base = `https://${input.root}`
  const valid = !input.label.includes('.') && !RESERVED_SUBDOMAINS.has(input.label)

  const shortMatch = input.pathname.match(SHORT_MATCH_PATH)
  if (shortMatch) {
    const clanHint = valid ? `?c=${encodeURIComponent(input.label)}` : ''
    return `${base}/m/${shortMatch[1]}${clanHint}`
  }

  const clanId = valid ? input.targets[input.label] : undefined
  return clanId ? `${base}/clans/${clanId}/overview` : `${base}/clans`
}

/** Cache mémoire de la table, rechargée au plus toutes les `ttlMs` ; en cas d'échec, l'ancienne table sert. */
export function createSubdomainTargetsCache(
  load: () => Promise<SubdomainTargets>,
  options: { ttlMs?: number; retryMs?: number; now?: () => number } = {}
) {
  const ttlMs = options.ttlMs ?? 5 * 60_000
  const retryMs = options.retryMs ?? 30_000
  const now = options.now ?? Date.now
  let value: SubdomainTargets = {}
  let expiresAt = 0
  let pending: Promise<SubdomainTargets> | null = null

  return async function getTargets(): Promise<SubdomainTargets> {
    if (now() < expiresAt) return value
    if (!pending) {
      pending = load()
        .then((loaded) => {
          value = loaded
          expiresAt = now() + ttlMs
          return value
        })
        .catch((error: unknown) => {
          console.error('[clan-subdomain] Table des sous-domaines indisponible :', error)
          expiresAt = now() + retryMs
          return value
        })
        .finally(() => {
          pending = null
        })
    }
    return pending
  }
}

/** Charge la table depuis la route interne (`INTERNAL_APP_URL` en priorité : pas de détour par Nginx). */
export async function fetchSubdomainTargets(origin: string): Promise<SubdomainTargets> {
  const base = (process.env.INTERNAL_APP_URL?.trim() || origin).replace(/\/+$/, '')
  const response = await fetch(`${base}/api/internal/clan-subdomains`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = (await response.json()) as { targets?: SubdomainTargets }
  return payload.targets ?? {}
}
