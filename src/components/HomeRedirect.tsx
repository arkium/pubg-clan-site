'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

export default function HomeRedirect() {
  const router = useRouter()
  const { loading: authLoading, authenticated, authDisabled } = useAuthSession()
  const { clanId, hydrated } = useSelectedClan()

  useEffect(() => {
    if (!hydrated || authLoading) {
      return
    }

    if (!authenticated && !authDisabled) {
      router.replace('/login')
      return
    }

    router.replace('/clans')
  }, [authDisabled, authenticated, authLoading, hydrated, router])

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <p className="text-sm text-gray-600">
        {authLoading ? 'Verification de la session...' : 'Redirection...'}
      </p>
    </main>
  )
}
