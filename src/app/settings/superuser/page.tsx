'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import Link from 'next/link'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useSettingsHubItems } from '@/hooks/useSettingsHubItems'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SettingsHubCard from '@/components/settings/SettingsHubCard'

export default function SuperUserHubPage() {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  
  const { loading: sessionLoading, authenticated, isSuperUser } = useAuthSession()

  const { clanItems, globalItems } = useSettingsHubItems('superuser-menu', clanId)

  useEffect(() => {
    if (sessionLoading) return
    if (!authenticated || !isSuperUser) {
      router.replace(clanId ? `/clans/${clanId}/overview` : '/clans')
    }
  }, [authenticated, isSuperUser, clanId, router, sessionLoading])

  if (sessionLoading || !authenticated || !isSuperUser) return null

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="SuperUser"
        currentHref="/settings/superuser"
        fallbackParent={{ href: clanId ? `/clans/${clanId}/overview` : '/clans', label: clanId ? "Vue d'ensemble" : 'Les clans' }}
        hidden
      />
      
      <section className="app-panel p-6">
        <SettingsPageHeader
          title="SuperUser"
          subtitle="Gérez l'ensemble de la plateforme, les tâches planifiées et le dépannage avancé."
        />
        
        {/* Tâches transverses (Cross-Clan) */}
        {globalItems.length > 0 ? (
          <div className="mt-8">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
              Plateforme Globale (Transverse)
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {globalItems.map((item) => (
                <SettingsHubCard key={item.navKey} item={item} />
              ))}
            </div>
          </div>
        ) : null}

        {/* Tâches Spécifiques Clan */}
        {clanItems.length > 0 ? (
          <div className="mt-10">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
              Dépannage du clan sélectionné {clanId ? '' : '(Aucun clan sélectionné)'}
            </h2>
            
            {clanId ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {clanItems.map((item) => (
                  <SettingsHubCard key={item.navKey} item={item} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-900/20">
                <p className="mb-3 text-amber-800 dark:text-amber-200">
                  Sélectionnez un clan pour voir les outils de dépannage avancés liés au clan ({clanItems.map((i) => i.label).join(', ')}).
                </p>
                <Link href="/clans" className="app-btn app-btn--sm app-btn--primary">
                  Sélectionner un clan
                </Link>
              </div>
            )}
          </div>
        ) : null}

        {clanItems.length === 0 && globalItems.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
            Aucun outil SuperUser n&apos;est actuellement visible pour votre profil.
          </div>
        ) : null}
      </section>
    </main>
  )
}
