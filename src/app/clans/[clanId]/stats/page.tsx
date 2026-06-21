'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import SectionNav from '@/components/SectionNav'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useSelectedClan } from '@/hooks/useSelectedClan'

type TelemetryPeriod = 'week' | 'month' | 'all'

type ClanPlaystyleRow = {
  memberId: number
  displayName: string
  pubgPlayerName: string
  aggressionScore: number
  supportScore: number
  zoneDisciplineScore: number
  avgBlueZoneHits: number
  avgFirstContactPhase: number
  avgCircleDelaySeconds: number
  avgCircleDelayPercent: number
  avgSafeZonePresencePercent: number
  avgOnFootDistanceMeters: number
  avgVehicleDistanceMeters: number
  avgDamageTaken: number
  avgHealsUsed: number
  avgHealAmount: number
  avgBoostsUsed: number
  maxVehicleSpeedKph: number
  avgVehicleRideEvents: number
  avgVehicleLeaveEvents: number
  avgPositionEvents: number
  matchesPlayed: number
}

type ClanPlaystyleResponse = {
  ok: boolean
  clanId: number
  period: TelemetryPeriod
  periodKey: string
  count: number
  rows: ClanPlaystyleRow[]
}

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

const PLAYSTYLE_PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
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

function formatSeconds(value: number) {
  return `${Math.max(0, value).toFixed(1)} s`
}

function formatTelemetryScore(value: number) {
  return Math.max(0, value).toFixed(1)
}

function formatTelemetryPercent(value: number) {
  return `${formatTelemetryScore(value)}%`
}

function formatTelemetryMeters(value: number) {
  return `${Math.max(0, value).toFixed(0)} m`
}

function getTelemetryErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  if ('error' in payload) {
    const errorValue = (payload as { error?: unknown }).error
    if (
      errorValue &&
      typeof errorValue === 'object' &&
      'message' in errorValue &&
      typeof (errorValue as { message?: unknown }).message === 'string'
    ) {
      return (errorValue as { message: string }).message
    }

    if (typeof errorValue === 'string') {
      return errorValue
    }
  }

  return fallback
}

function computePlaystyleAverages(rows: ClanPlaystyleRow[]) {
  if (rows.length === 0) {
    return {
      aggression: 0,
      support: 0,
      zoneDiscipline: 0,
      avgBlueZoneHits: 0,
      avgFirstContactPhase: 0,
      avgCircleDelaySeconds: 0,
      avgCircleDelayPercent: 0,
      avgSafeZonePresencePercent: 0,
      avgOnFootDistanceMeters: 0,
      avgVehicleDistanceMeters: 0,
      avgDamageTaken: 0,
      avgHealsUsed: 0,
      avgHealAmount: 0,
      avgBoostsUsed: 0,
      maxVehicleSpeedKph: 0,
      avgVehicleRideEvents: 0,
      avgVehicleLeaveEvents: 0,
      avgPositionEvents: 0,
    }
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.aggression += row.aggressionScore
      acc.support += row.supportScore
      acc.zoneDiscipline += row.zoneDisciplineScore
      acc.avgBlueZoneHits += row.avgBlueZoneHits
      acc.avgFirstContactPhase += row.avgFirstContactPhase
      acc.avgCircleDelaySeconds += row.avgCircleDelaySeconds
      acc.avgCircleDelayPercent += row.avgCircleDelayPercent
      acc.avgSafeZonePresencePercent += row.avgSafeZonePresencePercent
      acc.avgOnFootDistanceMeters += row.avgOnFootDistanceMeters
      acc.avgVehicleDistanceMeters += row.avgVehicleDistanceMeters
      acc.avgDamageTaken += row.avgDamageTaken
      acc.avgHealsUsed += row.avgHealsUsed
      acc.avgHealAmount += row.avgHealAmount
      acc.avgBoostsUsed += row.avgBoostsUsed
      acc.maxVehicleSpeedKph += row.maxVehicleSpeedKph
      acc.avgVehicleRideEvents += row.avgVehicleRideEvents
      acc.avgVehicleLeaveEvents += row.avgVehicleLeaveEvents
      acc.avgPositionEvents += row.avgPositionEvents
      return acc
    },
    {
      aggression: 0,
      support: 0,
      zoneDiscipline: 0,
      avgBlueZoneHits: 0,
      avgFirstContactPhase: 0,
      avgCircleDelaySeconds: 0,
        avgCircleDelayPercent: 0,
        avgSafeZonePresencePercent: 0,
        avgOnFootDistanceMeters: 0,
        avgVehicleDistanceMeters: 0,
        avgDamageTaken: 0,
        avgHealsUsed: 0,
        avgHealAmount: 0,
        avgBoostsUsed: 0,
        maxVehicleSpeedKph: 0,
        avgVehicleRideEvents: 0,
        avgVehicleLeaveEvents: 0,
        avgPositionEvents: 0,
    }
  )

  return {
    aggression: totals.aggression / rows.length,
    support: totals.support / rows.length,
    zoneDiscipline: totals.zoneDiscipline / rows.length,
    avgBlueZoneHits: totals.avgBlueZoneHits / rows.length,
    avgFirstContactPhase: totals.avgFirstContactPhase / rows.length,
    avgCircleDelaySeconds: totals.avgCircleDelaySeconds / rows.length,
      avgCircleDelayPercent: totals.avgCircleDelayPercent / rows.length,
      avgSafeZonePresencePercent: totals.avgSafeZonePresencePercent / rows.length,
      avgOnFootDistanceMeters: totals.avgOnFootDistanceMeters / rows.length,
      avgVehicleDistanceMeters: totals.avgVehicleDistanceMeters / rows.length,
      avgDamageTaken: totals.avgDamageTaken / rows.length,
      avgHealsUsed: totals.avgHealsUsed / rows.length,
      avgHealAmount: totals.avgHealAmount / rows.length,
      avgBoostsUsed: totals.avgBoostsUsed / rows.length,
      maxVehicleSpeedKph: totals.maxVehicleSpeedKph / rows.length,
      avgVehicleRideEvents: totals.avgVehicleRideEvents / rows.length,
      avgVehicleLeaveEvents: totals.avgVehicleLeaveEvents / rows.length,
      avgPositionEvents: totals.avgPositionEvents / rows.length,
  }
}

