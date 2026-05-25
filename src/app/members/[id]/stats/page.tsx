'use client'

import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import MemberLifetimeStatsPanel from '@/components/MemberLifetimeStatsPanel'
import MemberSectionNav from '@/components/MemberSectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'
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

const MEDAL_META: Record<1 | 2 | 3, { label: string; iconPath: string; alt: string }> = {
  1: { label: 'Or', iconPath: '/icons/medal-gold.svg', alt: 'Medaille or' },
  2: { label: 'Argent', iconPath: '/icons/medal-silver.svg', alt: 'Medaille argent' },
  3: { label: 'Bronze', iconPath: '/icons/medal-bronze.svg', alt: 'Medaille bronze' },
}

const METRIC_LABELS: Record<string, string> = {
  'combat.kills': 'Kills',
  'combat.deaths': 'Morts',
  'combat.kdRatio': 'Ratio K/D',
  'combat.headshots': 'Headshots',
  'combat.assists': 'Assists',
  'combat.knockouts': 'KO',
  'combat.highestKillstreak': 'Serie max',
  'combat.longestKill': 'Distance max',
  'victory.wins': 'Victoires',
  'victory.losses': 'Defaites',
  'victory.winLossRatio': 'Ratio V/D',
  'victory.longestTimeAlive': 'Survie max',
  'support.teammatesRevived': 'Reanimation',
  'support.boostsUsed': 'Boosts',
  'support.healed': 'Soin',
  'vehicle.vehiclesDestroyed': 'Vehicules detruits',
  'vehicle.roadkills': 'Roadkills',
  'movement.drivenDistance': 'Distance vehicule',
  'movement.walkedDistance': 'Distance a pied',
  'movement.swamDistance': 'Distance nage',
  'other.weaponsPicked': 'Armes ramassees',
  'other.damageGiven': 'Degats infliges',
}

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

  const medalsByRank = useMemo(() => {
    const grouped: Record<1 | 2 | 3, string[]> = { 1: [], 2: [], 3: [] }

    for (const [metricKey, rank] of Object.entries(clanRanks)) {
      if (!rank) {
        continue
      }

      const label = METRIC_LABELS[metricKey]
      if (!label) {
        continue
      }

      grouped[rank].push(label)
    }

    return grouped
  }, [clanRanks])

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

  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">ID joueur invalide.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6">
        <MemberPageHeader
          title="Statistiques globales"
          subtitle="Vue complete des statistiques PUBG cumulees du joueur."
          actions={<NotificationBell memberId={memberId} />}
        />
      </div>

      <MemberSectionNav memberId={memberId} />

      {statsError && lifetimeStats ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {statsError}
        </div>
      ) : null}

      <section className="mb-4 overflow-hidden rounded-xl border border-amber-300/70 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm ring-1 ring-amber-100">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Resume medailles</h2>
            <p className="text-sm text-gray-700">
              Classements top 3 du joueur sur les metriques globales du clan.
            </p>
          </div>
          <p className="rounded-full border border-amber-200 bg-white px-3 py-1 text-sm font-semibold text-gray-800 shadow-sm">
            Total: {medalsByRank[1].length + medalsByRank[2].length + medalsByRank[3].length}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((rank) => {
            const rankValue = rank as 1 | 2 | 3
            const medal = MEDAL_META[rankValue]
            const labels = medalsByRank[rankValue]

            return (
              <article key={rank} className="rounded-xl border border-white/80 bg-white/85 p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Image src={medal.iconPath} alt={medal.alt} width={20} height={20} />
                  <h3 className="text-base font-semibold text-gray-900">{medal.label}</h3>
                </div>
                <p className="text-3xl font-extrabold leading-none text-gray-900">{labels.length}</p>
                <p className="mt-2 text-sm text-gray-700">
                  {labels.length > 0 ? labels.slice(0, 3).join(', ') : 'Aucune metrique medalisee'}
                </p>
              </article>
            )
          })}
        </div>

        {lifetimeStats ? (
          <div className="mt-3 grid gap-2 rounded-xl border border-white/80 bg-white/80 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-lg bg-white/70 p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Victoires</p>
              <p className="mt-1 text-2xl font-bold leading-none text-gray-900">{lifetimeStats.victory.wins.toLocaleString()}</p>
            </article>
            <article className="rounded-lg bg-white/70 p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Ratio K/D</p>
              <p className="mt-1 text-2xl font-bold leading-none text-gray-900">{lifetimeStats.combat.kdRatio.toFixed(2)}</p>
            </article>
            <article className="rounded-lg bg-white/70 p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Kills</p>
              <p className="mt-1 text-2xl font-bold leading-none text-gray-900">{lifetimeStats.combat.kills.toLocaleString()}</p>
            </article>
            <article className="rounded-lg bg-white/70 p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Degats infliges</p>
              <p className="mt-1 text-2xl font-bold leading-none text-gray-900">{Math.round(lifetimeStats.other.damageGiven).toLocaleString()}</p>
            </article>
          </div>
        ) : null}
      </section>

      <MemberLifetimeStatsPanel
        lifetimeStats={lifetimeStats}
        clanRanks={clanRanks}
        loadingStats={loadingStats}
        statsError={statsError}
        lastRefreshedAt={lastRefreshedAt}
      />
    </main>
  )
}