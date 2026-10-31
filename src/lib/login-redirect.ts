/**
 * Paramètre `?redirect=` de la page de connexion. Pur : lu par la page `/login`, le menu visiteur et le proxy des
 * sous-domaines de clan.
 */

const ORIGIN_PROBE = 'http://login-redirect.invalid'
const CLAN_PATH = /^\/clans\/(\d+)(?:[/?#]|$)/

/**
 * Chemin interne sûr, ou `null`. Refuse toute adresse qui mènerait hors du site après `window.location.href` :
 * absolue, `//hôte`, et les variantes que le navigateur lit comme `//hôte` — barre oblique inverse (`/\hôte`) et
 * caractères de contrôle, retirés avant l'analyse de l'adresse (`/%09/hôte`).
 */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null
  try {
    return new URL(value, ORIGIN_PROBE).origin === ORIGIN_PROBE ? value : null
  } catch {
    return null
  }
}

/** Clan visé par un chemin `/clans/<id>/…`, ou `null`. */
export function redirectClanId(path: string | null | undefined): number | null {
  const match = path ? CLAN_PATH.exec(path) : null
  if (!match) return null
  const clanId = Number(match[1])
  return Number.isSafeInteger(clanId) && clanId > 0 ? clanId : null
}
