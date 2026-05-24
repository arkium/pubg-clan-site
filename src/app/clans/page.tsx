'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import ClanSelector, { type Clan } from '@/components/ClanSelector'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

export default function ClansPage() {
  const router = useRouter()
  const { setClanId } = useSelectedClan()
  const { loading: authLoading, authenticated, permissions } = useAuthSession()
  const [clans, setClans] = useState<Clan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const hasWildcard = permissions.includes('*')
  const canSwitchClan =
    hasWildcard ||
    permissions.includes('manage_members') ||
    permissions.includes('manage_roles') ||
    permissions.includes('manage_settings')

  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!authenticated) {
      router.replace('/login')
      return
    }

    if (!canSwitchClan) {
      router.replace('/members')
    }
  }, [authLoading, authenticated, canSwitchClan, router])

  useEffect(() => {
    if (authLoading || !authenticated || !canSwitchClan) {
      return
    }

    let cancelled = false

    async function fetchClans() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch('/api/clans')
        const data = (await response.json()) as Clan[] | { error?: string }

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Failed to fetch clans')
        }

        if (!cancelled) {
          setClans(data as Clan[])
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch clans')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchClans()

    return () => {
      cancelled = true
    }
  }, [authLoading, authenticated, canSwitchClan])

  function handleSelect(clanId: number) {
    setClanId(clanId)
    router.push('/members')
  }

  if (authLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-gray-600">Verification de la session...</p>
      </main>
    )
  }

  if (!authenticated || !canSwitchClan) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-gray-600">Redirection...</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Sélectionnez votre clan</h1>
      <p className="mb-6 text-sm text-gray-600">
        Choisissez le clan à consulter pour afficher les membres et les données associées.
      </p>

      <ClanSelector clans={clans} loading={loading} error={error} onSelect={handleSelect} />
    </main>
  )
}
