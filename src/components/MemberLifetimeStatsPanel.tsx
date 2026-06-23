'use client'

import Image from 'next/image'
import { useState } from 'react'

import SegmentedControl from '@/components/ui/SegmentedControl'

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

type StatsByMode = {
  squad: LifetimeStats | null
  duo: LifetimeStats | null
  solo: LifetimeStats | null
}

type GameMode = 'all' | 'squad' | 'duo' | 'solo'

type MemberLifetimeStatsPanelProps = {
  lifetimeStats: LifetimeStats | null
  statsByMode?: StatsByMode | null
  clanRanks: Record<string, 1 | 2 | 3 | null>
  loadingStats: boolean
  statsError: string
  lastRefreshedAt: string | null
}

const MEDAL_BY_RANK: Record<1 | 2 | 3, { iconPath: string; alt: string }> = {
  1: { iconPath: '/icons/medal-gold.svg', alt: 'Medaille or' },
  2: { iconPath: '/icons/medal-silver.svg', alt: 'Medaille argent' },
  3: { iconPath: '/icons/medal-bronze.svg', alt: 'Medaille bronze' },
}

const SECTION_ICON_BY_KEY: Record<
  'combat' | 'victory' | 'support' | 'vehicle' | 'movement' | 'other',
  { iconPath: string; alt: string }
> = {
  combat: { iconPath: '/icons/stats/combat.svg', alt: 'Icone combat' },
  victory: { iconPath: '/icons/stats/victory.svg', alt: 'Icone victoire' },
  support: { iconPath: '/icons/stats/support.svg', alt: 'Icone support' },
  vehicle: { iconPath: '/icons/stats/vehicle.svg', alt: 'Icone vehicule' },
  movement: { iconPath: '/icons/stats/movement.svg', alt: 'Icone deplacement' },
  other: { iconPath: '/icons/stats/other.svg', alt: 'Icone autres stats' },
}

