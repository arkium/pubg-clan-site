'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Settings, Users, Monitor } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function ClanSettingsHub() {
  const params = useParams()
  const router = useRouter()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  
  const { loading: sessionLoading, authenticated, permissions, isSuperUser } = useAuthSession()
  const canManageSettings = isSuperUser || permissions.includes('*') || permissions.includes('manage_settings')

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (!clanId || sessionLoading) return
    if (!authenticated || !canManageSettings) {
      router.replace(`/clans/${clanId}/overview`)
    }
  }, [authenticated, canManageSettings, clanId, router, sessionLoading])

  if (!clanId || sessionLoading || !authenticated || !canManageSettings) return null

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="Paramètres"
        currentHref={`/clans/${clanId}/settings`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />
      
      <section className="app-panel p-6">
        <SettingsPageHeader
          title="Paramètres du clan"
          subtitle="Configurez les accès, les rôles et l'apparence de votre clan."
        />
        
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href={`/clans/${clanId}/settings/members`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center">
            <Users className="w-8 h-8 text-blue-500 mb-3" />
            <h3 className="text-base font-semibold text-gray-900">Joueurs et rôles</h3>
            <p className="mt-2 text-sm text-gray-500">Gérez les membres du clan et leurs permissions d'accès.</p>
          </Link>
          <Link href={`/clans/${clanId}/settings/login-welcome`} className="flex flex-col items-center justify-center p-6 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors text-center">
            <Monitor className="w-8 h-8 text-emerald-500 mb-3" />
            <h3 className="text-base font-semibold text-gray-900">Accueil login</h3>
            <p className="mt-2 text-sm text-gray-500">Personnalisez l'écran d'accueil pour les joueurs non connectés.</p>
          </Link>
        </div>
      </section>
    </main>
  )
}
