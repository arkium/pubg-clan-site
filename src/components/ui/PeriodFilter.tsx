'use client'

import SegmentedControl from '@/components/ui/SegmentedControl'
import { periodOptions, type Period } from '@/lib/period'

type PeriodFilterProps<P extends Period> = {
  /** Périodes proposées par la page, dans l'ordre d'affichage (`STANDARD_PERIODS`, `MATCH_PERIODS`…). */
  periods: readonly P[]
  value: P
  onChange: (value: P) => void
  size?: 'xs' | 'sm'
  className?: string
}

/**
 * Contrôle de période unique des pages joueurs — docs/TODO/sticky.md §4.C.
 *
 * Toujours des boutons segmentés, à toutes les tailles d'écran, avec les libellés de
 * `src/lib/period.ts`. C'est le seul contrôle qui reste dans le bandeau docké sur mobile.
 */
export default function PeriodFilter<P extends Period>({
  periods,
  value,
  onChange,
  size = 'sm',
  className,
}: PeriodFilterProps<P>) {
  return (
    <div role="group" aria-label="Période" data-period-filter className={['shrink-0', className ?? ''].join(' ').trim()}>
      <SegmentedControl options={periodOptions(periods)} value={value} onChange={onChange} size={size} wrap />
    </div>
  )
}
