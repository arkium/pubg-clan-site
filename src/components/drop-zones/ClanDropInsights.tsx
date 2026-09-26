'use client'

import { useEffect, useState } from 'react'

import CityInsightsPanel from '@/components/dashboard/CityInsightsPanel'
import DropPressureStatsPanel from '@/components/dashboard/DropPressureStatsPanel'
import { PERIOD_LABELS, type StandardPeriod } from '@/lib/period'
import type { CityInsights } from '@/types/city-insights'
import type { DropPressureDashboardStats, DropPressureRankingEntry, DropPressureTimelinePoint } from '@/types/drop-pressure'

type DropPressureResult = {
  key: string
  stats: DropPressureDashboardStats | null
  ranking: DropPressureRankingEntry[]
  timeline: DropPressureTimelinePoint[]
  error: string
}
type CityResult = { key: string; insights: CityInsights | null; error: string }

/**
 * Pression au drop et indicateurs de villes du clan, déplacés de la vue d'ensemble le 2026-09-26
 * (docs/features/clans.md). Tous les types de partie et tous les modes, comme la carte des drop zones au-dessus.
 * Chargement = résultat d'une autre clé (clan + période) : les panneaux restent affichés pendant la relecture.
 */
export default function ClanDropInsights({ clanId, period }: { clanId: number; period: StandardPeriod }) {
  const key = `${clanId}:${period}`
  const [dropPressure, setDropPressure] = useState<DropPressureResult | null>(null)
  const [city, setCity] = useState<CityResult | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const query = `period=${period}&matchType=all&mode=all`
    const requestKey = `${clanId}:${period}`

    fetch(`/api/clans/${clanId}/drop-pressure-stats?${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          stats?: DropPressureDashboardStats
          ranking?: DropPressureRankingEntry[]
          timeline?: DropPressureTimelinePoint[]
          error?: string
        }
        if (!response.ok || !payload.stats) throw new Error(payload.error ?? 'Impossible de charger la pression au drop')
        setDropPressure({ key: requestKey, stats: payload.stats, ranking: payload.ranking ?? [], timeline: payload.timeline ?? [], error: '' })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setDropPressure({
          key: requestKey,
          stats: null,
          ranking: [],
          timeline: [],
          error: error instanceof Error ? error.message : 'Impossible de charger la pression au drop',
        })
      })

    fetch(`/api/clans/${clanId}/city-insights?${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { insights?: CityInsights; error?: string }
        setCity(
          response.ok && payload.insights
            ? { key: requestKey, insights: payload.insights, error: '' }
            : { key: requestKey, insights: null, error: payload.error ?? 'Indicateurs de villes indisponibles.' }
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) setCity({ key: requestKey, insights: null, error: 'Indicateurs de villes indisponibles.' })
      })

    return () => controller.abort()
  }, [clanId, period])

  return (
    <div className="mt-6 flex flex-col gap-6">
      <DropPressureStatsPanel
        stats={dropPressure?.stats ?? null}
        loading={dropPressure?.key !== key}
        error={dropPressure?.key === key ? dropPressure.error : ''}
        ranking={dropPressure?.ranking ?? []}
        timeline={dropPressure?.timeline ?? []}
      />
      <CityInsightsPanel
        insights={city?.insights ?? null}
        loading={city?.key !== key}
        error={city?.key === key ? city.error : ''}
        periodLabel={`${PERIOD_LABELS[period]} · tous types de partie`}
        positionsHref={`/clans/${clanId}/stats/positions`}
      />
    </div>
  )
}
