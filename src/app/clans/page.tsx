'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import ClanSelector, { type Clan } from '@/components/ClanSelector'
import { useSelectedClan } from '@/hooks/useSelectedClan'

export default function ClansPage() {
  const router = useRouter()
  const { setClanId, canSwitchClan, hydrated } = useSelectedClan()
  const [clans, setClans] = useState<Clan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
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
  }, [])

  function handleSelect(clanId: number) {
    if (!canSwitchClan) {
      setError('Seuls les Owner/Admin peuvent changer de clan.')
      return
    }

    const changed = setClanId(clanId)
    if (!changed) {
      setError('Seuls les Owner/Admin peuvent changer de clan.')
      return
    }

    router.push(`/clans/${clanId}/members`)
  }

  if (hydrated && !canSwitchClan) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Sélection de clan verrouillée</h1>
        <p className="mb-6 text-sm text-gray-600">
          Le clan actif est défini automatiquement depuis votre profil en base de données.
        </p>
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
