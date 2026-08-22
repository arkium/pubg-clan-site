'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import Link from 'next/link'
import { Clock, Download, ShieldAlert, Target, RefreshCw, Crosshair, Wrench } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'

export default function SuperUserHubPage() {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  
  const { loading: sessionLoading, authenticated, isSuperUser } = useAuthSession()

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
        <div className="mt-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            Plateforme Globale (Transverse)
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/settings/cron" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <Clock className="w-8 h-8 text-rose-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Ops Cron</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Pilotage des tâches cron et statut des workers.</p>
            </Link>
            <Link href="/settings/nav-permissions" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <ShieldAlert className="w-8 h-8 text-violet-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Permissions Nav</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Configuration des droits d'accès au menu de navigation.</p>
            </Link>
            <Link href="/settings/match-import" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <Download className="w-8 h-8 text-blue-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Import Manuel</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Forcer l'import d'un match PUBG via son ID.</p>
            </Link>
            <Link href="/settings/opponents" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <Target className="w-8 h-8 text-amber-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Adversaires Globaux</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Liste transverse de tous les adversaires rencontrés.</p>
            </Link>
            <Link href="/settings/telemetry-recoveries" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <RefreshCw className="w-8 h-8 text-emerald-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Recoveries Globales</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Outils de récupération de télémétrie inter-clans.</p>
            </Link>
          </div>
        </div>

        {/* Tâches Spécifiques Clan */}
        <div className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            Dépannage du clan sélectionné {clanId ? '' : '(Aucun clan sélectionné)'}
          </h2>
          
          {clanId ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link href={`/clans/${clanId}/telemetry/opponents`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
                <Crosshair className="w-8 h-8 text-orange-500 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Adversaires du Clan</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Détails des joueurs adverses liés à ce clan.</p>
              </Link>
              <Link href={`/clans/${clanId}/telemetry/recoveries`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
                <Wrench className="w-8 h-8 text-teal-500 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Recoveries Locales</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Dépannage de la télémétrie de ce clan.</p>
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-900/20">
              <p className="text-amber-800 dark:text-amber-200">
                Sélectionnez un clan pour voir les outils de dépannage avancés liés au clan.
              </p>
            </div>
          )}
        </div>

      </section>
    </main>
  )
}
