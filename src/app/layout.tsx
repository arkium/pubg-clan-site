import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { Inter, Teko } from 'next/font/google'

import ClanNavigation from '@/components/ClanNavigation'
import DatabaseUnavailable from '@/components/DatabaseUnavailable'
import { ShellBootstrapProvider } from '@/components/ShellBootstrap'
import SiteFooter from '@/components/SiteFooter'
import ThemeInitializer from '@/components/ThemeInitializer'
import { GlobalCommandPalette } from '@/components/ui/GlobalCommandPalette'
import { APP_THEME_STORAGE_KEY, resolveAppTheme } from '@/lib/app-theme'
import { isAuthDisabled } from '@/lib/auth-mode'
import { getSessionFromToken } from '@/lib/auth-session'
import { getDatabaseErrorPresentation } from '@/lib/database-error'
import { buildPageMetadata, PATHNAME_HEADER } from '@/lib/seo/page-seo'
import { resolvePageSeo } from '@/lib/seo/seo-service'
import { getSetupState } from '@/lib/setup-service'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

// Titres de bannière et chiffres héros (charte UI §3) : `.t-hero`, `.home-display`.
const teko = Teko({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-teko',
})

export const dynamic = 'force-dynamic'

/**
 * Référencement de toutes les pages (docs/features/seo.md) : titre, description, indexation, canonique et aperçus,
 * calculés depuis le chemin que transmet le proxy. Les pages sont surtout des composants client, qui ne peuvent pas
 * déclarer leurs métadonnées ; la vitrine `/` garde les siennes.
 */
export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? '/'
  return buildPageMetadata(pathname, await resolvePageSeo(pathname))
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const now = new Date()
  const cookieStore = await cookies()
  // Thème rendu côté serveur (cookie écrit par le navigateur, src/lib/app-theme.ts) : ni flash ni écart d'hydratation.
  const theme = resolveAppTheme(cookieStore.get(APP_THEME_STORAGE_KEY)?.value)
  const htmlClassName = `h-full antialiased ${inter.variable} ${teko.variable}${theme === 'dark' ? ' dark' : ''}`
  const bodyClassName = `min-h-full bg-gray-50 text-gray-900 font-sans${theme === 'dark' ? ' dark' : ''}`
  let setupState
  let session

  try {
    setupState = await getSetupState()
    const sessionToken = cookieStore.get('pubg_clan_session')?.value ?? null
    session = await getSessionFromToken(sessionToken)
  } catch (error) {
    const databaseError = getDatabaseErrorPresentation(error)

    if (!databaseError) {
      throw error
    }

    console.error('[RootLayout] Database initialization failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })

    return (
      <html lang="fr" className={htmlClassName} data-app-theme={theme} suppressHydrationWarning>
        <body className={bodyClassName} data-app-theme={theme} suppressHydrationWarning>
          <ThemeInitializer />
          <DatabaseUnavailable {...databaseError} />
        </body>
      </html>
    )
  }

  const authDisabled = isAuthDisabled()
  const showAppShell = setupState === 'completed' && (Boolean(session) || authDisabled)
  const bootstrap = { authDisabled, hasSession: Boolean(session), setupState, theme }

  const footer = <SiteFooter year={now.getFullYear()} />

  return (
    <html lang="fr" className={htmlClassName} data-app-theme={theme} suppressHydrationWarning>
      <body className={bodyClassName} data-app-theme={theme} suppressHydrationWarning>
        <ThemeInitializer />
        <ShellBootstrapProvider value={bootstrap}>
          {showAppShell ? (
            <ClanNavigation>
              <div className="flex-1">{children}</div>
              {footer}
              <GlobalCommandPalette />
            </ClanNavigation>
          ) : (
            <div className="flex min-h-full flex-col">
              <div className="flex-1">{children}</div>
              {footer}
              <GlobalCommandPalette />
            </div>
          )}
        </ShellBootstrapProvider>
      </body>
    </html>
  )
}
