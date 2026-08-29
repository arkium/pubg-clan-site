'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Users } from 'lucide-react'

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
  const [hoveredClan, setHoveredClan] = useState<Clan | null>(null)

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
    switchToClan(clanId)
  }

  function switchToClan(clanId: number) {
    const changed = setClanId(clanId)
    if (!changed) {
      setError('Seul le Owner peut changer de clan.')
      return
    }

    router.push(`/clans/${clanId}/overview`)
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
      <header
        className="relative mb-6 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat transition-all duration-500 ease-in-out sm:min-h-[13rem]"
        style={{ backgroundImage: `url('${hoveredClan?.imageUrl || '/clan_banner.jpg'}')`, backgroundPosition: 'center 35%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f19] via-[#0b0f19]/80 to-transparent transition-opacity duration-500 ease-in-out" />
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Users className="h-4 w-4 text-blue-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Sélectionnez votre clan</h1>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
            Choisissez le clan à consulter pour afficher les membres et les données associées.
          </p>
        </div>
      </header>

      <ClanSelector
        clans={clans}
        loading={loading}
        error={error}
        activeClanId={activeClanId}
        onSelect={handleSelect}
        onHoverClan={setHoveredClan}
        onRetry={() => setRetryToken((token) => token + 1)}
        isSuperUser={isSuperUser}
      />
    </main>
  )
}
