export type TelemetryPoint = {
  memberId: number
  memberName: string
  matchId: string
  mapName: string
  x: number
  y: number
  timestampSeconds: number | null
  phase: number
  inVehicle?: boolean
}

export type TelemetrySegment = {
  memberId: number
  memberName: string
  matchId: string
  mapName: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  timestampStart: number | null
  timestampEnd: number | null
  phase: number
}

export type TelemetryHeatmapMapKey = 'Baltic_Main' | 'Savage_Main' | 'Desert_Main' | 'DihorOtok_Main' | 'Range_Main' | 'Summerland_Main' | 'Tiger_Main' | 'Kiki_Main' | 'Chimera_Main' | 'Heaven_Main' | 'Neon_Main'

type MapBounds = {
  width: number
  height: number
}

const DEFAULT_BOUNDS: MapBounds = { width: 819200, height: 819200 }

const MAP_BOUNDS: Record<string, MapBounds> = {
  Baltic_Main: { width: 819200, height: 819200 },
  Desert_Main: { width: 819200, height: 819200 },
  Savage_Main: { width: 409600, height: 409600 },
  DihorOtok_Main: { width: 614400, height: 614400 },
  Range_Main: { width: 819200, height: 819200 },
  Summerland_Main: { width: 204800, height: 204800 },
  Tiger_Main: { width: 819200, height: 819200 },
  Kiki_Main: { width: 819200, height: 819200 },
  Chimera_Main: { width: 307200, height: 307200 },
  Heaven_Main: { width: 102400, height: 102400 },
  Neon_Main: { width: 819200, height: 819200 },
}

export function getMapBounds(mapName: string): MapBounds {
  return MAP_BOUNDS[mapName] ?? DEFAULT_BOUNDS
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function toMapPercent(mapName: string, x: number, y: number) {
  const bounds = getMapBounds(mapName)
  return {
    x: clamp01(x / bounds.width) * 100,
    y: clamp01(y / bounds.height) * 100,
  }
}

export function pointDistance(left: { x: number; y: number }, right: { x: number; y: number }) {
  const dx = right.x - left.x
  const dy = right.y - left.y
  return Math.sqrt(dx * dx + dy * dy)
}
