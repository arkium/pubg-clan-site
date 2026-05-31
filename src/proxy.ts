import { NextResponse, type NextRequest } from 'next/server'

const FIRST_RUN_ALLOWED_PATHS = new Set(['/'])
const PENDING_ACTIVATION_ALLOWED_PATHS = new Set(['/','/activate','/login','/reset-password'])
const PUBLIC_PATHS = new Set(['/login', '/activate', '/reset-password'])
const SESSION_COOKIE_NAME = 'pubg_clan_session'

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

export async function proxy(request: NextRequest) {
  const { pathname, origin } = request.nextUrl

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

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null

  if (!sessionToken) {
    if (PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next()
    }

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = ''

    return NextResponse.redirect(redirectUrl)
  }

  // Keep /login reachable even with a stale/invalid cookie.
  // The client-side session check decides whether to keep the user logged in.
  if (pathname === '/login') {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}
