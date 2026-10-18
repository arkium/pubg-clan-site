/**
 * Content Security Policy (docs/TODO/geo-seo-propositions.md, lot 0.2 ; guide Next 16 :
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). Posée par le proxy sur chaque page, avec un
 * nonce par requête : Next le lit dans l'en-tête de la requête et l'ajoute à ses propres scripts.
 *
 * **Mode observation** (`Report-Only`) depuis le 2026-10-18 : rien n'est bloqué, les écarts s'affichent dans la console du
 * navigateur (« [Report Only] Refused to… »). Une fois la console propre en production, passer `CSP_HEADER` à
 * `Content-Security-Policy` et ajouter `upgrade-insecure-requests` (ignoré en observation).
 *
 * Module pur, sans Prisma : importé par le proxy.
 */

export const CSP_HEADER = 'Content-Security-Policy-Report-Only'

/** Nonce aléatoire d'une requête (Web Crypto : disponible dans le proxy comme dans Node). */
export function createNonce(): string {
  return btoa(crypto.randomUUID())
}

export function buildCsp({ nonce, dev = false }: { nonce: string; dev?: boolean }): string {
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    // `strict-dynamic` : un script autorisé par le nonce peut charger les morceaux de Next. `unsafe-eval` : React en dev.
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]],
    // Styles en ligne (`style={…}` de React, polices de next/font) : impossibles à couvrir par un nonce.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    // Avatars choisis par les joueurs, images de clan et icônes PUBG : servis par d'autres sites, en HTTPS.
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    // Le navigateur n'appelle que l'API du site ; en dev, le rechargement à chaud passe par une WebSocket.
    ['connect-src', ["'self'", ...(dev ? ['ws:', 'wss:'] : [])]],
    ['media-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'self'"]],
  ]
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ')
}
