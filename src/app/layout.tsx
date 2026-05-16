import type { Metadata } from 'next'

import ClanNavigation from '@/components/ClanNavigation'

import './globals.css'

export const metadata: Metadata = {
  title: 'PUBG Clan Site',
  description: 'Gestion et statistiques des clans PUBG',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-gray-50 text-gray-900">
        <ClanNavigation />
        {children}
      </body>
    </html>
  )
}
