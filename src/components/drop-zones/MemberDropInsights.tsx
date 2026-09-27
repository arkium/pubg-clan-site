'use client'

import CityInsightsPanel from '@/components/dashboard/CityInsightsPanel'
import DropPressureStatsPanel from '@/components/dashboard/DropPressureStatsPanel'
import { usePageData } from '@/hooks/usePageData'
import { PERIOD_LABELS, type StandardPeriod } from '@/lib/period'
import type { CityInsights } from '@/types/city-insights'
import type { DropPressureDashboardStats, DropPressureRankingEntry, DropPressureTimelinePoint } from '@/types/drop-pressure'

type DropPressurePayload = {
  stats: DropPressureDashboardStats | null
  ranking: DropPressureRankingEntry[]
  timeline: DropPressureTimelinePoint[]
}

const pickDropPressure = (payload: unknown) => (payload as DropPressurePayload | null) ?? null
const pickCity = (payload: unknown) => (payload as { insights?: CityInsights } | null)?.insights ?? null

/**
 * Pression au drop et villes d'un joueur, déplacées du tableau de bord le 2026-09-27 (docs/features/membres.md),
 * comme celles du clan sur sa page des drop zones. Même période que la carte au-dessus.
 */
export default function MemberDropInsights({ memberId, clanId, period }: { memberId: number; clanId: number | null; period: StandardPeriod }) {
  const drop = usePageData(`/api/members/${memberId}/drop-pressure?period=${period}`, pickDropPressure)
  const city = usePageData(`/api/members/${memberId}/city-insights?period=${period}`, pickCity)

  return (
    <div className="flex flex-col gap-6">
      <DropPressureStatsPanel
        stats={drop.data?.stats ?? null}
        loading={drop.loading}
        error={drop.error}
        periodLabel={PERIOD_LABELS[period]}
        ranking={drop.data?.ranking ?? []}
        timeline={drop.data?.timeline ?? []}
        currentMemberId={memberId}
      />
      <CityInsightsPanel
        insights={city.data}
        loading={city.loading}
        error={city.error ? 'Indicateurs de villes indisponibles.' : ''}
        periodLabel={PERIOD_LABELS[period]}
        positionsHref={clanId ? `/clans/${clanId}/stats/positions` : undefined}
        scope="member"
      />
    </div>
  )
}
