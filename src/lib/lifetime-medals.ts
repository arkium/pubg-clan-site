export type MedalCounts = {
  gold: number
  silver: number
  bronze: number
}

type LifetimeStatsForMedals = {
  memberId: number
  clanId: number
  combat: Record<string, number>
  victory: Record<string, number>
  support: Record<string, number>
  vehicle: Record<string, number>
  movement: Record<string, number>
  other: Record<string, number>
}

const RANKED_METRICS: Array<{
  order: 'asc' | 'desc'
  getValue: (stats: LifetimeStatsForMedals) => number
}> = [
  { order: 'desc', getValue: (stats) => stats.combat.kills ?? 0 },
  { order: 'asc', getValue: (stats) => stats.combat.deaths ?? 0 },
  { order: 'desc', getValue: (stats) => stats.combat.kdRatio ?? 0 },
  { order: 'desc', getValue: (stats) => stats.combat.headshots ?? 0 },
  { order: 'desc', getValue: (stats) => stats.combat.assists ?? 0 },
  { order: 'desc', getValue: (stats) => stats.combat.knockouts ?? 0 },
  { order: 'desc', getValue: (stats) => stats.combat.highestKillstreak ?? 0 },
  { order: 'desc', getValue: (stats) => stats.combat.longestKill ?? 0 },
  { order: 'desc', getValue: (stats) => stats.combat.teamkills ?? 0 },
  { order: 'asc', getValue: (stats) => stats.combat.suicides ?? 0 },
  { order: 'desc', getValue: (stats) => stats.victory.wins ?? 0 },
  { order: 'asc', getValue: (stats) => stats.victory.losses ?? 0 },
  { order: 'desc', getValue: (stats) => stats.victory.winLossRatio ?? 0 },
  { order: 'desc', getValue: (stats) => stats.victory.longestTimeAlive ?? 0 },
  { order: 'desc', getValue: (stats) => stats.support.teammatesRevived ?? 0 },
  { order: 'desc', getValue: (stats) => stats.support.boostsUsed ?? 0 },
  { order: 'desc', getValue: (stats) => stats.support.healed ?? 0 },
  { order: 'desc', getValue: (stats) => stats.vehicle.vehiclesDestroyed ?? 0 },
  { order: 'desc', getValue: (stats) => stats.vehicle.roadkills ?? 0 },
  { order: 'desc', getValue: (stats) => stats.movement.drivenDistance ?? 0 },
  { order: 'desc', getValue: (stats) => stats.movement.walkedDistance ?? 0 },
  { order: 'desc', getValue: (stats) => stats.movement.swamDistance ?? 0 },
  { order: 'desc', getValue: (stats) => stats.other.weaponsPicked ?? 0 },
  { order: 'desc', getValue: (stats) => stats.other.damageGiven ?? 0 },
]

export function calculateLifetimeMedalCounts(rows: LifetimeStatsForMedals[]) {
  const countsByMemberId = new Map<number, MedalCounts>()
  const clanIds = [...new Set(rows.map((row) => row.clanId))]

  for (const metric of RANKED_METRICS) {
    for (const clanId of clanIds) {
      const rankedRows = rows
        .filter((row) => row.clanId === clanId)
        .map((row) => ({ memberId: row.memberId, value: metric.getValue(row) }))
        .sort((left, right) =>
          metric.order === 'asc' ? left.value - right.value : right.value - left.value
        )

      rankedRows.slice(0, 3).forEach((row, index) => {
        const counts = countsByMemberId.get(row.memberId) ?? { gold: 0, silver: 0, bronze: 0 }

        if (index === 0) counts.gold += 1
        if (index === 1) counts.silver += 1
        if (index === 2) counts.bronze += 1

        countsByMemberId.set(row.memberId, counts)
      })
    }
  }

  return countsByMemberId
}