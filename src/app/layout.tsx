import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import ClanNavigation from '@/components/ClanNavigation'
import { getSessionFromToken } from '@/lib/auth-session'
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
  const setupState = await getSetupState()
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('pubg_clan_session')?.value ?? null
  const session = await getSessionFromToken(sessionToken)

  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-gray-50 text-gray-900">
        {setupState === 'completed' && session ? <ClanNavigation /> : null}
        {children}
      </body>
    </html>
  )
}
