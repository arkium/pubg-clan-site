'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useSelectedClan } from '@/hooks/useSelectedClan'

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

type ClanMemberLifetime = {
  memberId: number
  displayName: string
  lastRefreshedAt: string
  stats: LifetimeStats
}

type ClanStatsResponse = {
  clan: {
    id: number
    name: string
    tag: string
  }
  members: ClanMemberLifetime[]
}

type MetricDefinition = {
  key: string
  label: string
  aggregate: 'sum' | 'avg' | 'max'
  rankOrder?: 'asc' | 'desc'
  getValue: (stats: LifetimeStats) => number
  format: (value: number) => string
}

type MetricTopEntry = {
  memberId: number
  displayName: string
  value: number
}

type MetricComputed = {
  metric: MetricDefinition
  clanValue: number
  topThree: MetricTopEntry[]
}

const MEDALS = [
  { iconPath: '/icons/medal-gold.svg', alt: 'Medaille or' },
  { iconPath: '/icons/medal-silver.svg', alt: 'Medaille argent' },
  { iconPath: '/icons/medal-bronze.svg', alt: 'Medaille bronze' },
]

const METRIC_GROUPS: Array<{ title: string; metrics: MetricDefinition[] }> = [
  {
    title: 'Combat',
    metrics: [
      { key: 'combat.kills', label: 'Kills', aggregate: 'sum', getValue: (s) => s.combat.kills, format: formatInteger },
      { key: 'combat.deaths', label: 'Morts', aggregate: 'sum', rankOrder: 'asc', getValue: (s) => s.combat.deaths, format: formatInteger },
      { key: 'combat.kdRatio', label: 'Ratio K/D', aggregate: 'avg', getValue: (s) => s.combat.kdRatio, format: formatRatio },
      { key: 'combat.headshots', label: 'Headshots', aggregate: 'sum', getValue: (s) => s.combat.headshots, format: formatInteger },
      { key: 'combat.assists', label: 'Assists', aggregate: 'sum', getValue: (s) => s.combat.assists, format: formatInteger },
      { key: 'combat.knockouts', label: 'KO', aggregate: 'sum', getValue: (s) => s.combat.knockouts, format: formatInteger },
      { key: 'combat.highestKillstreak', label: 'Serie max', aggregate: 'max', getValue: (s) => s.combat.highestKillstreak, format: formatInteger },
      { key: 'combat.longestKill', label: 'Distance max', aggregate: 'max', getValue: (s) => s.combat.longestKill, format: formatMeters },
      { key: 'combat.teamkills', label: 'Teamkills', aggregate: 'sum', rankOrder: 'desc', getValue: (s) => s.combat.teamkills, format: formatInteger },
      { key: 'combat.suicides', label: 'Suicides', aggregate: 'sum', rankOrder: 'asc', getValue: (s) => s.combat.suicides, format: formatInteger },
    ],
  },
  {
    title: 'Victoires',
    metrics: [
      { key: 'victory.wins', label: 'Victoires', aggregate: 'sum', getValue: (s) => s.victory.wins, format: formatInteger },
      { key: 'victory.losses', label: 'Defaites', aggregate: 'sum', rankOrder: 'asc', getValue: (s) => s.victory.losses, format: formatInteger },
      { key: 'victory.winLossRatio', label: 'Ratio V/D', aggregate: 'avg', getValue: (s) => s.victory.winLossRatio, format: formatRatio },
      { key: 'victory.longestTimeAlive', label: 'Temps max en vie', aggregate: 'max', getValue: (s) => s.victory.longestTimeAlive, format: formatDurationLong },
    ],
  },
  {
    title: 'Support',
    metrics: [
      { key: 'support.teammatesRevived', label: 'Coequipiers releves', aggregate: 'sum', getValue: (s) => s.support.teammatesRevived, format: formatInteger },
      { key: 'support.boostsUsed', label: 'Boosts utilises', aggregate: 'sum', getValue: (s) => s.support.boostsUsed, format: formatInteger },
      { key: 'support.healed', label: 'Soin', aggregate: 'sum', getValue: (s) => s.support.healed, format: formatInteger },
    ],
  },
  {
    title: 'Vehicules',
    metrics: [
      { key: 'vehicle.vehiclesDestroyed', label: 'Vehicules detruits', aggregate: 'sum', getValue: (s) => s.vehicle.vehiclesDestroyed, format: formatInteger },
      { key: 'vehicle.roadkills', label: 'Roadkills', aggregate: 'sum', getValue: (s) => s.vehicle.roadkills, format: formatInteger },
    ],
  },
  {
    title: 'Deplacements',
    metrics: [
      { key: 'movement.drivenDistance', label: 'Distance en vehicule', aggregate: 'sum', getValue: (s) => s.movement.drivenDistance, format: formatKm },
      { key: 'movement.walkedDistance', label: 'Distance a pied', aggregate: 'sum', getValue: (s) => s.movement.walkedDistance, format: formatKm },
      { key: 'movement.swamDistance', label: 'Distance a la nage', aggregate: 'sum', getValue: (s) => s.movement.swamDistance, format: formatKm },
    ],
  },
  {
    title: 'Autres',
    metrics: [
      { key: 'other.weaponsPicked', label: 'Armes ramassees', aggregate: 'sum', getValue: (s) => s.other.weaponsPicked, format: formatInteger },
      { key: 'other.damageGiven', label: 'Degats infliges', aggregate: 'sum', getValue: (s) => s.other.damageGiven, format: formatFloat },
    ],
  },
]

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString('fr-FR')
}

