'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Bot, CalendarRange, ChartNoAxesColumnIncreasing, RefreshCw } from 'lucide-react'

import SegmentedControl from '@/components/ui/SegmentedControl'
import StickySectionNav, { type StickySectionNavItem } from '@/components/ui/StickySectionNav'
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
  engagement: {
    timePlayedSeconds: number
    activeDays: number
  }
}

type ClanStatsResponse = {
  clan: {
    id: number
    name: string
    tag: string
  }
  members: ClanMemberLifetime[]
  period: TelemetryPeriod
  statsRecalculation: {
    expression: string
    timezone: string
    runsPerDay: number | null
  }
}

type MetricDefinition = {
  key: string
  label: string
  aggregate: 'sum' | 'avg' | 'max'
  rankOrder?: 'asc' | 'desc'
  getValue: (member: ClanMemberLifetime) => number
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
    title: 'Engagement',
    metrics: [
      { key: 'engagement.timePlayed', label: 'Temps de jeu', aggregate: 'sum', getValue: (m) => m.engagement.timePlayedSeconds, format: formatDurationLong },
      { key: 'engagement.activeDays', label: 'Jours actifs', aggregate: 'sum', getValue: (m) => m.engagement.activeDays, format: (v) => `${Math.round(v)} j` },
    ],
  },
  {
    title: 'Combat',
    metrics: [
      { key: 'combat.kills', label: 'Kills', aggregate: 'sum', getValue: (m) => m.stats.combat.kills, format: formatInteger },
      { key: 'combat.deaths', label: 'Morts', aggregate: 'sum', rankOrder: 'asc', getValue: (m) => m.stats.combat.deaths, format: formatInteger },
      { key: 'combat.kdRatio', label: 'Ratio K/D', aggregate: 'avg', getValue: (m) => m.stats.combat.kdRatio, format: formatRatio },
      { key: 'combat.headshots', label: 'Headshots', aggregate: 'sum', getValue: (m) => m.stats.combat.headshots, format: formatInteger },
      { key: 'combat.assists', label: 'Assists', aggregate: 'sum', getValue: (m) => m.stats.combat.assists, format: formatInteger },
      { key: 'combat.knockouts', label: 'KO', aggregate: 'sum', getValue: (m) => m.stats.combat.knockouts, format: formatInteger },
      { key: 'combat.highestKillstreak', label: 'Serie max', aggregate: 'max', getValue: (m) => m.stats.combat.highestKillstreak, format: formatInteger },
      { key: 'combat.longestKill', label: 'Distance max', aggregate: 'max', getValue: (m) => m.stats.combat.longestKill, format: formatMeters },
      { key: 'combat.teamkills', label: 'Teamkills', aggregate: 'sum', rankOrder: 'desc', getValue: (m) => m.stats.combat.teamkills, format: formatInteger },
      { key: 'combat.suicides', label: 'Suicides', aggregate: 'sum', rankOrder: 'asc', getValue: (m) => m.stats.combat.suicides, format: formatInteger },
    ],
  },
  {
    title: 'Victoires',
    metrics: [
      { key: 'victory.wins', label: 'Victoires', aggregate: 'sum', getValue: (m) => m.stats.victory.wins, format: formatInteger },
      { key: 'victory.losses', label: 'Defaites', aggregate: 'sum', rankOrder: 'asc', getValue: (m) => m.stats.victory.losses, format: formatInteger },
      { key: 'victory.winLossRatio', label: 'Ratio V/D', aggregate: 'avg', getValue: (m) => m.stats.victory.winLossRatio, format: formatRatio },
      { key: 'victory.longestTimeAlive', label: 'Temps max en vie', aggregate: 'max', getValue: (m) => m.stats.victory.longestTimeAlive, format: formatDurationLong },
    ],
  },
  {
    title: 'Support',
    metrics: [
      { key: 'support.teammatesRevived', label: 'Coequipiers releves', aggregate: 'sum', getValue: (m) => m.stats.support.teammatesRevived, format: formatInteger },
      { key: 'support.boostsUsed', label: 'Boosts utilises', aggregate: 'sum', getValue: (m) => m.stats.support.boostsUsed, format: formatInteger },
      { key: 'support.healed', label: 'Soin', aggregate: 'sum', getValue: (m) => m.stats.support.healed, format: formatInteger },
    ],
  },
  {
    title: 'Vehicules',
    metrics: [
      { key: 'vehicle.vehiclesDestroyed', label: 'Vehicules detruits', aggregate: 'sum', getValue: (m) => m.stats.vehicle.vehiclesDestroyed, format: formatInteger },
      { key: 'vehicle.roadkills', label: 'Roadkills', aggregate: 'sum', getValue: (m) => m.stats.vehicle.roadkills, format: formatInteger },
    ],
  },
  {
    title: 'Deplacements',
    metrics: [
      { key: 'movement.drivenDistance', label: 'Distance en vehicule', aggregate: 'sum', getValue: (m) => m.stats.movement.drivenDistance, format: formatKm },
      { key: 'movement.walkedDistance', label: 'Distance a pied', aggregate: 'sum', getValue: (m) => m.stats.movement.walkedDistance, format: formatKm },
      { key: 'movement.swamDistance', label: 'Distance a la nage', aggregate: 'sum', getValue: (m) => m.stats.movement.swamDistance, format: formatKm },
    ],
  },
  {
    title: 'Autres',
    metrics: [
      { key: 'other.weaponsPicked', label: 'Armes ramassees', aggregate: 'sum', getValue: (m) => m.stats.other.weaponsPicked, format: formatInteger },
      { key: 'other.damageGiven', label: 'Degats infliges', aggregate: 'sum', getValue: (m) => m.stats.other.damageGiven, format: formatFloat },
    ],
  },
]

