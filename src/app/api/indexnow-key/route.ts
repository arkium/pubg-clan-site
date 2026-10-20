import { readIndexNowKey } from '@/lib/seo/indexnow'

/**
 * Fichier de clé IndexNow, publié à `/indexnow.txt` par une réécriture de next.config.ts (`keyLocation` de chaque envoi,
 * src/lib/seo/indexnow.ts) : la clé seule, en texte. 404 tant que `INDEXNOW_KEY` n'est pas posée. `/indexnow.txt` est
 * hors du proxy (`matcher` de src/proxy.ts), comme robots.txt.
 */
export function GET() {
  const key = readIndexNowKey()
  if (!key) return new Response('Not found', { status: 404 })
  return new Response(key, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
