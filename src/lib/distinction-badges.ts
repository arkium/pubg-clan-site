export type DistinctionBadgeKey = 'top_killer' | 'top_damage' | 'best_wr' | 'mvp' | 'best_kpm'

export const DISTINCTION_BADGE_META: Record<
  DistinctionBadgeKey,
  {
    label: string
    iconPath: string
  }
> = {
  top_killer: {
    label: 'Top Killer',
    iconPath: '/icons/distinctions/top-killer.svg',
  },
  top_damage: {
    label: 'Top Damage',
    iconPath: '/icons/distinctions/top-damage.svg',
  },
  best_wr: {
    label: 'Best Win Rate',
    iconPath: '/icons/distinctions/best-wr.svg',
  },
  mvp: {
    label: 'MVP',
    iconPath: '/icons/distinctions/mvp.svg',
  },
  best_kpm: {
    label: 'Best K/M',
    iconPath: '/icons/distinctions/best-kpm.svg',
  },
}

export function isDistinctionBadgeKey(value: string | null | undefined): value is DistinctionBadgeKey {
  return value === 'top_killer' || value === 'top_damage' || value === 'best_wr' || value === 'mvp' || value === 'best_kpm'
}
