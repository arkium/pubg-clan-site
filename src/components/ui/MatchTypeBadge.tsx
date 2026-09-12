import type { ReactElement } from 'react'

export interface MatchTypeBadgeProps {
  matchType?: string | null
  size?: 'xs' | 'sm'
  className?: string
  showOfficial?: boolean
}

type BadgeConfig = {
  label: string
  classes: string
}

const BADGE_CONFIGS: Record<string, BadgeConfig> = {
  casual: {
    label: 'Casual',
    classes:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700/50',
  },
  airoyale: {
    label: 'Casual',
    classes:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700/50',
  },
  event: {
    label: 'Event',
    classes:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700/50',
  },
  arcade: {
    label: 'Arcade',
    classes:
      'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-700/50',
  },
  custom: {
    label: 'Custom',
    classes:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-700/50',
  },
  competitive: {
    label: 'Ranked',
    classes:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50',
  },
  trainingroom: {
    label: 'Training',
    classes:
      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
}

export default function MatchTypeBadge({
  matchType,
  size = 'xs',
  className = '',
  showOfficial = false,
}: MatchTypeBadgeProps): ReactElement | null {
  if (!matchType) return null

  const normalized = matchType.toLowerCase()
  if (normalized === 'official' && !showOfficial) return null

  const config = BADGE_CONFIGS[normalized] ?? {
    label: matchType.charAt(0).toUpperCase() + matchType.slice(1),
    classes:
      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  }

  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-0.5 text-xs font-semibold'
      : 'px-1.5 py-0.5 text-[10px] font-medium leading-none'

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.classes} ${sizeClasses} ${className}`.trim()}
    >
      {config.label}
    </span>
  )
}
