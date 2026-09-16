export const DROP_PRESSURE_RADIUS_METERS = 250
export const DROP_PRESSURE_RADIUS_UNITS = DROP_PRESSURE_RADIUS_METERS * 100

export type DropPressureLevel = 'calm' | 'contested' | 'hot' | 'very_hot'

export type DropPressureSample = {
  memberKey: string
  teamId?: number
  x: number
  y: number
}

export type DropPressureBreakdown = {
  nearbyPlayerCount: number
  nearbyOpponentCount: number | null
}

/**
 * Seuils de pression, appliqués au nombre d'**adversaires** à moins de 250 m (décision du 2026-09-16). Compter tous
 * les joueurs incluait les coéquipiers, qui atterrissent groupés (2,0 à 2,7 en moyenne) : sur 36 516 drops réels,
 * « Calme » ne concernait que 15,5 % des drops, contre 44,3 % en ne comptant que les adversaires.
 */
export const DROP_PRESSURE_LEVELS: Record<
  DropPressureLevel,
  { label: string; color: string; min: number; max: number | null }
> = {
  calm: { label: 'Calme', color: '#22c55e', min: 0, max: 2 },
  contested: { label: 'Contesté', color: '#eab308', min: 3, max: 7 },
  hot: { label: 'Hot drop', color: '#f97316', min: 8, max: 15 },
  very_hot: { label: 'Très chaud', color: '#dc2626', min: 16, max: null },
}

export function dropPressureLevel(nearbyCount: number): DropPressureLevel {
  if (nearbyCount >= 16) return 'very_hot'
  if (nearbyCount >= 8) return 'hot'
  if (nearbyCount >= 3) return 'contested'
  return 'calm'
}

/** Effectif qui fixe le niveau : les adversaires, ou tous les joueurs si les équipes du lobby sont inconnues. */
export function dropPressureCount(pressure: {
  nearbyPlayerCount: number
  nearbyOpponentCount: number | null
}): number {
  return pressure.nearbyOpponentCount ?? pressure.nearbyPlayerCount
}

export function countNearbyPlayers(
  samples: DropPressureSample[],
  targetMemberKey: string,
  targetX: number,
  targetY: number
) {
  return countNearbyPlayersBreakdown(
    samples,
    targetMemberKey,
    targetX,
    targetY
  ).nearbyPlayerCount
}

export function countNearbyPlayersBreakdown(
  samples: DropPressureSample[],
  targetMemberKey: string,
  targetX: number,
  targetY: number
): DropPressureBreakdown {
  const normalizedTargetKey = targetMemberKey.trim().toLowerCase()
  const uniquePlayers = new Map<string, DropPressureSample>()
  const targetTeamId = samples.find(
    (sample) => sample.memberKey.trim().toLowerCase() === normalizedTargetKey
  )?.teamId

  for (const sample of samples) {
    const memberKey = sample.memberKey.trim().toLowerCase()
    if (!memberKey || memberKey === normalizedTargetKey || uniquePlayers.has(memberKey)) continue
    uniquePlayers.set(memberKey, sample)
  }

  let nearbyPlayerCount = 0
  let nearbyOpponentCount = 0
  let opponentCountComplete = targetTeamId !== undefined
  const radiusSquared = DROP_PRESSURE_RADIUS_UNITS ** 2
  for (const sample of uniquePlayers.values()) {
    const deltaX = sample.x - targetX
    const deltaY = sample.y - targetY
    if (deltaX ** 2 + deltaY ** 2 <= radiusSquared) {
      nearbyPlayerCount += 1
      if (targetTeamId === undefined || sample.teamId === undefined) {
        opponentCountComplete = false
      } else if (sample.teamId !== targetTeamId) {
        nearbyOpponentCount += 1
      }
    }
  }

  return {
    nearbyPlayerCount,
    nearbyOpponentCount: opponentCountComplete ? nearbyOpponentCount : null,
  }
}

/** Pression moyenne et maximale : même effectif que le niveau (adversaires, sinon tous les joueurs). */
export function summarizeDropPressure(
  points: Array<{
    nearbyPlayerCount250m: number
    nearbyOpponentCount250m?: number | null
    pressureLevel: DropPressureLevel
  }>
) {
  const countOf = (point: (typeof points)[number]) => point.nearbyOpponentCount250m ?? point.nearbyPlayerCount250m
  const total = points.reduce((sum, point) => sum + countOf(point), 0)
  const hotDropCount = points.filter(
    (point) => point.pressureLevel === 'hot' || point.pressureLevel === 'very_hot'
  ).length

  return {
    average: points.length > 0 ? total / points.length : 0,
    maximum: points.reduce((max, point) => Math.max(max, countOf(point)), 0),
    hotDropCount,
    hotDropShare: points.length > 0 ? (hotDropCount / points.length) * 100 : 0,
  }
}
/** « 2 adversaires à moins de 250 m (5 joueurs) » — ou le seul total quand les équipes sont inconnues. */
export function dropPressureTooltip(point: { nearbyPlayerCount250m: number; nearbyOpponentCount250m?: number | null }) {
  const players = point.nearbyPlayerCount250m
  const playersLabel = `${players.toLocaleString('fr-FR')} joueur${players > 1 ? 's' : ''}`
  const opponents = point.nearbyOpponentCount250m
  if (opponents === null || opponents === undefined) return `${playersLabel} à moins de 250 m`
  return `${opponents.toLocaleString('fr-FR')} adversaire${opponents > 1 ? 's' : ''} à moins de 250 m (${playersLabel})`
}
