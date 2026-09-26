'use client'

import TopPerformers from '@/components/TopPerformers'
import { useClanMatchesCache } from '@/hooks/useClanMatchesCache'
import type { StandardPeriod } from '@/lib/period'
import type { TopPerformersData } from '@/types/squad-matches'

/**
 * Top performers du clan (kills, dégâts, survie), déplacés de la vue d'ensemble le 2026-09-26
 * (docs/features/clans.md). Parties officielles, tous modes : les réglages par défaut de l'ancienne vue d'ensemble.
 */
export default function ClanTopPerformers({ clanId, period }: { clanId: number; period: StandardPeriod }) {
  const { data, loading } = useClanMatchesCache(clanId, period, 'official')
  const performers = data?.payload.byMode.all.topPerformers as unknown as TopPerformersData | undefined
  if (!performers) {
    return loading ? <div className="app-panel mt-6 h-40 animate-pulse" aria-busy="true" /> : null
  }
  return (
    <section className="mt-6" aria-label="Top performers">
      <TopPerformers performers={performers} />
    </section>
  )
}
