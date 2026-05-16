import type { DashboardStats as DashboardStatsType, ClanAverage } from '@/types/dashboard'

const BADGE_ICONS: Record<string, string> = {
  top_killer: '🔫',
  top_damage: '💥',
  best_wr: '🏆',
  mvp: '💎',
}

const BADGE_LABELS: Record<string, string> = {
  top_killer: 'Top Killer',
  top_damage: 'Top Damage',
  best_wr: 'Best Win Rate',
  mvp: 'MVP',
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
}

export default function PlayerStats({ stats, clanAverage }: PlayerStatsProps) {
  if (!stats) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Stats principales</h2>
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

  const badge = stats.badgeType ? BADGE_ICONS[stats.badgeType] : null
  const badgeLabel = stats.badgeType ? BADGE_LABELS[stats.badgeType] : null

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Stats principales</h2>
        {badge && (
          <span
            title={badgeLabel ?? ''}
            className="flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800"
          >
            {badge} {badgeLabel}
          </span>
        )}
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
