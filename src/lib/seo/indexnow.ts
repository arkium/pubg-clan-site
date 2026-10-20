import { SITE_NAME, siteUrl } from '@/lib/seo/page-seo'

/**
 * IndexNow (docs/TODO/geo-seo-propositions.md, 4.3) : prévient Bing et les moteurs qui partagent le protocole qu'une
 * page publique vient de paraître (tournoi lancé ou terminé, clan validé). Google ne lit pas IndexNow : il passe par le
 * sitemap.
 *
 * Coupé par défaut : seulement avec `INDEXNOW_KEY` (8 à 128 caractères `a-z A-Z 0-9 -`), et seulement quand l'adresse
 * publique est le vrai domaine — jamais depuis un poste de développement ou une préproduction. La clé est servie à
 * `/indexnow.txt` (réécrite vers `src/app/api/indexnow-key/route.ts`), déclarée dans chaque envoi (`keyLocation`). Un envoi ne bloque ni
 * ne fait échouer l'écriture qui l'a déclenché.
 */

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
export const INDEXNOW_KEY_PATH = '/indexnow.txt'

const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/

type Env = Record<string, string | undefined>

export function readIndexNowKey(env: Env = process.env) {
  const key = env.INDEXNOW_KEY?.trim()
  return key && KEY_PATTERN.test(key) ? key : null
}

export type IndexNowResult = { sent: true; status: number } | { sent: false; reason: 'disabled' | 'not_production' | 'empty' | 'failed' }

/** Corps de l'envoi, ou la raison de ne rien envoyer. Pur : testé sans réseau. */
export function indexNowRequest(paths: readonly string[], env: Env = process.env) {
  const key = readIndexNowKey(env)
  if (!key) return { skip: 'disabled' as const }
  const base = siteUrl(env)
  if (base.hostname !== SITE_NAME) return { skip: 'not_production' as const }
  const urlList = [...new Set(paths.filter((path) => path.startsWith('/')))].map((path) => new URL(path, base).toString())
  if (urlList.length === 0) return { skip: 'empty' as const }
  return {
    body: { host: base.hostname, key, keyLocation: new URL(INDEXNOW_KEY_PATH, base).toString(), urlList },
  }
}

export async function notifyIndexNow(
  paths: readonly string[],
  options: { env?: Env; fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<IndexNowResult> {
  const request = indexNowRequest(paths, options.env)
  if ('skip' in request) return { sent: false, reason: request.skip! }
  try {
    const response = await (options.fetchImpl ?? fetch)(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    })
    // 200 et 202 : accepté. 422 / 403 : clé ou adresses refusées — journalisé, jamais propagé.
    if (!response.ok) console.warn(`[indexnow] Envoi refusé (HTTP ${response.status}) pour ${request.body.urlList.length} adresse(s)`)
    return { sent: true, status: response.status }
  } catch (error) {
    console.warn('[indexnow] Envoi impossible', error instanceof Error ? error.message : error)
    return { sent: false, reason: 'failed' }
  }
}

/** Variante des routes : sans attente, sans erreur possible. */
export function fireIndexNow(paths: readonly string[]) {
  void notifyIndexNow(paths).catch(() => undefined)
}
