'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import ClanSelector, { type Clan } from '@/components/ClanSelector'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

export default function ClansPage() {
  const router = useRouter()
  const { clanId: activeClanId, setClanId, syncCanSwitchClan } = useSelectedClan()
  const { loading: authLoading, authenticated, isSuperUser, authDisabled } = useAuthSession()
  const [clans, setClans] = useState<Clan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const [pendingClanId, setPendingClanId] = useState<number | null>(null)

  const isVisitor = !authenticated && authDisabled
  const canSwitchClan = isSuperUser || isVisitor

  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!authenticated && !authDisabled) {
      router.replace('/login')
      return
    }

    // Keep the persisted switch flag in sync with the live session, since the
    // one written at login time can go stale (e.g. SuperUser status granted since).
    if (authenticated) {
      syncCanSwitchClan(isSuperUser)
    }

    if (!canSwitchClan) {
      router.replace('/members')
    }
  }, [authDisabled, authLoading, authenticated, canSwitchClan, isSuperUser, router, syncCanSwitchClan])

  useEffect(() => {
    if (authLoading || (!authenticated && !isVisitor) || !canSwitchClan) {
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
  }, [authLoading, authenticated, canSwitchClan, isVisitor, retryToken])

  function handleSelect(clanId: number) {
    if (activeClanId !== null && activeClanId !== clanId) {
      setPendingClanId(clanId)
      return
    }

    switchToClan(clanId)
  }

  function switchToClan(clanId: number) {
    const changed = setClanId(clanId)
    if (!changed) {
      setError('Seul le Owner peut changer de clan.')
      return
    }

    router.push(`/clans/${clanId}/members`)
  }

  function handleConfirmSwitch() {
    if (pendingClanId === null) {
      return
    }

    switchToClan(pendingClanId)
    setPendingClanId(null)
  }

  function handleCancelSwitch() {
    setPendingClanId(null)
  }

  if (authLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-gray-600">Verification de la session...</p>
      </main>
    )
  }

  if ((!authenticated && !isVisitor) || !canSwitchClan) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-gray-600">Redirection...</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main">
      <div className="app-panel mb-5 p-4">
        <h1 className="text-xl font-bold text-gray-900">Sélectionnez votre clan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Choisissez le clan à consulter pour afficher les membres et les données associées.
        </p>
      </div>

      <ClanSelector
        clans={clans}
        loading={loading}
        error={error}
        activeClanId={activeClanId}
        onSelect={handleSelect}
        onRetry={() => setRetryToken((token) => token + 1)}
        pendingClan={clans.find((clan) => clan.id === pendingClanId) ?? null}
        onConfirmSwitch={handleConfirmSwitch}
        onCancelSwitch={handleCancelSwitch}
      />
    </main>
  )
}
