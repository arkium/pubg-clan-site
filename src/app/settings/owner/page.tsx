'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import Link from 'next/link'
import { Mail, Globe, LayoutDashboard, History, AlertTriangle, RefreshCw } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'

export default function OwnerHubPage() {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  
  const { loading: sessionLoading, authenticated, permissions, isSuperUser } = useAuthSession()
  const isOwner = isSuperUser || permissions.includes('*')

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
        
        {/* Télémétrie du Clan */}
        <div className="mt-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            Télémétrie du clan sélectionné {clanId ? '' : '(Aucun clan sélectionné)'}
          </h2>
          
          {clanId ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link href={`/clans/${clanId}/telemetry/dashboard`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
                <LayoutDashboard className="w-8 h-8 text-blue-500 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Dashboard Télémétrie</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Statistiques de synchronisation des matchs.</p>
              </Link>
              <Link href={`/clans/${clanId}/telemetry/matches`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
                <History className="w-8 h-8 text-indigo-500 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Historique des matchs</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Parcourir les matchs synchronisés.</p>
              </Link>
              <Link href={`/clans/${clanId}/telemetry/errors`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
                <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Erreurs de synchro</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Détails des matchs en erreur.</p>
              </Link>
              <Link href={`/clans/${clanId}/telemetry/sync-batch-manual`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
                <RefreshCw className="w-8 h-8 text-emerald-500 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Synchro Manuelle</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Forcer la synchronisation par lots.</p>
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-900/20">
              <p className="text-amber-800 dark:text-amber-200">
                Sélectionnez un clan pour voir les outils de télémétrie.
              </p>
            </div>
          )}
        </div>

        {/* Paramètres d'Infrastructure */}
        <div className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            Infrastructure globale
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/settings/email-delivery" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <Mail className="w-8 h-8 text-purple-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Envoi d'emails</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Tester et vérifier l'envoi d'emails transactionnels.</p>
            </Link>
            <Link href="/settings/pubg-api" className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
              <Globe className="w-8 h-8 text-sky-500 mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Monitoring PUBG API</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">État de santé et quotas de l'API PUBG officielle.</p>
            </Link>
          </div>
        </div>

      </section>
    </main>
  )
}
