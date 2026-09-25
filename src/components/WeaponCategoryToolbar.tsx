'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { DockingToolbar } from '@/components/ui/DockingToolbar'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SectionAnchorNav, { type SectionAnchorNavItem } from '@/components/ui/SectionAnchorNav'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { PERIOD_QUERY_PARAM, STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'

type Props = {
  /** Période avec laquelle le serveur a rendu la page (`?period=`, semaine par défaut). */
  serverPeriod: StandardPeriod
  /** Ancres des catégories, seconde ligne du bandeau (docs/TODO/sticky.md §4.B). */
  sections: SectionAnchorNavItem[]
}

/**
 * Bandeau de la page « Catégories d'armes », rendue côté serveur à partir de `?period=`.
 *
 * Changer de période remplace l'URL (sans entrée d'historique) : le serveur rend la page avec la
 * nouvelle période. Une page ouverte sans paramètre a été rendue avec la semaine : si la visite a
 * mémorisé une autre période, elle est reportée dans l'URL, ce qui relance le rendu avec elle.
 */
export default function WeaponCategoryToolbar({ serverPeriod, sections }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const { period, setPeriod, source } = usePagePeriod(STANDARD_PERIODS, 'week', { serverRendered: true })

  useEffect(() => {
    if (source !== 'memory' || period === serverPeriod) return
    router.replace(`${pathname}?${PERIOD_QUERY_PARAM}=${period}`, { scroll: false })
  }, [pathname, period, router, serverPeriod, source])

  return (
    <DockingToolbar ariaLabel="Filtres des catégories d'armes">
      {({ compact }) => (
        <div className="flex w-full flex-col gap-3">
          <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
          {!compact && sections.length > 0 ? (
            <SectionAnchorNav ariaLabel="Navigation des catégories d'armes" items={sections} />
          ) : null}
        </div>
      )}
    </DockingToolbar>
  )
}
