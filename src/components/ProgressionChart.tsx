import type { LeaderboardSortBy, WeeklyProgression } from '@/types/leaderboard'

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']

function getMetricValue(
  stats: WeeklyProgression['weeklyStats'][number],
  metric: LeaderboardSortBy
): number {
  switch (metric) {
    case 'damage':
      return stats.totalDamage
    case 'winRate':
      return stats.winRate * 100
    case 'matches':
      return stats.matchesPlayed
    default:
      return stats.totalKills
  }
}

function formatMetricValue(value: number, metric: LeaderboardSortBy): string {
  if (metric === 'winRate') return `${value.toFixed(1)}%`
  if (metric === 'damage') return `${Math.round(value)}`
  return String(Math.round(value))
}

interface SparklineProps {
  values: number[]
  color: string
  width: number
  height: number
  min: number
  max: number
}

function Sparkline({ values, color, width, height, min, max }: SparklineProps) {
  if (values.length < 2) return null

  const range = max - min || 1
  const padding = 4

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2)
    const y = padding + (1 - (v - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, i) => {
        const x = padding + (i / (values.length - 1)) * (width - padding * 2)
        const y = padding + (1 - (v - min) / range) * (height - padding * 2)
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />
      })}
    </svg>
  )
}

interface ProgressionChartProps {
  progression: WeeklyProgression[]
  metric: LeaderboardSortBy
  onMetricChange: (metric: LeaderboardSortBy) => void
}

const METRIC_LABELS: Record<LeaderboardSortBy, string> = {
  kills: 'Kills',
  damage: 'Damage',
  winRate: 'Win Rate (%)',
  matches: 'Matchs',
}

export default function ProgressionChart({
  progression,
  metric,
  onMetricChange,
}: ProgressionChartProps) {
  const metrics: LeaderboardSortBy[] = ['kills', 'damage', 'winRate', 'matches']

  if (progression.length === 0) {
    return (
      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Progression (4 semaines)</h2>
        <p className="text-sm text-gray-600">Aucune donnée de progression disponible.</p>
      </section>
    )
  }

  // Collect all week periods across all players
  const allPeriods = Array.from(
    new Set(progression.flatMap((p) => p.weeklyStats.map((s) => s.period)))
  ).sort()

  const allValues = progression.flatMap((p) =>
    p.weeklyStats.map((s) => getMetricValue(s, metric))
  )
  const globalMin = Math.min(...allValues, 0)
  const globalMax = Math.max(...allValues, 1)

  const CHART_WIDTH = 300
  const CHART_HEIGHT = 60

  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Progression (4 semaines)</h2>
        <div className="flex rounded border border-gray-200 p-1">
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMetricChange(m)}
              className={`rounded px-3 py-1 text-xs font-medium ${
                m === metric ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          {/* Period labels */}
          <div className="mb-2 flex items-center gap-2">
            <div className="w-28 shrink-0" />
            <div className="flex-1">
              <div
                className="grid text-xs text-gray-400"
                style={{ gridTemplateColumns: `repeat(${allPeriods.length}, 1fr)` }}
              >
                {allPeriods.map((p) => {
                  const parts = p.split('-')
                  const label =
                    parts[0] === 'week'
                      ? `S${parts[2] ?? ''}`
                      : parts[0] === 'month'
                        ? `M${parts[2] ?? ''}`
                        : 'All'
                  return (
                    <span key={p} className="text-center">
                      {label}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Player rows */}
          <div className="space-y-3">
            {progression.map((player, playerIdx) => {
              const color = COLORS[playerIdx % COLORS.length] ?? '#3b82f6'
              const valuesByPeriod = new Map(
                player.weeklyStats.map((s) => [s.period, getMetricValue(s, metric)])
              )
              const orderedValues = allPeriods.map((p) => valuesByPeriod.get(p) ?? 0)
              const latest = orderedValues[orderedValues.length - 1] ?? 0
              const prev = orderedValues[orderedValues.length - 2]
              const trend =
                prev !== undefined
                  ? latest > prev
                    ? '↑'
                    : latest < prev
                      ? '↓'
                      : '→'
                  : '→'
              const trendColor =
                trend === '↑' ? 'text-green-600' : trend === '↓' ? 'text-red-500' : 'text-gray-500'

              return (
                <div key={player.memberId} className="flex items-center gap-2">
                  <div className="flex w-28 shrink-0 items-center gap-1.5 overflow-hidden">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate text-xs font-medium text-gray-800">
                      {player.displayName}
                    </span>
                  </div>

                  <div className="flex-1">
                    <Sparkline
                      values={orderedValues}
                      color={color}
                      width={CHART_WIDTH}
                      height={CHART_HEIGHT}
                      min={globalMin}
                      max={globalMax}
                    />
                  </div>

                  <div className="flex w-20 shrink-0 items-center justify-end gap-1 text-right text-xs">
                    <span className={`font-semibold ${trendColor}`}>{trend}</span>
                    <span className="text-gray-700">{formatMetricValue(latest, metric)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