function SectionTitle({
  section,
  title,
  statCount,
}: {
  section: 'combat' | 'victory' | 'support' | 'vehicle' | 'movement' | 'other'
  title: string
  statCount: number
}) {
  const icon = SECTION_ICON_BY_KEY[section]

  return (
    <div className="member-lifetime-card-head mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Image src={icon.iconPath} alt={icon.alt} width={28} height={28} className="shrink-0" />
        <span>{title}</span>
      </h3>
      <span className="member-lifetime-card-count text-xs font-semibold uppercase tracking-wide">{statCount} stats</span>
    </div>
  )
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

function formatNumber(value: number) {
  const absValue = Math.abs(value)

  if (absValue >= 1_000_000_000) {
    const compact = (value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')
    return `${compact}b`
  }

  if (absValue >= 1_000_000) {
    const compact = (value / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `${compact}m`
  }

  if (absValue >= 1_000) {
    const compact = (value / 1_000).toFixed(1).replace(/\.0$/, '')
    return `${compact}k`
  }

  return value.toLocaleString()
}

function formatRatio(value: number) {
  return value.toFixed(2)
}

function formatDistanceMetersToKm(value: number) {
  const kilometers = value / 1000
  const absKilometers = Math.abs(kilometers)

  if (absKilometers >= 1_000_000_000) {
    const compact = (kilometers / 1_000_000_000).toFixed(1).replace(/\.0$/, '')
    return `${compact}b km`
  }

  if (absKilometers >= 1_000_000) {
    const compact = (kilometers / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `${compact}m km`
  }

  if (absKilometers >= 1_000) {
    const compact = (kilometers / 1_000).toFixed(1).replace(/\.0$/, '')
    return `${compact}k km`
  }

  return `${kilometers.toFixed(2)} km`
}

function StatRow({
  label,
  value,
  metricKey,
  clanRanks,
}: {
  label: string
  value: string
  metricKey?: string
  clanRanks: Record<string, 1 | 2 | 3 | null>
}) {
  const rank = metricKey ? clanRanks[metricKey] : null
  const medal = rank ? MEDAL_BY_RANK[rank] : null

  return (
    <div className="member-lifetime-stat-row member-lifetime-stat-tile">
      <dt className="member-lifetime-stat-label">{label}</dt>
      <dd className="member-lifetime-stat-value flex items-center gap-1 text-lg font-semibold text-gray-900 tabular-nums sm:text-xl">
        {medal ? <Image src={medal.iconPath} alt={medal.alt} width={16} height={16} /> : null}
        <span>{value}</span>
      </dd>
    </div>
  )
}

export default function MemberLifetimeStatsPanel({
  lifetimeStats,
  statsByMode,
  clanRanks,
  loadingStats,
  statsError,
  lastRefreshedAt,
}: MemberLifetimeStatsPanelProps) {
  const [mode, setMode] = useState<GameMode>('all')

  const modeOptions: Array<{ value: GameMode; label: string; disabled?: boolean }> = [
    { value: 'all', label: 'Tous' },
    { value: 'squad', label: 'Squad', disabled: !statsByMode?.squad },
    { value: 'duo', label: 'Duo', disabled: !statsByMode?.duo },
    { value: 'solo', label: 'Solo', disabled: !statsByMode?.solo },
  ]

  const displayedStats =
    mode === 'all'
      ? lifetimeStats
      : (statsByMode?.[mode] ?? lifetimeStats)

  return (
    <section className="member-lifetime-stats member-lifetime-stats--v2 rounded bg-white p-6 shadow">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Statistiques globales</h2>
          <p className="text-sm text-gray-500">
            Vue complete des statistiques PUBG cumulées pour ce joueur.
          </p>
          {lastRefreshedAt ? (
            <p className="mt-1 text-xs text-gray-400">
              Derniere mise a jour : {new Date(lastRefreshedAt).toLocaleString('fr-FR')}
            </p>
          ) : null}
        </div>
        {lifetimeStats ? (
          <SegmentedControl
            options={modeOptions}
            value={mode}
            onChange={setMode}
            size="sm"
          />
        ) : null}
      </div>

      {loadingStats && !lifetimeStats ? (
        <p className="member-lifetime-stats-muted text-sm text-gray-500">Chargement des statistiques globales...</p>
      ) : statsError && !lifetimeStats ? (
        <div className="member-lifetime-stats-alert rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {statsError}
        </div>
      ) : displayedStats ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="member-lifetime-card rounded border border-gray-200 p-4" data-kind="combat">
            <SectionTitle section="combat" title="Combat" statCount={10} />
            <dl className="member-lifetime-card-stats grid grid-cols-2 gap-2 text-sm">
              <StatRow label="Kills" value={formatNumber(displayedStats.combat.kills)} metricKey={mode === 'all' ? 'combat.kills' : undefined} clanRanks={clanRanks} />
              <StatRow label="Morts" value={formatNumber(displayedStats.combat.deaths)} metricKey={mode === 'all' ? 'combat.deaths' : undefined} clanRanks={clanRanks} />
              <StatRow label="Ratio K/D" value={formatRatio(displayedStats.combat.kdRatio)} metricKey={mode === 'all' ? 'combat.kdRatio' : undefined} clanRanks={clanRanks} />
              <StatRow label="Headshots" value={formatNumber(displayedStats.combat.headshots)} metricKey={mode === 'all' ? 'combat.headshots' : undefined} clanRanks={clanRanks} />
              <StatRow label="Assists" value={formatNumber(displayedStats.combat.assists)} metricKey={mode === 'all' ? 'combat.assists' : undefined} clanRanks={clanRanks} />
              <StatRow label="KO" value={formatNumber(displayedStats.combat.knockouts)} metricKey={mode === 'all' ? 'combat.knockouts' : undefined} clanRanks={clanRanks} />
              <StatRow label="Serie max" value={formatNumber(displayedStats.combat.highestKillstreak)} metricKey={mode === 'all' ? 'combat.highestKillstreak' : undefined} clanRanks={clanRanks} />
              <StatRow label="Distance max" value={`${displayedStats.combat.longestKill.toFixed(2)} m`} metricKey={mode === 'all' ? 'combat.longestKill' : undefined} clanRanks={clanRanks} />
              <StatRow label="Teamkills" value={formatNumber(displayedStats.combat.teamkills)} metricKey={mode === 'all' ? 'combat.teamkills' : undefined} clanRanks={clanRanks} />
              <StatRow label="Suicides" value={formatNumber(displayedStats.combat.suicides)} metricKey={mode === 'all' ? 'combat.suicides' : undefined} clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="member-lifetime-card rounded border border-gray-200 p-4" data-kind="victory">
            <SectionTitle section="victory" title="Victoires" statCount={4} />
            <dl className="member-lifetime-card-stats grid grid-cols-2 gap-2 text-sm">
              <StatRow label="Victoires" value={formatNumber(displayedStats.victory.wins)} metricKey={mode === 'all' ? 'victory.wins' : undefined} clanRanks={clanRanks} />
              <StatRow label="Defaites" value={formatNumber(displayedStats.victory.losses)} metricKey={mode === 'all' ? 'victory.losses' : undefined} clanRanks={clanRanks} />
              <StatRow label="Ratio V/D" value={formatRatio(displayedStats.victory.winLossRatio)} metricKey={mode === 'all' ? 'victory.winLossRatio' : undefined} clanRanks={clanRanks} />
              <StatRow label="Temps max en vie" value={formatDurationLong(displayedStats.victory.longestTimeAlive)} metricKey={mode === 'all' ? 'victory.longestTimeAlive' : undefined} clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="member-lifetime-card rounded border border-gray-200 p-4" data-kind="support">
            <SectionTitle section="support" title="Support" statCount={3} />
            <dl className="member-lifetime-card-stats grid grid-cols-2 gap-2 text-sm">
              <StatRow label="Coequipiers releves" value={formatNumber(displayedStats.support.teammatesRevived)} metricKey={mode === 'all' ? 'support.teammatesRevived' : undefined} clanRanks={clanRanks} />
              <StatRow label="Boosts utilises" value={formatNumber(displayedStats.support.boostsUsed)} metricKey={mode === 'all' ? 'support.boostsUsed' : undefined} clanRanks={clanRanks} />
              <StatRow label="Soin" value={formatNumber(displayedStats.support.healed)} metricKey={mode === 'all' ? 'support.healed' : undefined} clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="member-lifetime-card rounded border border-gray-200 p-4" data-kind="vehicle">
            <SectionTitle section="vehicle" title="Vehicules" statCount={2} />
            <dl className="member-lifetime-card-stats grid grid-cols-2 gap-2 text-sm">
              <StatRow label="Vehicules detruits" value={formatNumber(displayedStats.vehicle.vehiclesDestroyed)} metricKey={mode === 'all' ? 'vehicle.vehiclesDestroyed' : undefined} clanRanks={clanRanks} />
              <StatRow label="Roadkills" value={formatNumber(displayedStats.vehicle.roadkills)} metricKey={mode === 'all' ? 'vehicle.roadkills' : undefined} clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="member-lifetime-card rounded border border-gray-200 p-4" data-kind="movement">
            <SectionTitle section="movement" title="Deplacements" statCount={3} />
            <dl className="member-lifetime-card-stats grid grid-cols-2 gap-2 text-sm">
              <StatRow label="Distance en vehicule" value={formatDistanceMetersToKm(displayedStats.movement.drivenDistance)} metricKey={mode === 'all' ? 'movement.drivenDistance' : undefined} clanRanks={clanRanks} />
              <StatRow label="Distance a pied" value={formatDistanceMetersToKm(displayedStats.movement.walkedDistance)} metricKey={mode === 'all' ? 'movement.walkedDistance' : undefined} clanRanks={clanRanks} />
              <StatRow label="Distance a la nage" value={formatDistanceMetersToKm(displayedStats.movement.swamDistance)} metricKey={mode === 'all' ? 'movement.swamDistance' : undefined} clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="member-lifetime-card rounded border border-gray-200 p-4" data-kind="other">
            <SectionTitle section="other" title="Autres" statCount={2} />
            <dl className="member-lifetime-card-stats grid grid-cols-2 gap-2 text-sm">
              <StatRow label="Armes ramassees" value={formatNumber(displayedStats.other.weaponsPicked)} metricKey={mode === 'all' ? 'other.weaponsPicked' : undefined} clanRanks={clanRanks} />
              <StatRow label="Degats infliges" value={formatNumber(displayedStats.other.damageGiven)} metricKey={mode === 'all' ? 'other.damageGiven' : undefined} clanRanks={clanRanks} />
            </dl>
          </article>
        </div>
      ) : (
        <p className="member-lifetime-stats-muted text-sm text-gray-500">Aucune statistique globale disponible.</p>
      )}
    </section>
  )
}