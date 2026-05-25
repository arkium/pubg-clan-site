'use client'

import Image from 'next/image'

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

type MemberLifetimeStatsPanelProps = {
  lifetimeStats: LifetimeStats | null
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
}: {
  section: 'combat' | 'victory' | 'support' | 'vehicle' | 'movement' | 'other'
  title: string
}) {
  const icon = SECTION_ICON_BY_KEY[section]

  return (
    <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
      <Image src={icon.iconPath} alt={icon.alt} width={18} height={18} />
      <span>{title}</span>
    </h3>
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
  return value.toLocaleString()
}

function formatRatio(value: number) {
  return value.toFixed(2)
}

function formatDistanceMetersToKm(value: number) {
  return `${(value / 1000).toFixed(2)} km`
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
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="flex items-center gap-1 text-lg font-semibold text-gray-900 sm:text-xl">
        {medal ? <Image src={medal.iconPath} alt={medal.alt} width={16} height={16} /> : null}
        <span>{value}</span>
      </dd>
    </div>
  )
}

export default function MemberLifetimeStatsPanel({
  lifetimeStats,
  clanRanks,
  loadingStats,
  statsError,
  lastRefreshedAt,
}: MemberLifetimeStatsPanelProps) {
  return (
    <section className="rounded bg-white p-6 shadow">
      <div className="mb-4">
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
      </div>

      {loadingStats && !lifetimeStats ? (
        <p className="text-sm text-gray-500">Chargement des statistiques globales...</p>
      ) : statsError && !lifetimeStats ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {statsError}
        </div>
      ) : lifetimeStats ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded border border-gray-200 p-4">
            <SectionTitle section="combat" title="Combat" />
            <dl className="space-y-2 text-sm">
              <StatRow label="Kills" value={formatNumber(lifetimeStats.combat.kills)} metricKey="combat.kills" clanRanks={clanRanks} />
              <StatRow label="Morts" value={formatNumber(lifetimeStats.combat.deaths)} metricKey="combat.deaths" clanRanks={clanRanks} />
              <StatRow label="Ratio K/D" value={formatRatio(lifetimeStats.combat.kdRatio)} metricKey="combat.kdRatio" clanRanks={clanRanks} />
              <StatRow label="Headshots" value={formatNumber(lifetimeStats.combat.headshots)} metricKey="combat.headshots" clanRanks={clanRanks} />
              <StatRow label="Assists" value={formatNumber(lifetimeStats.combat.assists)} metricKey="combat.assists" clanRanks={clanRanks} />
              <StatRow label="KO" value={formatNumber(lifetimeStats.combat.knockouts)} metricKey="combat.knockouts" clanRanks={clanRanks} />
              <StatRow label="Serie max" value={formatNumber(lifetimeStats.combat.highestKillstreak)} metricKey="combat.highestKillstreak" clanRanks={clanRanks} />
              <StatRow label="Distance max" value={`${lifetimeStats.combat.longestKill.toFixed(2)} m`} metricKey="combat.longestKill" clanRanks={clanRanks} />
              <StatRow label="Teamkills" value={formatNumber(lifetimeStats.combat.teamkills)} metricKey="combat.teamkills" clanRanks={clanRanks} />
              <StatRow label="Suicides" value={formatNumber(lifetimeStats.combat.suicides)} metricKey="combat.suicides" clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <SectionTitle section="victory" title="Victoires" />
            <dl className="space-y-2 text-sm">
              <StatRow label="Victoires" value={formatNumber(lifetimeStats.victory.wins)} metricKey="victory.wins" clanRanks={clanRanks} />
              <StatRow label="Defaites" value={formatNumber(lifetimeStats.victory.losses)} metricKey="victory.losses" clanRanks={clanRanks} />
              <StatRow label="Ratio V/D" value={formatRatio(lifetimeStats.victory.winLossRatio)} metricKey="victory.winLossRatio" clanRanks={clanRanks} />
              <StatRow label="Temps max en vie" value={formatDurationLong(lifetimeStats.victory.longestTimeAlive)} metricKey="victory.longestTimeAlive" clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <SectionTitle section="support" title="Support" />
            <dl className="space-y-2 text-sm">
              <StatRow label="Coequipiers releves" value={formatNumber(lifetimeStats.support.teammatesRevived)} metricKey="support.teammatesRevived" clanRanks={clanRanks} />
              <StatRow label="Boosts utilises" value={formatNumber(lifetimeStats.support.boostsUsed)} metricKey="support.boostsUsed" clanRanks={clanRanks} />
              <StatRow label="Soin" value={formatNumber(lifetimeStats.support.healed)} metricKey="support.healed" clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <SectionTitle section="vehicle" title="Vehicules" />
            <dl className="space-y-2 text-sm">
              <StatRow label="Vehicules detruits" value={formatNumber(lifetimeStats.vehicle.vehiclesDestroyed)} metricKey="vehicle.vehiclesDestroyed" clanRanks={clanRanks} />
              <StatRow label="Roadkills" value={formatNumber(lifetimeStats.vehicle.roadkills)} metricKey="vehicle.roadkills" clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <SectionTitle section="movement" title="Deplacements" />
            <dl className="space-y-2 text-sm">
              <StatRow label="Distance en vehicule" value={formatDistanceMetersToKm(lifetimeStats.movement.drivenDistance)} metricKey="movement.drivenDistance" clanRanks={clanRanks} />
              <StatRow label="Distance a pied" value={formatDistanceMetersToKm(lifetimeStats.movement.walkedDistance)} metricKey="movement.walkedDistance" clanRanks={clanRanks} />
              <StatRow label="Distance a la nage" value={formatDistanceMetersToKm(lifetimeStats.movement.swamDistance)} metricKey="movement.swamDistance" clanRanks={clanRanks} />
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <SectionTitle section="other" title="Autres" />
            <dl className="space-y-2 text-sm">
              <StatRow label="Armes ramassees" value={formatNumber(lifetimeStats.other.weaponsPicked)} metricKey="other.weaponsPicked" clanRanks={clanRanks} />
              <StatRow label="Degats infliges" value={formatNumber(lifetimeStats.other.damageGiven)} metricKey="other.damageGiven" clanRanks={clanRanks} />
            </dl>
          </article>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Aucune statistique globale disponible.</p>
      )}
    </section>
  )
}