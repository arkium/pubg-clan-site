'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import Link from 'next/link'
import { Users, Monitor, Map, Swords, ListPlus, Activity } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'

export default function AdminHubPage() {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  
  const { loading: sessionLoading, authenticated, permissions, isSuperUser } = useAuthSession()
  const hasWildcard = permissions.includes('*')
  const canManageMembers = hasWildcard || permissions.includes('manage_members')
  const canManageRoles = hasWildcard || permissions.includes('manage_roles')
  const canManageSettings = hasWildcard || permissions.includes('manage_settings')
  
  const isAdmin = isSuperUser || canManageMembers || canManageRoles || canManageSettings

  useEffect(() => {
    if (sessionLoading) return
    if (!authenticated || !isAdmin) {
      router.replace(clanId ? `/clans/${clanId}/overview` : '/clans')
    }
  }, [authenticated, isAdmin, clanId, router, sessionLoading])

  if (sessionLoading || !authenticated || !isAdmin) return null

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="Administration"
        currentHref="/settings/admin"
        fallbackParent={{ href: clanId ? `/clans/${clanId}/overview` : '/clans', label: clanId ? "Vue d'ensemble" : 'Les clans' }}
        hidden
      />
      
      <section className="app-panel p-6">
        <SettingsPageHeader
          title="Administration"
          subtitle="Gérez les paramètres globaux et les configurations spécifiques au clan sélectionné."
        />
        
        {/* Paramètres spécifiques au clan */}
        <div className="mt-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            Paramètres du clan sélectionné {clanId ? '' : '(Aucun clan sélectionné)'}
          </h2>
          
          {clanId ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link href={`/clans/${clanId}/settings/members`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
                <Users className="w-8 h-8 text-blue-500 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Joueurs et rôles</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Gérez les membres du clan et leurs permissions d'accès.</p>
              </Link>
              <Link href={`/clans/${clanId}/settings/login-welcome`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
                <Monitor className="w-8 h-8 text-emerald-500 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Accueil login</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Personnalisez l'écran d'accueil pour les joueurs non connectés.</p>
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-900/20">
              <p className="text-amber-800 dark:text-amber-200">
                Veuillez d'abord sélectionner un clan depuis la liste des clans pour accéder à ces paramètres.
              </p>
            </div>
          )}
        </div>

        {/* Paramètres globaux (Dictionnaires) */}
        <div className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            Dictionnaires globaux
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/settings/map-labels" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <Map className="w-8 h-8 text-amber-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Cartes (Maps)</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Traduction et labels des cartes PUBG.</p>
            </Link>
            <Link href="/settings/weapon-labels" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <Swords className="w-8 h-8 text-red-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Armes</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Traduction et labels des armes.</p>
            </Link>
            <Link href="/settings/weapon-categories" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <ListPlus className="w-8 h-8 text-purple-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Catégories d'armes</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Groupes d'armes pour les statistiques.</p>
            </Link>
            <Link href="/settings/phase-labels" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <Activity className="w-8 h-8 text-sky-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Phases de jeu</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Labels des phases de zone bleue.</p>
            </Link>
          </div>
        </div>

      </section>
    </main>
  )
}
