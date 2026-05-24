import type { DashboardStats, ClanAverage } from '@/types/dashboard'

interface Axis {
  key: string
  label: string
  playerValue: number
  clanValue: number
  max: number
}

function buildAxes(stats: DashboardStats, clan: ClanAverage): Axis[] {
  return [
    {
      key: 'kills',
      label: 'Kills',
      playerValue: stats.totalKills,
      clanValue: clan.avgKills,
      max: Math.max(stats.totalKills, clan.avgKills, 1),
    },
    {
      key: 'damage',
      label: 'Damage',
      playerValue: stats.totalDamage,
      clanValue: clan.avgDamage,
      max: Math.max(stats.totalDamage, clan.avgDamage, 1),
    },
    {
      key: 'winRate',
      label: 'Win Rate',
      playerValue: stats.winRate * 100,
      clanValue: clan.avgWinRate * 100,
      max: 100,
    },
    {
      key: 'assists',
      label: 'Assists',
      playerValue: stats.totalAssists,
      clanValue: clan.avgAssists,
      max: Math.max(stats.totalAssists, clan.avgAssists, 1),
    },
    {
      key: 'revives',
      label: 'Revives',
      playerValue: stats.totalRevives,
      clanValue: clan.avgRevives,
      max: Math.max(stats.totalRevives, clan.avgRevives, 1),
    },
  ]
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function radarPath(axes: Axis[], cx: number, cy: number, radius: number, usePlayer: boolean): string {
  const n = axes.length
  return axes
    .map((ax, i) => {
      const angle = (360 / n) * i
      const value = usePlayer ? ax.playerValue : ax.clanValue
      const r = (value / ax.max) * radius
      const { x, y } = polarToCartesian(cx, cy, r, angle)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ') + ' Z'
}

interface ComparisonRadarProps {
  stats: DashboardStats | null
  clanAverage: ClanAverage | null
}

export default function ComparisonRadar({ stats, clanAverage }: ComparisonRadarProps) {
  if (!stats || !clanAverage) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Comparaison vs Clan</h2>
        <p className="text-sm text-gray-500">
          Données insuffisantes pour la comparaison. Les stats de clan seront disponibles une fois
          que d&apos;autres membres auront des données pour cette période.
        </p>
      </section>
    )
  }

  const axes = buildAxes(stats, clanAverage)
  const cx = 120
  const cy = 120
  const radius = 90
  const n = axes.length

  // Grid circles
  const gridLevels = [0.25, 0.5, 0.75, 1]

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Comparaison vs Clan</h2>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Radar SVG */}
        <svg
          viewBox="0 0 240 240"
          className="mx-auto h-auto w-full max-w-[240px] shrink-0 lg:mx-0"
          aria-label="Radar chart comparaison vs clan"
        >
          {/* Grid circles */}
          {gridLevels.map((level) => {
            const gridPoints = axes
              .map((_, i) => {
                const angle = (360 / n) * i
                const { x, y } = polarToCartesian(cx, cy, radius * level, angle)
                return `${x.toFixed(1)},${y.toFixed(1)}`
              })
              .join(' ')
            return (
              <polygon
                key={level}
                points={gridPoints}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="1"
              />
            )
          })}

          {/* Axis lines */}
          {axes.map((_, i) => {
            const angle = (360 / n) * i
            const { x, y } = polarToCartesian(cx, cy, radius, angle)
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={x.toFixed(1)}
                y2={y.toFixed(1)}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
            )
          })}

          {/* Clan average polygon */}
          <path
            d={radarPath(axes, cx, cy, radius, false)}
            fill="#93c5fd"
            fillOpacity="0.3"
            stroke="#3b82f6"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />

          {/* Player polygon */}
          <path
            d={radarPath(axes, cx, cy, radius, true)}
            fill="#f97316"
            fillOpacity="0.25"
            stroke="#f97316"
            strokeWidth="2"
          />

          {/* Axis labels */}
          {axes.map((ax, i) => {
            const angle = (360 / n) * i
            const { x, y } = polarToCartesian(cx, cy, radius + 18, angle)
            return (
              <text
                key={ax.key}
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[9px] font-medium"
                fill="#6b7280"
                fontSize="9"
              >
                {ax.label}
              </text>
            )
          })}
        </svg>

        {/* Legend + Stats table */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-orange-400 opacity-80" />
              Vous
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-blue-400 opacity-80" />
              Moyenne clan
            </span>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
              <tr className="text-left text-gray-400">
                <th className="pb-1 font-medium">Stat</th>
                <th className="pb-1 text-right font-medium">Vous</th>
                <th className="pb-1 text-right font-medium">Clan</th>
                <th className="pb-1 text-right font-medium">Diff</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {axes.map((ax) => {
                  const diff = ax.playerValue - ax.clanValue
                  const pct = ax.clanValue > 0 ? (diff / ax.clanValue) * 100 : 0
                  const isAbove = diff > 0
                  return (
                    <tr key={ax.key}>
                      <td className="py-1 text-gray-700">{ax.label}</td>
                      <td className="py-1 text-right font-semibold text-gray-900">
                        {ax.key === 'winRate'
                          ? `${ax.playerValue.toFixed(1)}%`
                          : Math.round(ax.playerValue).toLocaleString()}
                      </td>
                      <td className="py-1 text-right text-gray-500">
                        {ax.key === 'winRate'
                          ? `${ax.clanValue.toFixed(1)}%`
                          : Math.round(ax.clanValue).toLocaleString()}
                      </td>
                      <td
                        className={`py-1 text-right font-medium ${
                          isAbove ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {isAbove ? '+' : ''}
                        {pct.toFixed(0)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
