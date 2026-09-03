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

export default function OwnerHubPage() {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  
  const { loading: sessionLoading, authenticated, permissions, isSuperUser } = useAuthSession()
  const isOwner = isSuperUser || permissions.includes('*')

  const { clanItems, globalItems } = useSettingsHubItems('owner-menu', clanId)

  useEffect(() => {
    if (sessionLoading) return
    if (!authenticated || !isOwner) {
      router.replace(clanId ? `/clans/${clanId}/overview` : '/clans')
    }
  }, [authenticated, isOwner, clanId, router, sessionLoading])

  if (sessionLoading || !authenticated || !isOwner) return null

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="Propriétaire"
        currentHref="/settings/owner"
        fallbackParent={{ href: clanId ? `/clans/${clanId}/overview` : '/clans', label: clanId ? "Vue d'ensemble" : 'Les clans' }}
        hidden
      />
      
      <section className="app-panel p-6">
        <SettingsPageHeader
          title="Propriétaire (Owner)"
          subtitle="Gérez la télémétrie, les intégrations externes et les outils d'infrastructure."
        />
        
        {/* Télémétrie et outils spécifiques au clan */}
        {clanItems.length > 0 ? (
          <div className="mt-8">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
              Télémétrie du clan sélectionné {clanId ? '' : '(Aucun clan sélectionné)'}
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
                  Sélectionnez un clan pour voir les outils de télémétrie ({clanItems.map((i) => i.label).join(', ')}).
                </p>
                <Link href="/clans" className="app-btn app-btn--sm app-btn--primary">
                  Sélectionner un clan
                </Link>
              </div>
            )}
          </div>
        ) : null}

        {/* Infrastructure globale */}
        {globalItems.length > 0 ? (
          <div className="mt-10">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
              Infrastructure globale
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {globalItems.map((item) => (
                <SettingsHubCard key={item.navKey} item={item} />
              ))}
            </div>
          </div>
        ) : null}

        {clanItems.length === 0 && globalItems.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
            Aucun outil propriétaire n&apos;est actuellement visible pour votre profil.
          </div>
        ) : null}
      </section>
    </main>
  )
}
