'use client'

import { useState } from 'react'

import type { DashboardProgression } from '@/types/dashboard'

type MetricKey = 'totalKills' | 'totalDamage' | 'winRate' | 'matchesPlayed'

const METRIC_LABELS: Record<MetricKey, string> = {
  totalKills: 'Kills',
  totalDamage: 'Damage',
  winRate: 'Win Rate (%)',
  matchesPlayed: 'Matchs',
}

const METRIC_COLOR = '#3b82f6'

function getMetricValue(entry: DashboardProgression, metric: MetricKey): number {
  if (metric === 'winRate') return entry.winRate * 100
  return entry[metric]
}

function formatValue(value: number, metric: MetricKey): string {
  if (metric === 'winRate') return `${value.toFixed(1)}%`
  if (metric === 'totalDamage') return Math.round(value).toLocaleString()
  return String(Math.round(value))
}

interface SparklineProps {
  values: number[]
  min: number
  max: number
  width: number
  height: number
}

function Sparkline({ values, min, max, width, height }: SparklineProps) {
  if (values.length < 2) return null
  const range = max - min || 1
  const pad = 8
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return { x, y }
  })

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaD = `${pathD} L${points[points.length - 1]!.x},${height - pad} L${points[0]!.x},${height - pad} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      preserveAspectRatio="none"
      className="h-24 w-full overflow-visible"
    >
      <path d={areaD} fill={METRIC_COLOR} fillOpacity="0.1" />
      <path d={pathD} fill="none" stroke={METRIC_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="white" stroke={METRIC_COLOR} strokeWidth="2" />
      ))}
    </svg>
  )
}

interface ProgressionChartProps {
  progression: DashboardProgression[]
}

export default function ProgressionChart({ progression }: ProgressionChartProps) {
  const [metric, setMetric] = useState<MetricKey>('totalKills')

  const metrics: MetricKey[] = ['totalKills', 'totalDamage', 'winRate', 'matchesPlayed']

  if (progression.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Progression (4 semaines)</h2>
        <p className="text-sm text-gray-500">Aucune donnée de progression disponible.</p>
      </section>
    )
  }

  const values = progression.map((p) => getMetricValue(p, metric))
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)

  const latest = values[values.length - 1] ?? 0
  const prev = values[values.length - 2]
  const trend =
    prev !== undefined ? (latest > prev ? '↑' : latest < prev ? '↓' : '→') : '→'
  const trendColor =
    trend === '↑' ? 'text-green-600' : trend === '↓' ? 'text-red-500' : 'text-gray-400'

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Progression (4 semaines)</h2>
        <div className="dashboard-period-toggle flex flex-wrap rounded border border-gray-200 p-0.5">
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`dashboard-period-toggle-item rounded px-3 py-1 text-xs font-medium ${
                m === metric
                  ? 'dashboard-period-toggle-item-active bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 overflow-hidden">
          <Sparkline values={values} min={min} max={max} width={400} height={100} />
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-left sm:text-right">
          <p className={`text-2xl font-bold ${trendColor}`}>
            {trend} {formatValue(latest, metric)}
          </p>
          <p className="text-xs text-gray-500">cette semaine</p>
        </div>
      </div>

      {/* Period labels */}
      <div className="mt-2 flex justify-between text-xs text-gray-400">
        {progression.map((p) => (
          <span key={p.period} className="text-center">
            S{p.week}
          </span>
        ))}
      </div>
    </section>
  )
}