function formatFloat(value: number) {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

function formatRatio(value: number) {
  return value.toFixed(2)
}

function formatMeters(value: number) {
  return `${value.toFixed(2)} m`
}

function formatKm(value: number) {
  return `${(value / 1000).toFixed(2)} km`
}

function formatDurationLong(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  return `${minutes}m ${remainingSeconds}s`
}

function computeMetric(metric: MetricDefinition, members: ClanMemberLifetime[]): MetricComputed {
  const values = members.map((member) => ({
    memberId: member.memberId,
    displayName: member.displayName,
    value: metric.getValue(member.stats),
  }))

  const topThree = [...values]
    .sort((left, right) => {
      const order = metric.rankOrder ?? 'desc'
      return order === 'asc' ? left.value - right.value : right.value - left.value
    })
    .slice(0, 3)

  if (metric.aggregate === 'avg') {
    const total = values.reduce((acc, entry) => acc + entry.value, 0)
    return {
      metric,
      clanValue: values.length > 0 ? total / values.length : 0,
      topThree,
    }
  }

  if (metric.aggregate === 'max') {
    const max = values.reduce((acc, entry) => Math.max(acc, entry.value), 0)
    return {
      metric,
      clanValue: max,
      topThree,
    }
  }

  return {
    metric,
    clanValue: values.reduce((acc, entry) => acc + entry.value, 0),
    topThree,
  }
}

function TopThreeList({ metric, topThree }: { metric: MetricDefinition; topThree: MetricTopEntry[] }) {
  if (topThree.length === 0) {
    return <p className="text-xs text-gray-500">Aucune donnée</p>
  }

  return (
    <ul className="space-y-1 text-xs text-gray-700">
      {topThree.map((entry, index) => (
        <li key={`${metric.key}:${entry.memberId}`} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 font-medium text-gray-900">
            <Image src={MEDALS[index].iconPath} alt={MEDALS[index].alt} width={14} height={14} />
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
              #{index + 1}
            </span>
            {entry.displayName}
          </span>
          <span>{metric.format(entry.value)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function ClanStatsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [data, setData] = useState<ClanStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(METRIC_GROUPS.map((group) => [group.title, group.title === 'Combat']))
  )

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (!clanId) {
      return
    }

    let cancelled = false

    async function loadClanStats() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/clans/${clanId}/lifetime-stats`)
        const payload = (await response.json()) as ClanStatsResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Impossible de charger les statistiques du clan')
        }

        if (!cancelled) {
          setData(payload as ClanStatsResponse)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les statistiques du clan')
          setData(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadClanStats()

    return () => {
      cancelled = true
    }
  }, [clanId])

  const groupedMetrics = useMemo(() => {
    const members = data?.members ?? []

    return METRIC_GROUPS.map((group) => ({
      title: group.title,
      rows: group.metrics.map((metric) => computeMetric(metric, members)),
    }))
  }, [data])

  if (!clanId) {
    return null
  }

  function toggleGroup(groupTitle: string) {
    setExpandedGroups((current) => ({
      ...current,
      [groupTitle]: !current[groupTitle],
    }))
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {data?.clan?.name ?? `Clan #${clanId}`} | Statistiques globales
          </h1>
          <p className="text-sm text-gray-600">Vue clan complete avec top 3 pour chaque statistique.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/clans/${clanId}/leaderboard`}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Classement
          </Link>
          <Link
            href={`/clans/${clanId}/matches`}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Matchs ensemble
          </Link>
        </div>
      </div>

      {loading ? <p className="mb-6 text-sm text-gray-600">Chargement des statistiques du clan...</p> : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        data && data.members.length > 0 ? (
          <div className="space-y-6">
            {groupedMetrics.map((group) => (
              <section key={group.title} className="rounded border border-gray-200 bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className="mb-4 flex w-full items-center justify-between gap-3 rounded px-1 py-1 text-left hover:bg-gray-50"
                  aria-expanded={expandedGroups[group.title]}
                  aria-controls={`group-${group.title}`}
                >
                  <h2 className="text-lg font-semibold text-gray-900">{group.title}</h2>
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition-transform ${
                      expandedGroups[group.title] ? 'rotate-180' : 'rotate-0'
                    }`}
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" focusable="false">
                      <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.12l3.71-3.9a.75.75 0 1 1 1.08 1.04l-4.25 4.46a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" fill="currentColor" />
                    </svg>
                  </span>
                </button>
                {expandedGroups[group.title] ? (
                  <div id={`group-${group.title}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {group.rows.map((row) => (
                      <article key={row.metric.key} className="rounded border border-gray-200 p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900">{row.metric.label}</p>
                          <p className="text-sm font-bold text-blue-700">Clan: {row.metric.format(row.clanValue)}</p>
                        </div>
                        <TopThreeList metric={row.metric} topThree={row.topThree} />
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">Aucune statistique globale disponible pour ce clan.</p>
        )
      ) : null}
    </main>
  )
}
