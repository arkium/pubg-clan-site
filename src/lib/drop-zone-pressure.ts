export const DROP_PRESSURE_RADIUS_METERS = 250
export const DROP_PRESSURE_RADIUS_UNITS = DROP_PRESSURE_RADIUS_METERS * 100

export type DropPressureLevel = 'calm' | 'contested' | 'hot' | 'very_hot'

export type DropPressureSample = {
  memberKey: string
  x: number
  y: number
}

export const DROP_PRESSURE_LEVELS: Record<
  DropPressureLevel,
  { label: string; color: string; min: number; max: number | null }
> = {
  calm: { label: 'Calme', color: '#22c55e', min: 0, max: 2 },
  contested: { label: 'Contesté', color: '#eab308', min: 3, max: 7 },
  hot: { label: 'Hot drop', color: '#f97316', min: 8, max: 15 },
  very_hot: { label: 'Très chaud', color: '#dc2626', min: 16, max: null },
}

export function dropPressureLevel(nearbyPlayerCount: number): DropPressureLevel {
  if (nearbyPlayerCount >= 16) return 'very_hot'
  if (nearbyPlayerCount >= 8) return 'hot'
  if (nearbyPlayerCount >= 3) return 'contested'
  return 'calm'
}

export function countNearbyPlayers(
  samples: DropPressureSample[],
  targetMemberKey: string,
  targetX: number,
  targetY: number
) {
  const normalizedTargetKey = targetMemberKey.trim().toLowerCase()
  const uniquePlayers = new Map<string, DropPressureSample>()

  for (const sample of samples) {
    const memberKey = sample.memberKey.trim().toLowerCase()
    if (!memberKey || memberKey === normalizedTargetKey || uniquePlayers.has(memberKey)) continue
    uniquePlayers.set(memberKey, sample)
  }

  let count = 0
  const radiusSquared = DROP_PRESSURE_RADIUS_UNITS ** 2
  for (const sample of uniquePlayers.values()) {
    const deltaX = sample.x - targetX
    const deltaY = sample.y - targetY
    if (deltaX ** 2 + deltaY ** 2 <= radiusSquared) {
      count += 1
    }
  }

  return count
}

export function summarizeDropPressure(
  points: Array<{ nearbyPlayerCount250m: number; pressureLevel: DropPressureLevel }>
) {
  const total = points.reduce((sum, point) => sum + point.nearbyPlayerCount250m, 0)
  const hotDropCount = points.filter(
    (point) => point.pressureLevel === 'hot' || point.pressureLevel === 'very_hot'
  ).length

  return {
    average: points.length > 0 ? total / points.length : 0,
    maximum: points.reduce(
      (max, point) => Math.max(max, point.nearbyPlayerCount250m),
      0
    ),
    hotDropCount,
    hotDropShare: points.length > 0 ? (hotDropCount / points.length) * 100 : 0,
  }
}