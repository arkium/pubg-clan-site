import { NextResponse, type NextRequest } from 'next/server'

import {
  createSubdomainTargetsCache,
  extractSubdomainLabel,
  fetchSubdomainTargets,
  readSubdomainRoot,
  subdomainRedirectLocation,
} from '@/lib/clan-subdomain-host'

const FIRST_RUN_ALLOWED_PATHS = new Set(['/'])
const PENDING_ACTIVATION_ALLOWED_PATHS = new Set(['/', '/activate', '/login', '/reset-password', '/join'])
const PUBLIC_PATHS = new Set(['/login', '/activate', '/reset-password', '/join'])
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

  // Un sous-domaine de clan n'affiche jamais de page : il redirige, avant toute autre logique.
  const subdomainLocation = await clanSubdomainRedirect(request)
  if (subdomainLocation) {
    return NextResponse.redirect(subdomainLocation, 307)
  }

  const setupState = await getSetupState(origin)

  if (setupState === 'first_run') {
    if (FIRST_RUN_ALLOWED_PATHS.has(pathname)) {
      return NextResponse.next()
    }

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.search = ''

    return NextResponse.redirect(redirectUrl)
  }

  if (setupState === 'pending_activation') {
    if (PENDING_ACTIVATION_ALLOWED_PATHS.has(pathname)) {
      return NextResponse.next()
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
      return NextResponse.next()
    }

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = ''

    return NextResponse.redirect(redirectUrl)
  }

  // Keep /login and /join reachable even with a stale/invalid cookie.
  // The client-side session check decides whether to keep the user logged in.
  if (pathname === '/login' || pathname === '/join') {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|maps|icons|avatars|uploads).*)',
  ],
}
