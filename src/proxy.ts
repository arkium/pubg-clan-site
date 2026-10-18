import { NextResponse, type NextRequest } from 'next/server'

import {
  createSubdomainTargetsCache,
  extractSubdomainLabel,
  fetchSubdomainTargets,
  readSubdomainRoot,
  subdomainRedirectLocation,
} from '@/lib/clan-subdomain-host'
import { LEGAL_PATHS } from '@/lib/legal/legal-info'
import { buildCsp, createNonce, CSP_HEADER } from '@/lib/security/csp'
import { wwwRedirectLocation } from '@/lib/seo/canonical-host'
import { PATHNAME_HEADER } from '@/lib/seo/page-seo'

const FIRST_RUN_ALLOWED_PATHS = new Set(['/'])
const PENDING_ACTIVATION_ALLOWED_PATHS = new Set(['/', '/activate', '/login', '/reset-password', '/join', ...LEGAL_PATHS])
// '/' : vitrine publique de l'accueil (docs/features/accueil.md), visible sans session même hors mode visiteur.
// Pages légales (docs/features/pages-legales.md) : liées depuis tous les footers, donc lisibles par tous.
// '/notifications/desabonnement' : lien des e-mails de notification, ouvert sans session (jeton signé, docs/features/notifications.md).
const PUBLIC_PATHS = new Set(['/', '/login', '/activate', '/reset-password', '/join', '/notifications/desabonnement', ...LEGAL_PATHS])
const SESSION_COOKIE_NAME = 'pubg_clan_session'
const AUTH_DISABLED = process.env.DISABLE_AUTH_PERMISSIONS === 'true'

async function getSetupState(origin: string): Promise<'first_run' | 'pending_activation' | 'completed'> {
  try {
    const response = await fetch(`${origin}/api/setup/status`, {
      cache: 'no-store',
      headers: {
        'x-first-run-check': 'true',
      },
    })

    if (!response.ok) {
      return 'completed'
    }

    const payload = (await response.json().catch(() => null)) as
      | { setupState?: 'first_run' | 'pending_activation' | 'completed' }
      | null

    return payload?.setupState ?? 'completed'
  } catch {
    return 'completed'
  }
}

/**
 * Laisse passer en transmettant le chemin au rendu serveur : le layout racine en tire le titre, la description et
 * l'indexation de la page (docs/features/seo.md). Un en-tête du même nom envoyé par le navigateur est écrasé.
 * Pose aussi la CSP de la page (`src/lib/security/csp.ts`), avec un nonce neuf : sur la requête, où Next le lit pour
 * l'ajouter à ses scripts, et sur la réponse.
 */
function passThrough(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname)
  const csp = buildCsp({ nonce: createNonce(), dev: process.env.NODE_ENV === 'development' })
  headers.set(CSP_HEADER, csp)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set(CSP_HEADER, csp)
  return response
}

// Table `sous-domaine → clan`, gardée en mémoire par le process web (docs/TODO/chickendinnerfr.md §4.C).
let subdomainTargetsCache: ReturnType<typeof createSubdomainTargetsCache> | null = null

/** Redirection d'un sous-domaine de clan, ou `null` (fonctionnalité inactive ou hôte ordinaire). */
async function clanSubdomainRedirect(request: NextRequest): Promise<string | null> {
  const root = readSubdomainRoot()
  if (!root) return null
  const label = extractSubdomainLabel(request.headers.get('host'), root)
  if (!label) return null

  subdomainTargetsCache ??= createSubdomainTargetsCache(() => fetchSubdomainTargets(request.nextUrl.origin))
  return subdomainRedirectLocation({
    label,
    pathname: request.nextUrl.pathname,
    root,
    targets: await subdomainTargetsCache(),
  })
}

export async function proxy(request: NextRequest) {
  const { pathname, origin } = request.nextUrl

  // `www.` : une seule adresse pour le site, celle sans `www` (redirection permanente, avant les sous-domaines de clan).
  const apexLocation = wwwRedirectLocation({
    host: request.headers.get('host'),
    pathname,
    search: request.nextUrl.search,
    forwardedProto: request.headers.get('x-forwarded-proto'),
  })
  if (apexLocation) {
    return NextResponse.redirect(apexLocation, 301)
  }

  // Un sous-domaine de clan n'affiche jamais de page : il redirige, avant toute autre logique.
  const subdomainLocation = await clanSubdomainRedirect(request)
  if (subdomainLocation) {
    return NextResponse.redirect(subdomainLocation, 307)
  }

  const setupState = await getSetupState(origin)

  if (setupState === 'first_run') {
    if (FIRST_RUN_ALLOWED_PATHS.has(pathname)) {
      return passThrough(request)
    }

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.search = ''

    return NextResponse.redirect(redirectUrl)
  }

  if (setupState === 'pending_activation') {
    if (PENDING_ACTIVATION_ALLOWED_PATHS.has(pathname)) {
      return passThrough(request)
    }

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.search = ''

    return NextResponse.redirect(redirectUrl)
  }

  // Laisser passer sans redirection toutes les images et assets statiques
  if (/\.(?:jpg|jpeg|png|webp|gif|svg|ico)$/i.test(pathname)) {
    return NextResponse.next()
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null

  if (!sessionToken) {
    const isProtectedWhenAuthDisabled = pathname.startsWith('/account') || pathname.startsWith('/settings')
    if (PUBLIC_PATHS.has(pathname) || (AUTH_DISABLED && !isProtectedWhenAuthDisabled)) {
      return passThrough(request)
    }

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = ''

    return NextResponse.redirect(redirectUrl)
  }

  // Keep /login and /join reachable even with a stale/invalid cookie.
  // The client-side session check decides whether to keep the user logged in.
  if (pathname === '/login' || pathname === '/join') {
    return passThrough(request)
  }

  return passThrough(request)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|maps|icons|avatars|uploads).*)',
  ],
}
