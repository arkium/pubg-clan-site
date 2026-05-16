import type { ReportChartsData } from '@/types/reports'

function getPoints(values: number[], width: number, height: number) {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  const padding = 8

  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : padding + (index / (values.length - 1)) * (width - padding * 2)
      const y = padding + (1 - value / max) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')
}

function PieLegend({
  items,
  total,
}: {
  items: ReportChartsData['modeBreakdown']
  total: number
}) {
  return (
    <div className="space-y-2 text-xs text-gray-600">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-3">
          <span>{item.label}</span>
          <span>{((item.value / Math.max(total, 1)) * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function ReportCharts({ charts }: { charts: ReportChartsData | null }) {
  if (!charts) {
    return (
      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Charts</h2>
        <p className="text-sm text-gray-600">Aucune visualisation disponible.</p>
      </section>
    )
  }

  const lineValues = charts.timeline.map((point) => point.kills)
  const playerMax = Math.max(...charts.playerComparison.map((item) => item.kills), 1)
  const pieTotal = charts.modeBreakdown.reduce((sum, item) => sum + item.value, 0)
  const pieGradient =
    charts.modeBreakdown.length > 0
      ? (() => {
          const colors = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#ef4444']
          let offset = 0
          return `conic-gradient(${charts.modeBreakdown
            .map((item, index) => {
              const percent = (item.value / Math.max(pieTotal, 1)) * 100
              const start = offset
              offset += percent
              return `${colors[index % colors.length]} ${start}% ${offset}%`
            })
            .join(', ')})`
        })()
      : '#e5e7eb'

  const heatmapMax = Math.max(...charts.activityHeatmap.map((cell) => cell.count), 1)

  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Charts</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded border border-gray-100 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Evolution kills / damage</h3>
          <svg width="100%" height="140" viewBox="0 0 320 140" role="img" aria-label="Line chart kills">
            <polyline
              points={getPoints(lineValues, 320, 140)}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            {charts.timeline.map((point) => (
              <span key={point.label}>{point.label.slice(5)}: {point.kills} K</span>
            ))}
          </div>
        </article>

        <article className="rounded border border-gray-100 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Comparaison joueurs</h3>
          <div className="space-y-3">
            {charts.playerComparison.map((player) => (
              <div key={player.memberId}>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                  <span>{player.displayName}</span>
                  <span>{player.kills} kills</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${(player.kills / playerMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded border border-gray-100 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Répartition modes de jeu</h3>
          <div className="flex items-center gap-4">
            <div
              className="h-28 w-28 rounded-full border border-gray-100"
              style={{ background: pieGradient }}
            />
            <PieLegend items={charts.modeBreakdown} total={pieTotal} />
          </div>
        </article>

        <article className="rounded border border-gray-100 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Heatmap activité</h3>
          <div className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-1 text-[10px]">
            <div />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="text-center text-gray-400">
                {hour}
              </span>
            ))}
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="contents">
                <span className="pr-1 text-right text-gray-500">{day}</span>
                {charts.activityHeatmap
                  .filter((cell) => cell.day === day)
                  .map((cell) => (
                    <span
                      key={`${cell.day}-${cell.hour}`}
                      className="h-4 rounded"
                      title={`${day} ${cell.hour}h: ${cell.count} match(es)`}
                      style={{
                        backgroundColor: `rgba(37, 99, 235, ${cell.count / heatmapMax})`,
                      }}
                    />
                  ))}
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
