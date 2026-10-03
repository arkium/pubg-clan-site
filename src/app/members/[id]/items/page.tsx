'use client'

import { Pill } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo } from 'react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import ItemUsePanel from '@/components/telemetry/ItemUsePanel'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import type { ItemUseStats } from '@/lib/item-use-stats'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const pickStats = (payload: unknown) => (payload as { data?: ItemUseStats } | null)?.data ?? null
const pickName = (payload: unknown) => (payload as { displayName?: string } | null)?.displayName ?? null

/**
 * Objets consommés d'un joueur — soins, boosts, carburant et gadgets utilisés en match, objet par objet. Migrée vers la
 * charte le 2026-10-03 (docs/ui/index.html) : bannière des pages joueur, KPI de la charte, couleurs de familles en jetons.
 * Pendant un changement de période, les résultats précédents restent affichés, estompés.
 */
export default function MemberItemUsePage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  // Période de la page : URL, puis mémoire de la visite, puis « Tous » (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'all')
  const { data, loading, error } = usePageData(memberId && ready ? `/api/members/${memberId}/item-use?period=${period}` : null, pickStats)
  const name = usePageData(memberId ? `/api/members/${memberId}` : null, pickName).data

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-[var(--theme-ui-negative)]">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter space-y-4">
        <NavigationTrail
          currentLabel="Objets consommés"
          currentHref={`/members/${memberId}/items`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: name ?? 'Tableau de bord', altHref: '/members' }}
        />
        <MemberPageHeader
          title={name ? `Objets consommés de ${name}` : 'Objets consommés'}
          subtitle={`Soins, boosts, carburant et gadgets utilisés en match ${PERIOD_WHEN_LABELS[period]}, objet par objet.`}
          showBackButton={false}
          backgroundImage="/sauvetage2.jpg"
          icon={<Pill className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />}
        />
      </div>

      <DockingToolbar ariaLabel="Période des objets consommés du joueur">
        <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
      </DockingToolbar>

      <div className="app-container app-gutter pb-8">
        <ItemUsePanel stats={data} loading={loading} error={error ? 'Chargement impossible.' : ''} scope="member" />
      </div>
    </div>
  )
}
