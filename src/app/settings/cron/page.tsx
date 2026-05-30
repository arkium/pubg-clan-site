'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

export default function CronSettingsEntryPage() {
  const router = useRouter()
  const { loading, authenticated } = useAuthSession()
  const { clanId, hydrated } = useSelectedClan()

  useEffect(() => {
    if (loading) {
      return
    }

    if (!authenticated) {
      router.replace('/login?redirect=/settings/cron')
      return
    }

    if (!hydrated || !clanId) {
      router.replace('/clans')
      return
    }

    router.replace(`/clans/${clanId}/settings/cron`)
  }, [authenticated, clanId, hydrated, loading, router])

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full rounded-3xl border border-slate-200 bg-white/95 p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Settings cron</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Redirection en cours</h1>
        <p className="mt-2 text-sm text-slate-600">Chargement de la page cron du clan actif...</p>
      </div>
    </main>
  )
}