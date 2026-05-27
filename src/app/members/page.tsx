'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

export default function MembersPage() {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  const { loading: authLoading, authenticated } = useAuthSession()

  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!authenticated) {
      router.replace('/login')
      return
    }

    router.replace(clanId ? `/clans/${clanId}/members` : '/clans')
  }, [authLoading, authenticated, clanId, router])

  return null
}
