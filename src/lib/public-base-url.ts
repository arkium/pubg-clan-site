/**
 * Adresse du site dans les liens qui partent hors du site : messages Discord, alertes d'administration, e-mails de
 * compte. Une seule lecture de l'environnement, au lieu des copies d'`auth-service.ts`, `discord-service.ts` et
 * `admin-alerts/messages.ts` (docs/TODO/url-masking.md §4.D).
 *
 * Deux adresses, telles que les décrit /settings/site-config (`site-config.ts`) :
 * - **publique** : `NEXT_PUBLIC_APP_URL`, sinon `APP_URL` — vide, le message part sans lien ;
 * - **liens de compte** (activation, mot de passe) : `APP_URL`, sinon `NEXT_PUBLIC_APP_URL`, sinon
 *   `http://localhost:3000`.
 *
 * Une variable vide ou faite d'espaces compte comme absente. Les canoniques, le sitemap et les e-mails de notification
 * passent par `siteUrl()` (`seo/page-seo.ts`), qui retombe sur https://chickendinner.fr.
 */

type Env = Record<string, string | undefined>

const LOCAL_FALLBACK_URL = 'http://localhost:3000'

const warned = new Set<string>()

/** Un seul avertissement par processus : un cron qui envoie cent messages n'écrit pas cent lignes. */
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(message)
}

function firstConfigured(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed.replace(/\/+$/, '')
  }
  return ''
}

/** Adresse publique, sans barre finale ; chaîne vide si rien n'est configuré (le lien est alors omis). */
export function getPublicSiteBaseUrl(env: Env = process.env) {
  const base = firstConfigured(env.NEXT_PUBLIC_APP_URL, env.APP_URL)
  if (!base) {
    warnOnce(
      'public',
      '[public-base-url] NEXT_PUBLIC_APP_URL et APP_URL absentes : les messages Discord et les alertes partent sans lien vers le site.'
    )
  }
  return base
}

/** Adresse des liens de compte, sans barre finale. */
export function getAccountLinkBaseUrl(env: Env = process.env) {
  const base = firstConfigured(env.APP_URL, env.NEXT_PUBLIC_APP_URL)
  if (base) return base
  if (env.NODE_ENV === 'production') {
    warnOnce(
      'account',
      `[public-base-url] APP_URL et NEXT_PUBLIC_APP_URL absentes : les liens d'activation et de mot de passe pointent vers ${LOCAL_FALLBACK_URL}.`
    )
  }
  return LOCAL_FALLBACK_URL
}

/** Tests seulement : rejoue les avertissements déjà émis. */
export function resetPublicBaseUrlWarningsForTests() {
  warned.clear()
}
