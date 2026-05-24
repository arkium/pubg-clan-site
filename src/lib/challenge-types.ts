export const CHALLENGE_TYPES = {
  KILL_RACE: {
    key: 'kill_race',
    name: 'Kill Race',
    description: 'Who can get the most kills?',
    metric: 'kills',
    icon: '🔫',
  },
  DAMAGE_RACE: {
    key: 'damage_race',
    name: 'Damage Race',
    description: 'Highest damage dealer wins!',
    metric: 'damage',
    icon: '💥',
  },
  WIN_STREAK: {
    key: 'win_streak',
    name: 'Win Streak',
    description: 'Most squad wins',
    metric: 'squadWins',
    icon: '🏆',
  },
  SQUAD_SYNERGY: {
    key: 'squad_synergy',
    name: 'Squad Synergy',
    description: 'Best 3-member squad performance',
    metric: 'squadStats',
    icon: '👥',
  },
  SURVIVAL_EXPERT: {
    key: 'survival_expert',
    name: 'Survival Expert',
    description: 'Best placement average',
    metric: 'placementAverage',
    icon: '🎖️',
  },
} as const

export type ChallengeType = (typeof CHALLENGE_TYPES)[keyof typeof CHALLENGE_TYPES]['key']