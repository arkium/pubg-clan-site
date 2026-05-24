'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import MemberLifetimeStatsPanel from '@/components/MemberLifetimeStatsPanel'
import MemberSectionNav from '@/components/MemberSectionNav'
import NotificationBell from '@/components/NotificationBell'

type LifetimeStats = {
  combat: {
    kills: number
    deaths: number
    kdRatio: number
    headshots: number
    assists: number
    knockouts: number
    highestKillstreak: number
    longestKill: number
    teamkills: number
    suicides: number
  }
  victory: {
    wins: number
    losses: number
    winLossRatio: number
    longestTimeAlive: number
  }
  support: {
    teammatesRevived: number
    boostsUsed: number
    healed: number
  }
  vehicle: {
    vehiclesDestroyed: number
    roadkills: number
  }
  movement: {
    drivenDistance: number
    walkedDistance: number
    swamDistance: number
  }
  other: {
    weaponsPicked: number
    damageGiven: number
  }
}

type ClanMetricRanks = Record<string, 1 | 2 | 3 | null>

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function MemberStatsPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)
  const [clanRanks, setClanRanks] = useState<ClanMetricRanks>({})
  const [loadingStats, setLoadingStats] = useState(true)
  const [statsError, setStatsError] = useState('')
  const [refreshingStats, setRefreshingStats] = useState(false)

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadStats() {
      setLoadingStats(true)
      setStatsError('')

      try {
        const response = await fetch(`/api/members/${memberId}/stats`)
        const payload = (await response.json()) as {
          stats?: LifetimeStats
          clanRanks?: ClanMetricRanks
          lastRefreshedAt?: string | null
          error?: string
        }

        if (!response.ok) {
          throw new Error(payload.error ?? 'Impossible de charger les statistiques globales')
        }

        if (!cancelled) {
          setLifetimeStats(payload.stats ?? null)
          setClanRanks(payload.clanRanks ?? {})
          setLastRefreshedAt(payload.lastRefreshedAt ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatsError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger les statistiques globales'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingStats(false)
        }
      }
    }

    void loadStats()

    return () => {
      cancelled = true
    }
  }, [memberId])

  async function handleRefreshStats() {
    if (!memberId) {
      return
    }

    setRefreshingStats(true)
    setStatsError('')

    try {
      const response = await fetch(`/api/members/${memberId}/stats`, { method: 'POST' })
      const payload = (await response.json()) as {
        stats?: LifetimeStats
        clanRanks?: ClanMetricRanks
        lastRefreshedAt?: string | null
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Impossible d\'actualiser les statistiques globales')
      }

      setLifetimeStats(payload.stats ?? null)
      setClanRanks(payload.clanRanks ?? {})
      setLastRefreshedAt(payload.lastRefreshedAt ?? null)
    } catch (refreshError) {
      setStatsError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Impossible d\'actualiser les statistiques globales'
      )
    } finally {
      setRefreshingStats(false)
    }
  }

  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">ID joueur invalide.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques globales</h1>
          <p className="text-sm text-gray-600">
            Vue complete des statistiques PUBG cumulees du joueur.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationBell memberId={memberId} />
          <Link
            href="/members"
            className="inline-flex items-center justify-center rounded border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Retour aux membres
          </Link>
        </div>
      </div>

      <MemberSectionNav memberId={memberId} />

      {statsError && lifetimeStats ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {statsError}
        </div>
      ) : null}

      <MemberLifetimeStatsPanel
        lifetimeStats={lifetimeStats}
        clanRanks={clanRanks}
        loadingStats={loadingStats}
        statsError={statsError}
        lastRefreshedAt={lastRefreshedAt}
        refreshingStats={refreshingStats}
        onRefresh={() => void handleRefreshStats()}
      />
    </main>
  )
}