function hasZoneDelayCoverage(rows: ClanPlaystyleRow[]) {
  if (rows.length === 0) {
    return false
  }

  return rows.some((row) => row.avgCircleDelaySeconds > 0 || row.avgCircleDelayPercent > 0)
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
  const [telemetryPeriod, setTelemetryPeriod] = useState<TelemetryPeriod>('week')
  const [playstyleRows, setPlaystyleRows] = useState<ClanPlaystyleRow[]>([])
  const [loadingPlaystyle, setLoadingPlaystyle] = useState(false)
  const [playstyleError, setPlaystyleError] = useState('')

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

  useEffect(() => {
    if (!clanId) {
      return
    }

    let cancelled = false

    async function loadPlaystyleTelemetry() {
      try {
        setLoadingPlaystyle(true)
        setPlaystyleError('')

        const response = await fetch(`/api/clans/${clanId}/telemetry/playstyle?period=${telemetryPeriod}`, {
          cache: 'no-store',
        })
        const payload = (await response.json()) as ClanPlaystyleResponse | { error?: unknown }

        if (!response.ok) {
          throw new Error(
            getTelemetryErrorMessage(payload, 'Impossible de charger la telemetrie playstyle du clan')
          )
        }

        if (!cancelled) {
          setPlaystyleRows((payload as ClanPlaystyleResponse).rows ?? [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setPlaystyleRows([])
          setPlaystyleError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger la telemetrie playstyle du clan'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingPlaystyle(false)
        }
      }
    }

    void loadPlaystyleTelemetry()

    return () => {
      cancelled = true
    }
  }, [clanId, telemetryPeriod])

  const groupedMetrics = useMemo(() => {
    const members = data?.members ?? []

    return METRIC_GROUPS.map((group) => ({
      title: group.title,
      rows: group.metrics.map((metric) => computeMetric(metric, members)),
    }))
  }, [data])

  const playstyleAverages = useMemo(() => computePlaystyleAverages(playstyleRows), [playstyleRows])
  const zoneDelayCoverage = useMemo(() => hasZoneDelayCoverage(playstyleRows), [playstyleRows])
  const playstyleTopAggressive = useMemo(
    () => [...playstyleRows].sort((a, b) => b.aggressionScore - a.aggressionScore).slice(0, 3),
    [playstyleRows]
  )
  const playstyleTopSupport = useMemo(
    () => [...playstyleRows].sort((a, b) => b.supportScore - a.supportScore).slice(0, 3),
    [playstyleRows]
  )
  const playstyleTopDiscipline = useMemo(
    () => [...playstyleRows].sort((a, b) => b.zoneDisciplineScore - a.zoneDisciplineScore).slice(0, 3),
    [playstyleRows]
  )

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
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {data?.clan?.name ?? `Clan #${clanId}`} | Clan
            </h1>
            <p className="text-sm text-gray-600">Vue clan complete avec top 3 pour chaque statistique.</p>
            <SectionNav section="clan-section" />
          </div>
        </div>
      </header>

      {loading ? <p className="mb-6 text-sm text-gray-600">Chargement des statistiques du clan...</p> : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        data && data.members.length > 0 ? (
          <div className="space-y-6">
            <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Carte playstyle clan</h2>
                  <p className="text-sm text-gray-600">Repartition agressif / support / discipline zone via telemetry.</p>
                </div>
                <SegmentedControl
                  options={PLAYSTYLE_PERIOD_OPTIONS}
                  value={telemetryPeriod}
                  onChange={setTelemetryPeriod}
                  size="sm"
                  fullWidthOnMobile
                  className="w-full sm:w-auto"
                />
              </div>

              {loadingPlaystyle ? <p className="text-sm text-gray-600">Chargement de la telemetrie playstyle...</p> : null}
              {playstyleError ? <p className="text-sm text-amber-700">{playstyleError}</p> : null}

              {!loadingPlaystyle && !playstyleError ? (
                playstyleRows.length > 0 ? (
                  <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-4">
                      <article className="rounded border border-red-200 bg-red-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-red-700">Agressivite moyenne (%)</p>
                        <p className="mt-1 text-xl font-semibold text-red-900">{formatTelemetryPercent(playstyleAverages.aggression)}</p>
                      </article>
                      <article className="rounded border border-sky-200 bg-sky-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-sky-700">Support moyen (%)</p>
                        <p className="mt-1 text-xl font-semibold text-sky-900">{formatTelemetryPercent(playstyleAverages.support)}</p>
                      </article>
                      <article className="rounded border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-emerald-700">Discipline zone moyenne (%)</p>
                        <p className="mt-1 text-xl font-semibold text-emerald-900">{formatTelemetryPercent(playstyleAverages.zoneDiscipline)}</p>
                      </article>
                    </div>

                    <div className="mb-4 grid gap-3 sm:grid-cols-4">
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Blue zone hits moyens (evt / match)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.avgBlueZoneHits)}</p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">First contact moyen (phase)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.avgFirstContactPhase)}</p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Retard cercle moyen (s)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {zoneDelayCoverage ? formatSeconds(playstyleAverages.avgCircleDelaySeconds) : 'N/D'}
                        </p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Temps hors zone moyen (%)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {zoneDelayCoverage ? formatTelemetryPercent(playstyleAverages.avgCircleDelayPercent) : 'N/D'}
                        </p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Presence safe zone moyenne (%)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryPercent(playstyleAverages.avgSafeZonePresencePercent)}</p>
                      </article>
                    </div>

                    <div className="mb-4 grid gap-3 sm:grid-cols-3">
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Distance a pied moyenne</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryMeters(playstyleAverages.avgOnFootDistanceMeters)}</p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Distance vehicule moyenne</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryMeters(playstyleAverages.avgVehicleDistanceMeters)}</p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Degats recus moyens</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.avgDamageTaken)}</p>
                      </article>
                    </div>

                    <div className="mb-4 grid gap-3 sm:grid-cols-4">
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Soins utilises (moy / match)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.avgHealsUsed)}</p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">HP soignes (moy / match)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.avgHealAmount)}</p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Boosts utilises (moy / match)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.avgBoostsUsed)}</p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Vitesse max vehicule (km/h)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.maxVehicleSpeedKph)}</p>
                      </article>
                    </div>

                    <div className="mb-4 grid gap-3 sm:grid-cols-3">
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Montee vehicule (evt / match)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.avgVehicleRideEvents)}</p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Sortie vehicule (evt / match)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.avgVehicleLeaveEvents)}</p>
                      </article>
                      <article className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-600">Positions observees (evt / match)</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{formatTelemetryScore(playstyleAverages.avgPositionEvents)}</p>
                      </article>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <article className="rounded border border-gray-200 p-3">
                        <h3 className="mb-2 text-sm font-semibold text-gray-900">Top agressifs</h3>
                        <ul className="space-y-2 text-sm text-gray-700">
                          {playstyleTopAggressive.map((entry) => (
                            <li key={`agg:${entry.memberId}`} className="flex items-center justify-between gap-2">
                              <span className="truncate">{entry.displayName}</span>
                              <span className="font-semibold text-red-700">{formatTelemetryPercent(entry.aggressionScore)}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                      <article className="rounded border border-gray-200 p-3">
                        <h3 className="mb-2 text-sm font-semibold text-gray-900">Top supports</h3>
                        <ul className="space-y-2 text-sm text-gray-700">
                          {playstyleTopSupport.map((entry) => (
                            <li key={`sup:${entry.memberId}`} className="flex items-center justify-between gap-2">
                              <span className="truncate">{entry.displayName}</span>
                              <span className="font-semibold text-sky-700">{formatTelemetryPercent(entry.supportScore)}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                      <article className="rounded border border-gray-200 p-3">
                        <h3 className="mb-2 text-sm font-semibold text-gray-900">Top disciplines zone</h3>
                        <ul className="space-y-2 text-sm text-gray-700">
                          {playstyleTopDiscipline.map((entry) => (
                            <li key={`disc:${entry.memberId}`} className="flex items-center justify-between gap-2">
                              <span className="truncate">{entry.displayName}</span>
                              <span className="font-semibold text-emerald-700">{formatTelemetryPercent(entry.zoneDisciplineScore)}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-600">Aucune donnee telemetry playstyle pour cette periode.</p>
                )
              ) : null}
            </section>

            {groupedMetrics.map((group) => (
              <section key={group.title} className="rounded border border-gray-200 bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className="mb-4 flex w-full select-none items-center justify-between gap-3 rounded px-1 py-1 text-left transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
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
