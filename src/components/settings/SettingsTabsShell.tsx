'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useAuthSession } from '@/hooks/useAuthSession'

export type SettingsTab = { name: string; href: string; description: string }

/**
 * En-tête à onglets des pages Plateforme regroupées (`/settings/clans`, `/settings/players`) — lot 3 de
 * docs/TODO/administration.md. La garde serveur est dans le `layout.tsx` ; ici, seulement le renvoi vers la connexion
 * quand la session manque (la garde serveur laisse alors passer, Q21) et le refus d'un non-SuperUser.
 */
export default function SettingsTabsShell({
  title,
  subtitle,
  trailLabel,
  trailHref,
  tabs,
  children,
}: {
  title: string
  subtitle: string
  trailLabel: string
  trailHref: string
  tabs: SettingsTab[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authenticated, loading, pathname, router])

  if (loading) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-600">Chargement…</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!isSuperUser) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
        <section className="app-panel p-6">
          <h1 className="text-xl font-bold text-gray-900">Accès restreint</h1>
          <p className="mt-2 text-sm text-gray-600">Cette page est réservée au SuperUser.</p>
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour à l’accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel={trailLabel}
        currentHref={trailHref}
        fallbackParent={{ href: '/settings', label: 'Plateforme' }}
      />
      <section className="app-panel p-4 mb-4">
        <SettingsPageHeader title={title} subtitle={subtitle} />
        <div className="mt-4 border-b border-slate-200 dark:border-slate-800">
          <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Onglets">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'border-[var(--theme-ui-accent)] text-[var(--theme-ui-accent-text)]'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  <span>{tab.name}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                      isActive
                        ? 'bg-[var(--theme-ui-accent-soft)] font-medium text-[var(--theme-ui-accent-text)]'
                        : 'bg-slate-100 font-normal text-slate-500'
                    }`}
                  >
                    {tab.description}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>
      </section>

      {children}
    </main>
  )
}
