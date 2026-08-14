'use client'

import type { ClanComparatorEntry } from '@/hooks/useClanComparator'

// Slots 1-3 du thème catégoriel du projet (validées all-pairs CVD en clair et sombre) —
// voir skill dataviz, references/palette.md. Ordre fixe, jamais recyclé/attribué au hasard.
const SERIES_COLORS = [
  { light: '#2a78d6', dark: '#3987e5' }, // slot 1 — bleu
  { light: '#eb6834', dark: '#d95926' }, // slot 2 — orange
  { light: '#1baf7a', dark: '#199e70' }, // slot 3 — aqua
]

type Axis = {
  key: string
  label: string
  values: number[] // une valeur par clan, même ordre que `clans`
  max: number
  format: (value: number) => string
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatSeconds(value: number): string {
  const minutes = Math.round(value / 60)
  return `${minutes} min`
}

function formatNumber(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

function buildAxes(clans: ClanComparatorEntry[]): Axis[] {
  const aggression = clans.map((c) => c.dna?.avgDamagePerMatch ?? 0)
  const survival = clans.map((c) => c.dna?.avgTimeSurvivedSeconds ?? 0)
  const teamplay = clans.map((c) => {
    const revives = c.dna?.revivesGiven ?? 0
    const matches = c.performance?.matchCount ?? 0
    return matches > 0 ? revives / matches : 0
  })
  const activity = clans.map((c) => c.pulse?.rosterHealth.participationRate ?? 0)
  const performance = clans.map((c) => c.performance?.winRate ?? 0)

  const withMax = (values: number[]) => Math.max(...values, 1)

  return [
    { key: 'aggression', label: 'Agressivité', values: aggression, max: withMax(aggression), format: formatNumber },
    { key: 'survival', label: 'Survie', values: survival, max: withMax(survival), format: formatSeconds },
    { key: 'teamplay', label: 'Teamplay', values: teamplay, max: withMax(teamplay), format: (v) => formatNumber(v) + '/match' },
    { key: 'activity', label: 'Activité', values: activity, max: withMax(activity), format: formatPercent },
    { key: 'performance', label: 'Winrate', values: performance, max: withMax(performance), format: formatPercent },
  ]
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function radarPath(axes: Axis[], cx: number, cy: number, radius: number, clanIndex: number): string {
  const n = axes.length
  return (
    axes
      .map((axis, i) => {
        const angle = (360 / n) * i
        const value = axis.values[clanIndex]
        const r = (value / axis.max) * radius
        const { x, y } = polarToCartesian(cx, cy, r, angle)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ') + ' Z'
  )
}

type ClanComparatorRadarProps = {
  clans: ClanComparatorEntry[]
}

export default function ClanComparatorRadar({ clans }: ClanComparatorRadarProps) {
  if (clans.length === 0) {
    return (
      <section className="app-panel p-6 text-sm text-[var(--theme-ui-text-muted)]">
        Sélectionne au moins un clan pour afficher le radar de comparaison.
      </section>
    )
  }

  const axes = buildAxes(clans)
  const cx = 130
  const cy = 130
  const radius = 95
  const n = axes.length
  const gridLevels = [0.25, 0.5, 0.75, 1]

  return (
    <section className="app-panel overflow-hidden p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-[var(--theme-ui-text)]">Profil comparé</h2>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <svg
          viewBox="0 0 260 260"
          className="mx-auto h-auto w-full max-w-[260px] shrink-0 xl:mx-0"
          aria-label="Radar chart comparant les clans sélectionnés"
        >
          {gridLevels.map((level) => {
            const points = axes
              .map((_, i) => {
                const angle = (360 / n) * i
                const { x, y } = polarToCartesian(cx, cy, radius * level, angle)
                return `${x.toFixed(1)},${y.toFixed(1)}`
              })
              .join(' ')
            return <polygon key={level} points={points} fill="none" stroke="var(--theme-ui-border)" strokeWidth="1" />
          })}

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
                stroke="var(--theme-ui-border)"
                strokeWidth="1"
              />
            )
          })}

          {clans.map((clan, clanIndex) => {
            const color = SERIES_COLORS[clanIndex % SERIES_COLORS.length]
            return (
              <path
                key={clan.clanId}
                d={radarPath(axes, cx, cy, radius, clanIndex)}
                fill={color.light}
                className="comparator-radar-series"
                style={{ ['--series-color-dark' as string]: color.dark }}
                fillOpacity="0.22"
                stroke={color.light}
                strokeWidth="2"
              />
            )
          })}

          {axes.map((axis, i) => {
            const angle = (360 / n) * i
            const { x, y } = polarToCartesian(cx, cy, radius + 20, angle)
            return (
              <text
                key={axis.key}
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--theme-ui-text-muted)"
                fontSize="10"
                fontWeight={500}
              >
                {axis.label}
              </text>
            )
          })}
        </svg>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap gap-4 text-xs">
            {clans.map((clan, clanIndex) => (
              <span key={clan.clanId} className="flex items-center gap-1.5 text-[var(--theme-ui-text-secondary)]">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: SERIES_COLORS[clanIndex % SERIES_COLORS.length].light, opacity: 0.85 }}
                />
                {clan.clanName} [{clan.clanTag}]
              </span>
            ))}
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--theme-ui-text-muted)]">
                  <th className="pb-1 font-medium">Axe</th>
                  {clans.map((clan) => (
                    <th key={clan.clanId} className="pb-1 text-right font-medium">
                      {clan.clanTag}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--theme-ui-border)]">
                {axes.map((axis) => (
                  <tr key={axis.key}>
                    <td className="py-1 text-[var(--theme-ui-text-secondary)]">{axis.label}</td>
                    {axis.values.map((value, clanIndex) => (
                      <td key={clans[clanIndex].clanId} className="py-1 text-right font-semibold text-[var(--theme-ui-text)]">
                        {axis.format(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        :root[data-app-theme='dark'] .comparator-radar-series {
          fill: var(--series-color-dark) !important;
          stroke: var(--series-color-dark) !important;
        }
      `}</style>
    </section>
  )
}
