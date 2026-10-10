import { SITE_DOMAIN } from '@/lib/legal/legal-info'

/**
 * Nom du site dans les e-mails — objets, textes, pieds : `SITE_NAME` du .env, sinon « chickendinner.fr ». Remplace
 * l'ancien « PUBG Clan (Site) » des premiers e-mails.
 *
 * Lu côté serveur uniquement : une variable sans préfixe `NEXT_PUBLIC_` n'atteint pas le navigateur. Les pages gardent
 * la constante `SITE_DOMAIN` (`src/lib/legal/legal-info.ts`), et `SITE_NAME` ne doit pas servir à un texte rendu par
 * un composant client (le serveur et le navigateur n'écriraient pas la même chose).
 */
export function siteName(env: Record<string, string | undefined> = process.env): string {
  return env.SITE_NAME?.trim() || SITE_DOMAIN
}
