'use client'

import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Swords } from 'lucide-react'
import { useMemo, useState } from 'react'

import SegmentedControl from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Skeleton'
import type { CityInsights, CityMetricKey } from '@/types/city-insights'

type CityInsightsPanelProps = {
  insights: CityInsights | null
  loading?: boolean
  error?: string
  periodLabel?: string
  /** Page Positions préfiltrée : la carte et la vue sont ajoutées par le panneau. */
  positionsHref?: string
  scope?: 'clan' | 'member'
}

const METRIC_OPTIONS: Array<{ value: CityMetricKey; label: string }> = [
  { value: 'presence', label: 'Présence' },
  { value: 'kill', label: 'Kills' },
  { value: 'damage', label: 'Dégâts' },
  { value: 'revive', label: 'Réanimations' },
]

const METRIC_META: Record<CityMetricKey, { color: string; unit: string; positionsView: string | null }> = {
  // La page Positions n'a pas de vue « présence » : le lien ouvre alors la carte sans filtre de vue.
  presence: { color: '#0ea5e9', unit: 'passages', positionsView: null },
  kill: { color: '#ef4444', unit: 'éliminations', positionsView: 'kill' },
  damage: { color: '#f97316', unit: 'dégâts', positionsView: 'damage' },
  revive: { color: '#22c55e', unit: 'réanimations', positionsView: 'revive' },
}

const MEDALS: Record<number, { iconPath: string; alt: string }> = {
  1: { iconPath: '/icons/medal-gold.svg', alt: 'Médaille or, rang 1' },
  2: { iconPath: '/icons/medal-silver.svg', alt: 'Médaille argent, rang 2' },
  3: { iconPath: '/icons/medal-bronze.svg', alt: 'Médaille bronze, rang 3' },
}

const numberFormat = new Intl.NumberFormat('fr-FR')
const formatShare = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

function formatDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function CityTimeline({ insights, metric }: { insights: CityInsights; metric: CityMetricKey }) {
  const values = insights.timeline.map((point) => point[metric])
  const max = Math.max(...values, 1)
  const color = METRIC_META[metric].color

  return (
    <div className="mt-4">
      <div className="flex items-end gap-1.5" role="img" aria-label="Évolution sur huit semaines">
        {insights.timeline.map((point, index) => {
          const value = values[index] ?? 0
          const height = value > 0 ? Math.max(6, (value / max) * 100) : 2
          return (
            <div key={point.period} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${height}%`,
                    backgroundColor: value > 0 ? color : 'var(--theme-ui-border)',
                    opacity: value > 0 ? 0.85 : 1,
                  }}
                  title={`${point.label} : ${numberFormat.format(value)} ${METRIC_META[metric].unit}`}
                />
              </div>
              <span className="text-[10px] text-gray-500">{point.label}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Huit dernières semaines, semaines vides comprises. Une semaine sans barre signifie aucun match analysé, ou des
        positions déjà purgées pour cette période.
      </p>
    </div>
  )
}

export default function CityInsightsPanel({
  insights,
  loading,
  error,
  periodLabel,
  positionsHref,
  scope = 'clan',
}: CityInsightsPanelProps) {
  const [metric, setMetric] = useState<CityMetricKey>('presence')
  const cities = useMemo(() => insights?.top[metric] ?? [], [insights, metric])
  const cityTotal = insights?.cityTotals[metric] ?? 0
  const metricTotal = insights?.metricTotals[metric] ?? 0
  const outsideShare = metricTotal > 0 ? ((metricTotal - cityTotal) / metricTotal) * 100 : 0
  const dataStart = formatDate(insights?.dataStart ?? null)

  const href = useMemo(() => {
    if (!positionsHref || !insights?.mainMapName) return positionsHref
    const search = new URLSearchParams({ map: insights.mainMapName })
    const view = METRIC_META[metric].positionsView
    if (view) search.set('view', view)
    if (insights.period === 'week' || insights.period === 'month' || insights.period === 'all') {
      search.set('period', insights.period)
    }
    return `${positionsHref}?${search.toString()}`
  }, [insights, metric, positionsHref])

  return (
    <section className="app-panel p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Villes et zones de combat</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">
            {insights?.favoriteCity
              ? `${scope === 'member' ? 'Ville de prédilection' : 'Ville du clan'} : ${insights.favoriteCity.name}`
              : 'Aucune ville identifiée'}
          </h2>
          {periodLabel ? <p className="mt-1 text-xs text-gray-500">{periodLabel}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="app-btn app-btn--sm app-btn--secondary">
            Voir sur la carte
          </Link>
        ) : null}
      </div>

      <div className="mt-4">
        <SegmentedControl options={METRIC_OPTIONS} value={metric} onChange={setMetric} wrap fullWidthOnMobile />
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-rose-600">{error}</p>
      ) : !insights || cities.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          Aucun événement rattaché à une ville sur cette période. Les villes se configurent dans les paramètres de
          cartes ; les positions des matchs les plus anciens ont pu être purgées.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="app-panel-muted p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> Ville principale
              </p>
              <p className="mt-1 text-base font-semibold text-gray-900">{insights.favoriteCity?.name ?? 'N/D'}</p>
              <p className="text-xs text-gray-500">
                {insights.favoriteCity ? `${formatShare(insights.favoriteCity.share)} des passages en ville` : '—'}
              </p>
            </div>
            <div className="app-panel-muted p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                <Swords className="h-3.5 w-3.5" aria-hidden /> Zone de combat favorite
              </p>
              <p className="mt-1 text-base font-semibold text-gray-900">{insights.favoriteCombatCity?.name ?? 'N/D'}</p>
              <p className="text-xs text-gray-500">
                {insights.favoriteCombatCity
                  ? `${numberFormat.format(insights.favoriteCombatCity.events)} kills et dégâts cumulés`
                  : '—'}
              </p>
            </div>
            <div className="app-panel-muted p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Couverture</p>
              <p className="mt-1 text-base font-semibold text-gray-900">
                {numberFormat.format(insights.matchCount)} matchs
              </p>
              <p className="text-xs text-gray-500">
                {formatShare(outsideShare)} hors des villes configurées
                {dataStart ? ` · données depuis le ${dataStart}` : ''}
              </p>
            </div>
          </div>

          <div className="app-table-shell mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="w-14 px-3 py-2 text-center">Rang</th>
                  <th className="px-3 py-2 text-left">Ville</th>
                  <th className="px-3 py-2 text-right">Événements</th>
                  <th className="px-3 py-2 text-right">Part</th>
                  {scope === 'member' ? <th className="px-3 py-2 text-right">Clan</th> : null}
                </tr>
              </thead>
              <tbody>
                {cities.map((city, index) => {
                  const rank = index + 1
                  const medal = MEDALS[rank]
                  return (
                    <tr
                      key={`${city.mapName}-${city.locationId}`}
                      className={`app-table-row ${rank <= 3 ? `app-table-row--top${rank}` : ''}`}
                    >
                      <td className="px-3 py-3 text-center font-semibold">
                        {medal ? (
                          <Image src={medal.iconPath} alt={medal.alt} width={24} height={24} className="mx-auto h-6 w-6" />
                        ) : (
                          rank
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-gray-900">{city.name}</span>
                        <span className="ml-2 text-xs text-gray-500">{city.mapLabel}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{numberFormat.format(city.events)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatShare(city.share)}</td>
                      {scope === 'member' ? (
                        <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                          {city.clanShare === null ? '—' : formatShare(city.clanShare)}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {scope === 'member' ? (
            <p className="mt-2 text-xs text-gray-500">
              La colonne « Clan » n’apparaît qu’au-delà de 25 événements pour le membre et 100 pour le clan, faute de quoi
              la comparaison ne veut rien dire.
            </p>
          ) : null}

          <CityTimeline insights={insights} metric={metric} />
        </>
      )}
    </section>
  )
}
