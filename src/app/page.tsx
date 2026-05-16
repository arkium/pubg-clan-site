'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useSelectedClan } from '@/hooks/useSelectedClan'

export default function Home() {
  const router = useRouter()
  const { clanId, hydrated } = useSelectedClan()

  useEffect(() => {
    if (!hydrated) {
      return
    }

    if (clanId) {
      router.replace(`/clans/${clanId}/members`)
      return
    }

    router.replace('/clans')
  }, [clanId, hydrated, router])

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <p className="text-sm text-gray-600">Redirection...</p>
    </main>
  )
}
