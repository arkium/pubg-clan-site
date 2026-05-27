'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useSelectedClan } from '@/hooks/useSelectedClan'

export default function ManageMembersPage() {
  const router = useRouter()
  const { clanId, hydrated } = useSelectedClan({ redirectIfMissing: false })

  useEffect(() => {
    if (!hydrated) {
      return
    }

    if (clanId) {
      router.replace(`/clans/${clanId}/settings/members`)
      return
    }

    router.replace('/clans')
  }, [clanId, hydrated, router])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-10">
      <p className="text-sm text-slate-600">Redirection vers la page Membres et rôles...</p>
    </main>
  )
}
