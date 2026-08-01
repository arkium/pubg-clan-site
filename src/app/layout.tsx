import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import packageJson from '../../package.json'

import ClanNavigation from '@/components/ClanNavigation'
import DatabaseUnavailable from '@/components/DatabaseUnavailable'
import ThemeInitializer from '@/components/ThemeInitializer'
import { getSessionFromToken } from '@/lib/auth-session'
import { getDatabaseErrorPresentation } from '@/lib/database-error'
import { getSetupState } from '@/lib/setup-service'

import './globals.css'

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
  const monthLabel = now.toLocaleString('fr-FR', { month: 'long' })
  const yearMonthLabel = `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} ${now.getFullYear()}`
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
      <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
        <body className="min-h-full bg-gray-50 text-gray-900" suppressHydrationWarning>
          <ThemeInitializer />
          <DatabaseUnavailable {...databaseError} />
        </body>
      </html>
    )
  }

  const showAppShell = setupState === 'completed' && Boolean(session)

  const footer = (
    <footer className="app-footer border-t border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <section className="p-4">
          <details className="group">
            <summary className="footer-toggle-summary cursor-pointer list-none">
              <div className="flex flex-col items-center justify-center text-center">
                <p className="text-sm font-semibold text-slate-900" suppressHydrationWarning>
                  © {now.getFullYear()} Arkium
                </p>
                <span
                  className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition group-open:rotate-180"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" focusable="false">
                    <path
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.12l3.71-3.9a.75.75 0 1 1 1.08 1.04l-4.25 4.46a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </div>
            </summary>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">PUBG Clan Site</p>
              <h2 className="mt-2 text-lg font-black text-slate-900">Hub stats et coordination de clan</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Plateforme communautaire pour suivre les performances, centraliser les rapports et piloter la vie du clan.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href="https://arkium.eu"
                  target="_blank"
                  rel="noreferrer"
                  className="app-btn app-btn--md app-btn--secondary"
                >
                  arkium.eu
                </a>
                <a
                  href="https://pubg.com"
                  target="_blank"
                  rel="noreferrer"
                  className="app-btn app-btn--md app-btn--secondary"
                >
                  PUBG
                </a>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-1">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-slate-500">Auteur</dt>
                <dd className="font-semibold text-slate-900">Arkium</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-slate-500">Année/Mois</dt>
                <dd className="font-semibold text-slate-900" suppressHydrationWarning>
                  {yearMonthLabel}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-slate-500">Version</dt>
                <dd className="font-semibold text-slate-900">v{packageJson.version}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-slate-500">Copyright</dt>
                <dd className="font-semibold text-slate-900" suppressHydrationWarning>
                  © {now.getFullYear()} Arkium
                </dd>
              </div>
            </dl>
          </details>
        </section>
      </div>
    </footer>
  )

  return (
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-gray-50 text-gray-900" suppressHydrationWarning>
        <ThemeInitializer />
        {showAppShell ? (
          <ClanNavigation>
            <div className="flex-1">{children}</div>
            {footer}
          </ClanNavigation>
        ) : (
          <div className="flex min-h-full flex-col">
            <div className="flex-1">{children}</div>
            {footer}
          </div>
        )}
      </body>
    </html>
  )
}
