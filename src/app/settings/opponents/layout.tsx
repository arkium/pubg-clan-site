'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

export default function OpponentsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/opponents')
    }
  }, [authenticated, loading, router])

  if (loading) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-600">Chargement...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!isSuperUser) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
        <NavigationTrail
          currentLabel="Recherche transverse joueurs"
          currentHref="/settings/opponents"
          fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
        />
        <section className="app-panel p-6">
          <h1 className="text-xl font-bold text-amber-900">Acces restreint</h1>
          <p className="mt-2 text-sm text-amber-800">Cette page est reservee au SuperUser.</p>
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour a l'accueil
          </Link>
        </section>
      </main>
    )
  }

  const tabs = [
    { name: 'Clans', href: '/settings/opponents', description: 'Suivis & adverses' },
    { name: 'Joueurs', href: '/settings/opponents/players', description: 'Annuaire transverse' },
    { name: 'Résolution & Cron', href: '/settings/opponents/resolution', description: 'Débit API & backlog' },
    { name: 'Triage API', href: '/settings/opponents/triage', description: 'Comptes en échec' },
  ]

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Recherche transverse joueurs"
        currentHref="/settings/opponents"
        fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
      />
      <section className="app-panel p-4 mb-4">
        <SettingsPageHeader
          title="Adversaires"
          subtitle="Vue transverse des clans suivis et des clans adverses croises en match."
        />
        <div className="mt-4 border-b border-slate-200 dark:border-slate-800">
          <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <span>{tab.name}</span>
                  <span
                    className={`text-[10px] font-normal px-1.5 py-0.5 rounded-md ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-medium'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
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
