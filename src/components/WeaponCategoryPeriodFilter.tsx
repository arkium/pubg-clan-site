'use client'

import { useRouter } from 'next/navigation'

import SegmentedControl from '@/components/ui/SegmentedControl'

type Period = 'week' | 'month' | 'all'

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

type Props = {
  clanId: number
  period: Period
}

export default function WeaponCategoryPeriodFilter({ clanId, period }: Props) {
  const router = useRouter()

  return (
    <SegmentedControl
      options={PERIOD_OPTIONS}
      value={period}
      onChange={(value) =>
        router.push(`/clans/${clanId}/stats/weapons/categories?period=${value}`)
      }
      size="sm"
    />
  )
}
