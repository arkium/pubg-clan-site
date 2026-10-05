import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Inter, Teko } from 'next/font/google'

import ClanNavigation from '@/components/ClanNavigation'
import DatabaseUnavailable from '@/components/DatabaseUnavailable'
import SiteFooter from '@/components/SiteFooter'
import ThemeInitializer from '@/components/ThemeInitializer'
import { GlobalCommandPalette } from '@/components/ui/GlobalCommandPalette'
import { isAuthDisabled } from '@/lib/auth-mode'
import { getSessionFromToken } from '@/lib/auth-session'
import { getDatabaseErrorPresentation } from '@/lib/database-error'
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

export const metadata: Metadata = {
  title: 'PUBG Clan Site',
  description: 'Gestion et statistiques des clans PUBG',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const now = new Date()
  let setupState
  let session

  try {
    setupState = await getSetupState()
    const cookieStore = await cookies()
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
      <html lang="fr" className={`h-full antialiased ${inter.variable} ${teko.variable}`} suppressHydrationWarning>
        <body className="min-h-full bg-gray-50 text-gray-900 font-sans" suppressHydrationWarning>
          <ThemeInitializer />
          <DatabaseUnavailable {...databaseError} />
        </body>
      </html>
    )
  }

  const showAppShell = setupState === 'completed' && (Boolean(session) || isAuthDisabled())

  const footer = <SiteFooter year={now.getFullYear()} />

  return (
    <html lang="fr" className={`h-full antialiased ${inter.variable} ${teko.variable}`} suppressHydrationWarning>
      <body className="min-h-full bg-gray-50 text-gray-900 font-sans" suppressHydrationWarning>
        <ThemeInitializer />
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
      </body>
    </html>
  )
}
