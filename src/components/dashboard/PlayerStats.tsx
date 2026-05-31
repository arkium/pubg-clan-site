import Image from 'next/image'

import { DISTINCTION_BADGE_META, isDistinctionBadgeKey } from '@/lib/distinction-badges'
import type { DashboardStats as DashboardStatsType, ClanAverage } from '@/types/dashboard'
import type { DashboardPeriod } from '@/types/dashboard'
import SegmentedControl from '@/components/ui/SegmentedControl'

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  week: 'Cette semaine',
  month: 'Ce mois',
  all: 'Tout le temps',
}

interface StatCardProps {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | 'neutral'
  highlight?: boolean
}

function StatCard({ label, value, sub, trend, highlight }: StatCardProps) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : null
  const trendColor =
    trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'

  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">
        {value}
        {trendIcon && <span className={`ml-1 text-sm ${trendColor}`}>{trendIcon}</span>}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

interface PlayerStatsProps {
  stats: DashboardStatsType | null
  clanAverage: ClanAverage | null
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
}

export default function PlayerStats({ stats, clanAverage, period, onPeriodChange }: PlayerStatsProps) {
  if (!stats) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Stats principales</h2>
          <SegmentedControl
            options={(['week', 'month', 'all'] as DashboardPeriod[]).map((value) => ({
              value,
              label: PERIOD_LABELS[value],
            }))}
            value={period}
            onChange={onPeriodChange}
            size="sm"
          />
        </div>
        <p className="text-sm text-gray-500">
          Aucune donnée disponible pour cette période. Les stats sont calculées automatiquement
          chaque nuit.
        </p>
      </section>
    )
  }

  const vsKills =
    clanAverage && clanAverage.avgKills > 0
      ? ((stats.totalKills - clanAverage.avgKills) / clanAverage.avgKills) * 100
      : null
  const vsDamage =
    clanAverage && clanAverage.avgDamage > 0
      ? ((stats.totalDamage - clanAverage.avgDamage) / clanAverage.avgDamage) * 100
      : null

  const badgeMeta = isDistinctionBadgeKey(stats.badgeType)
    ? DISTINCTION_BADGE_META[stats.badgeType]
    : null

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Stats principales</h2>
          {badgeMeta && (
            <span
              title={badgeMeta.label}
              className="flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800"
            >
              <Image src={badgeMeta.iconPath} alt={badgeMeta.label} width={20} height={20} />
              <span>{badgeMeta.label}</span>
            </span>
          )}
        </div>

        <SegmentedControl
          options={(['week', 'month', 'all'] as DashboardPeriod[]).map((value) => ({
            value,
            label: PERIOD_LABELS[value],
          }))}
          value={period}
          onChange={onPeriodChange}
          size="sm"
          wrap
          fullWidthOnMobile
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Kills"
          value={String(stats.totalKills)}
          sub={
            vsKills !== null
              ? `${vsKills > 0 ? '+' : ''}${vsKills.toFixed(0)}% vs clan`
              : `Moy. ${stats.avgKillsPerGame.toFixed(1)}/partie`
          }
          trend={vsKills !== null ? (vsKills > 5 ? 'up' : vsKills < -5 ? 'down' : 'neutral') : undefined}
          highlight={vsKills !== null && vsKills > 5}
        />
        <StatCard
          label="Damage"
          value={Math.round(stats.totalDamage).toLocaleString()}
          sub={
            vsDamage !== null
              ? `${vsDamage > 0 ? '+' : ''}${vsDamage.toFixed(0)}% vs clan`
              : `Moy. ${Math.round(stats.avgDamagePerGame)}/partie`
          }
          trend={
            vsDamage !== null ? (vsDamage > 5 ? 'up' : vsDamage < -5 ? 'down' : 'neutral') : undefined
          }
          highlight={vsDamage !== null && vsDamage > 5}
        />
        <StatCard
          label="Win Rate"
          value={`${(stats.winRate * 100).toFixed(1)}%`}
          sub={`${stats.matchesWon} victoires`}
        />
        <StatCard
          label="Matchs joués"
          value={String(stats.matchesPlayed)}
          sub={`${stats.totalAssists} assists · ${stats.totalRevives} revives`}
        />
      </div>
    </section>
  )
}
