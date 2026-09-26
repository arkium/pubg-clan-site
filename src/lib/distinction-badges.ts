export type DistinctionBadgeKey = 'top_killer' | 'top_damage' | 'best_wr' | 'mvp' | 'best_kpm'

export const DISTINCTION_BADGE_META: Record<
  DistinctionBadgeKey,
  {
    label: string
    /** Libellé court, en français, des bandes de distinctions (docs/TODO/refonte-ui.md §3). */
    shortLabel: string
    iconPath: string
  }
> = {
  top_killer: {
    shortLabel: 'Top killer',
    label: 'Top Killer',
    iconPath: '/icons/distinctions/top-killer.svg',
  },
  top_damage: {
    shortLabel: 'Dégâts',
    label: 'Top Damage',
    iconPath: '/icons/distinctions/top-damage.svg',
  },
  best_wr: {
    shortLabel: 'Win rate',
    label: 'Best Win Rate',
    iconPath: '/icons/distinctions/best-wr.svg',
  },
  mvp: {
    shortLabel: 'MVP',
    label: 'MVP',
    iconPath: '/icons/distinctions/mvp.svg',
  },
  best_kpm: {
    shortLabel: 'K/M',
    label: 'Best K/M',
    iconPath: '/icons/distinctions/best-kpm.svg',
  },
}

export function isDistinctionBadgeKey(value: string | null | undefined): value is DistinctionBadgeKey {
  return value === 'top_killer' || value === 'top_damage' || value === 'best_wr' || value === 'mvp' || value === 'best_kpm'
}