const PLAYSTYLE_PERIOD_OPTIONS: Array<{ value: TelemetryPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

type StatsSectionIcon = NonNullable<StickySectionNavItem['icon']>

function getSectionIcon(label: string): StatsSectionIcon {
  if (label === 'Engagement') return 'other' // we reuse the other icon or create a new one, but let's reuse
  if (label === 'Combat') return 'combat'
  if (label === 'Victoires') return 'victory'
  if (label === 'Support') return 'support'
  if (label === 'Vehicules') return 'vehicle'
  if (label === 'Deplacements') return 'movement'
  if (label === 'Autres') return 'other'
  return 'playstyle'
}

const STATS_SECTION_LINKS: StickySectionNavItem[] = [
  { id: 'sec-playstyle', label: 'Playstyle', icon: 'playstyle' as const },
  ...METRIC_GROUPS.map((group, index) => ({
    id: `sec-metric-${index + 1}`,
    label: group.title,
    icon: getSectionIcon(group.title),
  })),
]

function SectionBadgeIcon({ icon }: { icon: StatsSectionIcon }) {
  const shell = 'inline-flex h-4 w-4 items-center justify-center text-cyan-200 shrink-0'

  if (icon === 'combat') {
    return (
      <span className={shell} aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M9.25 2a.75.75 0 0 1 .75.75v1.06a6.2 6.2 0 0 1 5.44 5.44h1.06a.75.75 0 0 1 0 1.5h-1.06A6.2 6.2 0 0 1 10 16.19v1.06a.75.75 0 0 1-1.5 0v-1.06A6.2 6.2 0 0 1 3.06 10.75H2a.75.75 0 0 1 0-1.5h1.06A6.2 6.2 0 0 1 8.5 3.81V2.75A.75.75 0 0 1 9.25 2Zm.75 3.25a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5Zm0 2a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Z" />
        </svg>
      </span>
    )
  }

  if (icon === 'victory') {
    return (
      <span className={shell} aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M5 2.5A1.5 1.5 0 0 0 3.5 4v1.5A3.5 3.5 0 0 0 7 9h.06A3.98 3.98 0 0 0 9 10.73V13H7.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5H11v-2.27A3.98 3.98 0 0 0 12.94 9H13a3.5 3.5 0 0 0 3.5-3.5V4A1.5 1.5 0 0 0 15 2.5H5Zm10 1.5v1.5A2 2 0 0 1 13 7h-.03c.02-.17.03-.33.03-.5V4h2ZM7 6.5c0 .17.01.33.03.5H7a2 2 0 0 1-2-2V4h2v2.5Z" />
        </svg>
      </span>
    )
  }

  if (icon === 'support') {
    return (
      <span className={shell} aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M10 3a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 10 3Zm-5.5 8a2.5 2.5 0 0 1 2.5-2.5H8a.75.75 0 0 1 0 1.5H7A1 1 0 0 0 6 11v2.5A1.5 1.5 0 0 0 7.5 15H12a.75.75 0 0 1 0 1.5H7.5A3 3 0 0 1 4.5 13.5V11Zm8.5 4a.75.75 0 0 1 0-1.5h.5a1 1 0 0 0 1-1V10a1.5 1.5 0 0 0-1.5-1.5H12a.75.75 0 0 1 0-1.5h1a3 3 0 0 1 3 3v2.5a2.5 2.5 0 0 1-2.5 2.5H13Z" />
        </svg>
      </span>
    )
  }

  if (icon === 'vehicle') {
    return (
      <span className={shell} aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5V11a2 2 0 0 1-2 2v1a1 1 0 1 1-2 0v-1H8v1a1 1 0 1 1-2 0v-1a2 2 0 0 1-2-2V6.5ZM6.5 5.5A1 1 0 0 0 5.5 6.5V9h9V6.5a1 1 0 0 0-1-1h-7ZM7 11.25a.75.75 0 1 0 0 1.5h.01a.75.75 0 0 0 0-1.5H7Zm6 0a.75.75 0 1 0 0 1.5h.01a.75.75 0 0 0 0-1.5H13Z" />
        </svg>
      </span>
    )
  }

  if (icon === 'movement') {
    return (
      <span className={shell} aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M3.47 12.53a.75.75 0 0 1 1.06 0l2.22 2.22 3.72-5.57a.75.75 0 0 1 1.11-.14l2.22 1.98 1.67-2.5a.75.75 0 1 1 1.24.84l-2.14 3.2a.75.75 0 0 1-1.11.15l-2.24-2-3.76 5.63a.75.75 0 0 1-1.15.1l-2.8-2.8a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </span>
    )
  }

  if (icon === 'other') {
    return (
      <span className={shell} aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M10 2.5a.75.75 0 0 1 .75.75v.58a6.26 6.26 0 0 1 2.4 1l.4-.4a.75.75 0 0 1 1.06 1.06l-.4.4a6.26 6.26 0 0 1 1 2.4h.58a.75.75 0 0 1 0 1.5h-.58a6.26 6.26 0 0 1-1 2.4l.4.4a.75.75 0 1 1-1.06 1.06l-.4-.4a6.26 6.26 0 0 1-2.4 1v.58a.75.75 0 0 1-1.5 0v-.58a6.26 6.26 0 0 1-2.4-1l-.4.4a.75.75 0 1 1-1.06-1.06l.4-.4a6.26 6.26 0 0 1-1-2.4h-.58a.75.75 0 0 1 0-1.5h.58a6.26 6.26 0 0 1 1-2.4l-.4-.4a.75.75 0 0 1 1.06-1.06l.4.4a6.26 6.26 0 0 1 2.4-1v-.58A.75.75 0 0 1 10 2.5Zm0 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
        </svg>
      </span>
    )
  }

  return (
    <span className={shell} aria-hidden="true">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M10 2.5a.75.75 0 0 1 .75.75v1.62a5.5 5.5 0 0 1 4.38 4.38h1.62a.75.75 0 0 1 0 1.5h-1.62a5.5 5.5 0 0 1-4.38 4.38v1.62a.75.75 0 0 1-1.5 0v-1.62a5.5 5.5 0 0 1-4.38-4.38H3.25a.75.75 0 0 1 0-1.5h1.62a5.5 5.5 0 0 1 4.38-4.38V3.25A.75.75 0 0 1 10 2.5Zm0 3.75a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      </svg>
    </span>
  )
}

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
  // Telemetry distances are stored with a x10 scale; convert to km for UI readability.
  const km = Math.max(0, value) / 10 / 1000
  return `${km.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

function formatTelemetrySpeedKph(value: number) {
  // Vehicle speed follows the same x10 scale in telemetry snapshots.
  const kph = Math.max(0, value) / 10
  return kph.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ArcGauge({ value, color, size = 88 }: { value: number; color: string; size?: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  const arc = c * 0.75
  const fill = arc * Math.min(1, Math.max(0, value / 100))
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
      <g transform="rotate(135 40 40)">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(148,163,184,0.22)"
          strokeWidth="7" strokeDasharray={`${arc} ${c - arc}`} strokeLinecap="round" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color}
          strokeWidth="7" strokeDasharray={`${fill} ${c - fill}`} strokeLinecap="round" />
      </g>
    </svg>
  )
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
    value: metric.getValue(member),
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
  const [telemetryPeriod, setTelemetryPeriod] = useState<TelemetryPeriod>('week')
  const [playstyleRows, setPlaystyleRows] = useState<ClanPlaystyleRow[]>([])
  const [loadingPlaystyle, setLoadingPlaystyle] = useState(false)
  const [playstyleError, setPlaystyleError] = useState('')
  const [botStats, setBotStats] = useState<{ avgBotsPerMatch: number | null; matchesWithData: number } | null>(null)

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

        const response = await fetch(`/api/clans/${clanId}/lifetime-stats?period=${telemetryPeriod}`, {
          cache: 'no-store',
        })
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
  }, [clanId, telemetryPeriod])

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

  useEffect(() => {
    if (!clanId) {
      return
    }

    let cancelled = false

    async function loadBotStats() {
      try {
        const response = await fetch(`/api/clans/${clanId}/bot-stats?period=${telemetryPeriod}`, {
          cache: 'no-store',
        })
        const payload = (await response.json().catch(() => null)) as
          | { data?: { avgBotsPerMatch: number | null; matchesWithData: number } }
          | null

        if (response.ok && payload?.data && !cancelled) {
          setBotStats(payload.data)
        }
      } catch {
        // Stat secondaire, non bloquante — on laisse simplement la tuile vide.
      }
    }

    void loadBotStats()

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

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {data?.clan?.name ?? `Clan #${clanId}`} | Clan
            </h1>
            <p className="text-sm text-gray-600">Vue clan complete avec top 3 pour chaque statistique.</p>
          </div>
        </div>
      </header>

      {loading ? <p className="mb-6 text-sm text-gray-600">Chargement des statistiques du clan...</p> : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        data && data.members.length > 0 ? (
          <div className="space-y-6">
            <StickySectionNav
              ariaLabel="Navigation des sections statistiques"
              items={STATS_SECTION_LINKS}
            />

            <section id="sec-playstyle" className="scroll-mt-40 rounded border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <SectionBadgeIcon icon="playstyle" />
                    Carte playstyle clan
                  </h2>
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
                    {/* ── 3 Role cards ── */}
                    <div className="mb-4 grid gap-3 sm:grid-cols-3">
                      {([
                        {
                          roleLabel: 'Fragger',
                          metricLabel: 'Agressivité',
                          hint: 'kills · KO · dégâts',
                          value: playstyleAverages.aggression,
                          color: '#ef4444',
                          top: playstyleTopAggressive,
                          getScore: (r: ClanPlaystyleRow) => r.aggressionScore,
                          icon: (
                            <svg viewBox="0 0 100 100" className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" aria-hidden="true">
                              <circle cx="50" cy="50" r="42" strokeWidth="5"/>
                              <circle cx="50" cy="50" r="16" strokeWidth="5"/>
                              <circle cx="50" cy="50" r="4" fill="currentColor" stroke="none"/>
                              <line x1="50" y1="3" x2="50" y2="29" strokeWidth="5" strokeLinecap="round"/>
                              <line x1="50" y1="71" x2="50" y2="97" strokeWidth="5" strokeLinecap="round"/>
                              <line x1="3" y1="50" x2="29" y2="50" strokeWidth="5" strokeLinecap="round"/>
                              <line x1="71" y1="50" x2="97" y2="50" strokeWidth="5" strokeLinecap="round"/>
                            </svg>
                          ),
                          valueClass: 'text-red-600',
                          labelClass: 'text-red-500',
                        },
                        {
                          roleLabel: 'Medic',
                          metricLabel: 'Support',
                          hint: 'revives · 0% = aucun revive',
                          value: playstyleAverages.support,
                          color: '#0ea5e9',
                          top: playstyleTopSupport,
                          getScore: (r: ClanPlaystyleRow) => r.supportScore,
                          icon: (
                            <svg viewBox="0 0 100 100" className="h-5 w-5 text-sky-500" fill="currentColor" aria-hidden="true">
                              <rect x="6" y="22" width="88" height="65" rx="10" opacity="0.18"/>
                              <rect x="6" y="22" width="88" height="65" rx="10" fill="none" stroke="currentColor" strokeWidth="5"/>
                              <rect x="36" y="6" width="28" height="25" rx="6" fill="none" stroke="currentColor" strokeWidth="5"/>
                              <rect x="42" y="39" width="16" height="34" rx="4"/>
                              <rect x="33" y="48" width="34" height="16" rx="4"/>
                            </svg>
                          ),
                          valueClass: 'text-sky-600',
                          labelClass: 'text-sky-500',
                        },
                        {
                          roleLabel: 'Ghost',
                          metricLabel: 'Discipline zone',
                          hint: '100% = jamais touché par la blue zone',
                          value: playstyleAverages.zoneDiscipline,
                          color: '#10b981',
                          top: playstyleTopDiscipline,
                          getScore: (r: ClanPlaystyleRow) => r.zoneDisciplineScore,
                          icon: (
                            <svg viewBox="0 0 100 100" className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" aria-hidden="true">
                              <circle cx="50" cy="50" r="44" strokeWidth="4" opacity="0.25"/>
                              <circle cx="50" cy="50" r="30" strokeWidth="5" opacity="0.55"/>
                              <circle cx="50" cy="50" r="16" strokeWidth="6" opacity="0.8"/>
                              <circle cx="50" cy="50" r="5" fill="currentColor" stroke="none"/>
                            </svg>
                          ),
                          valueClass: 'text-emerald-700',
                          labelClass: 'text-emerald-600',
                        },
                      ] as const).map(({ roleLabel, metricLabel, hint, value, color, top, getScore, icon, valueClass, labelClass }) => {
                        const maxScore = top.length > 0 ? getScore(top[0]) : 0
                        return (
                          <article key={roleLabel} className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                            {/* Jauge centrée — même design que le dashboard */}
                            <div className="flex flex-col items-center gap-1">
                              <p className={`text-[10px] font-bold uppercase tracking-widest ${labelClass}`}>{roleLabel}</p>
                              <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
                                <ArcGauge value={value} color={color} size={88} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                                  {icon}
                                  <span className={`text-sm font-bold leading-none ${valueClass}`}>
                                    {value.toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs font-semibold text-gray-700">{metricLabel} moy.</p>
                              <p className="px-1 text-center text-[10px] leading-tight text-gray-400">{hint}</p>
                            </div>
                            {/* Top 3 joueurs */}
                            <div className="mt-3 border-t border-gray-100 pt-3">
                              {maxScore === 0 ? (
                                <p className="text-center text-[11px] italic text-gray-400">
                                  Aucun joueur avec ce score
                                </p>
                              ) : (
                                <div className="space-y-2.5">
                                  {top.map((entry) => {
                                    const score = getScore(entry)
                                    const pct = (score / maxScore) * 100
                                    return (
                                      <div key={entry.memberId} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="truncate text-gray-700">{entry.displayName}</span>
                                          <span className="ml-2 shrink-0 font-semibold" style={{ color }}>{score.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>

                    {/* ── 4 Thematic cards ── */}
                    {(() => {
                      const avg = playstyleAverages
                      const footDist = avg.avgOnFootDistanceMeters
                      const vehDist = avg.avgVehicleDistanceMeters
                      const totalDist = footDist + vehDist
                      const footPct = totalDist > 0 ? (footDist / totalDist) * 100 : 0
                      const vehPct = totalDist > 0 ? (vehDist / totalDist) * 100 : 0
                      const totalKm = totalDist / 10 / 1000
                      const safe = avg.avgSafeZonePresencePercent
                      const outZone = avg.avgCircleDelayPercent
                      const healHP = avg.avgHealAmount
                      const dmgTaken = avg.avgDamageTaken
                      const healRatio = dmgTaken > 0 ? Math.min(100, (healHP / dmgTaken) * 100) : 0
                      const totalMatches = playstyleRows.reduce((acc, r) => acc + r.matchesPlayed, 0)
                      return (
                        <div className="grid gap-3 sm:grid-cols-2">

                          {/* Mobilité */}
                          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                            <div className="mb-1 flex items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                  <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
                                  <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V9h2.038A2 2 0 0115 11.1V15h.95a2.5 2.5 0 014.9 0H20a1 1 0 001-1v-3.268A3 3 0 0019.142 8.5L17 7h-4a2 2 0 00-2 2v1H4V5a1 1 0 00-1-1H3z"/>
                                </svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">Profil de mobilité</p>
                                <p className="text-xs text-gray-400">
                                  Moy. {totalKm.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km / match · {playstyleRows.length} joueurs
                                </p>
                              </div>
                            </div>
                            <div className="my-3 flex h-3 overflow-hidden rounded-full bg-gray-200">
                              <div className="bg-blue-400 transition-all duration-500" style={{ width: `${footPct}%` }} />
                              <div className="bg-pink-400 transition-all duration-500" style={{ width: `${vehPct}%` }} />
                            </div>
                            <div className="mb-3 flex gap-3 text-[11px] text-gray-400">
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                                {footPct.toFixed(0)}% à pied
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-2 w-2 rounded-full bg-pink-400" />
                                {vehPct.toFixed(0)}% véhicule
                              </span>
                            </div>
                            <div className="space-y-2 border-t border-gray-100 pt-3">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-xs text-gray-600">
                                  <span aria-hidden="true">👣</span> À pied (moy)
                                </span>
                                <span className="text-sm font-bold text-gray-900">{formatTelemetryMeters(footDist)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-xs text-gray-600">
                                  <span aria-hidden="true">🚗</span> Véhicule (moy)
                                </span>
                                <span className="text-sm font-bold text-gray-900">{formatTelemetryMeters(vehDist)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-xs text-gray-600">
                                  <span aria-hidden="true">⚡</span> Vitesse max (moy)
                                </span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatTelemetrySpeedKph(avg.maxVehicleSpeedKph)}{' '}
                                  <span className="text-xs font-normal text-gray-400">km/h</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Gestion du cercle */}
                          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                            <div className="mb-1 flex items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                                </svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">Gestion du cercle</p>
                                <p className="text-xs text-gray-400">{safe.toFixed(0)}% du temps en zone sûre</p>
                              </div>
                            </div>
                            <div className="my-3 flex h-3 overflow-hidden rounded-full bg-gray-200">
                              <div className="bg-emerald-400 transition-all duration-500" style={{ width: `${Math.min(100, safe)}%` }} />
                              <div className="bg-red-400 transition-all duration-500" style={{ width: `${Math.min(100 - Math.min(100, safe), Math.max(0, outZone))}%` }} />
                            </div>
                            <div className="mb-3 flex gap-3 text-[11px] text-gray-400">
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                                Safe {safe.toFixed(0)}%
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                                Hors zone {outZone.toFixed(0)}%
                              </span>
                            </div>
                            <div className="space-y-2 border-t border-gray-100 pt-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Blue zone hits</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatTelemetryScore(avg.avgBlueZoneHits)}{' '}
                                  <span className="text-xs font-normal text-gray-400">evt/m</span>
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">First contact</span>
                                <span className="text-sm font-bold text-gray-900">Phase {formatTelemetryScore(avg.avgFirstContactPhase)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Retard cercle</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {zoneDelayCoverage ? formatSeconds(avg.avgCircleDelaySeconds) : 'N/D'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Hors zone</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {zoneDelayCoverage ? formatTelemetryPercent(outZone) : 'N/D'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Survie & Soins */}
                          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                            <div className="mb-1 flex items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-500">
                                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"/>
                                </svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">Survie &amp; Soins</p>
                                <p className="text-xs text-gray-400">
                                  {healHP.toFixed(0)} HP soignés · {dmgTaken.toFixed(0)} dmg reçus
                                </p>
                              </div>
                            </div>
                            <div className="my-3 flex h-3 overflow-hidden rounded-full bg-red-100">
                              <div className="bg-rose-400 transition-all duration-500" style={{ width: `${healRatio}%` }} />
                            </div>
                            <p className="mb-3 text-[11px] text-gray-400">
                              Soins couvrent {healRatio.toFixed(0)}% des dégâts reçus
                            </p>
                            <div className="space-y-2 border-t border-gray-100 pt-3">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-xs text-gray-600">
                                  <span aria-hidden="true">🩹</span> Soins
                                </span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatTelemetryScore(avg.avgHealsUsed)}{' '}
                                  <span className="text-xs font-normal text-gray-400">/m</span>
                                  <span className="ml-1.5 text-xs text-gray-500">({healHP.toFixed(0)} HP)</span>
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-xs text-gray-600">
                                  <span aria-hidden="true">💊</span> Boosts
                                </span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatTelemetryScore(avg.avgBoostsUsed)}{' '}
                                  <span className="text-xs font-normal text-gray-400">/m</span>
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-xs text-gray-600">
                                  <span aria-hidden="true">🎯</span> Dégâts reçus
                                </span>
                                <span className="text-sm font-bold text-gray-900">{formatTelemetryScore(dmgTaken)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Contexte */}
                          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                            <div className="mb-3 flex items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                                </svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">Contexte</p>
                                <p className="text-xs text-gray-400">
                                  {playstyleRows.length} joueurs analysés sur la période
                                </p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Joueurs avec données</span>
                                <span className="text-sm font-bold text-gray-900">{playstyleRows.length}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Matchs analysés (total)</span>
                                <span className="text-sm font-bold text-gray-900">{totalMatches.toLocaleString('fr-FR')}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Positions obs. (moy)</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatTelemetryScore(avg.avgPositionEvents)}{' '}
                                  <span className="text-xs font-normal text-gray-400">evt/m</span>
                                </span>
                              </div>
                            </div>
                          </div>

                        </div>
                      )
                    })()}
                  </>
                ) : (
                  <p className="text-sm text-gray-600">Aucune donnee telemetry playstyle pour cette periode.</p>
                )
              ) : null}
            </section>

            {botStats && botStats.matchesWithData > 0 ? (
              <section className="app-panel relative overflow-hidden p-4">
                <span className="absolute inset-y-0 left-0 w-1 bg-cyan-500" aria-hidden="true" />
                <div className="flex flex-wrap items-center justify-between gap-4 pl-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-500">
                      <Bot className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-gray-900">Ambiance de lobby</h2>
                      <p className="text-sm text-gray-600">
                        Présence moyenne de bots sur la période sélectionnée.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="sm:text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Bots moyens</p>
                      <p className="mt-0.5 text-[2rem] font-black leading-none tabular-nums text-cyan-500">
                        {botStats.avgBotsPerMatch !== null ? botStats.avgBotsPerMatch.toFixed(1) : '-'}
                        <span className="ml-1 text-xs font-semibold text-gray-500">/ match</span>
                      </p>
                    </div>
                    <p className="app-performer-pill app-performer-pill--value gap-1.5">
                      <ChartNoAxesColumnIncreasing className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                      {botStats.matchesWithData} matchs mesurés
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {groupedMetrics.map((group, index) => (
              <section
                key={group.title}
                id={`sec-metric-${index + 1}`}
                className="scroll-mt-40 rounded border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <SectionBadgeIcon icon={getSectionIcon(group.title)} />
                    {group.title}
                  </h2>
                  {group.title === 'Engagement' ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <p className="app-meta-pill gap-1.5">
                        <CalendarRange className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                        {PLAYSTYLE_PERIOD_OPTIONS.find((option) => option.value === data.period)?.label}
                      </p>
                      {data.statsRecalculation.runsPerDay !== null ? (
                        <p
                          className="app-meta-pill gap-1.5"
                          title={`Cron ${data.statsRecalculation.expression} (${data.statsRecalculation.timezone})`}
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-cyan-500" aria-hidden="true" />
                          Agrégats recalculés {data.statsRecalculation.runsPerDay} fois/jour via cron
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
