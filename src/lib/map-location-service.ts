import { prisma } from '@/lib/prisma'
import { DEFAULT_MAP_LOCATIONS } from '@/lib/map-location-defaults'

const MAP_LOCATIONS_KEY = 'pubg_map_locations'
const MAX_LOCATION_NAME_LENGTH = 60
const MAX_LOCATIONS_PER_MAP = 100

export type MapLocation = {
  id: string
  name: string
  mapName: string
  xPct: number
  yPct: number
  radiusPct: number
  enabled: boolean
}

export type MapLocations = Record<string, MapLocation[]>

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(2))
}

function normalizeLocation(raw: MapLocation, mapName: string): MapLocation | null {
  const id = raw.id.trim().slice(0, 80)
  const name = raw.name.trim().slice(0, MAX_LOCATION_NAME_LENGTH)
  if (!id || !name) return null

  return {
    id,
    name,
    mapName,
    xPct: roundCoordinate(clamp(raw.xPct, 0, 100)),
    yPct: roundCoordinate(clamp(raw.yPct, 0, 100)),
    radiusPct: roundCoordinate(clamp(raw.radiusPct, 0.25, 25)),
    enabled: raw.enabled,
  }
}

export function normalizeMapLocations(input: MapLocations): MapLocations {
  const normalized: MapLocations = {}

  for (const [mapName, locations] of Object.entries(input)) {
    if (!mapName.trim() || !Array.isArray(locations)) continue

    const seenIds = new Set<string>()
    normalized[mapName] = locations
      .slice(0, MAX_LOCATIONS_PER_MAP)
      .map((location) => normalizeLocation(location, mapName))
      .filter((location): location is MapLocation => {
        if (!location || seenIds.has(location.id)) return false
        seenIds.add(location.id)
        return true
      })
  }

  return normalized
}

function parseStoredMapLocations(value: string | null): MapLocations {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value) as MapLocations
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return normalizeMapLocations(parsed)
  } catch {
    return {}
  }
}

export async function getMapLocations() {
  const config = await prisma.appConfig.findUnique({
    where: { key: MAP_LOCATIONS_KEY },
    select: { value: true },
  })

  if (!config) {
    return normalizeMapLocations(DEFAULT_MAP_LOCATIONS)
  }

  return parseStoredMapLocations(config.value)
}

export function getDefaultMapLocations() {
  return normalizeMapLocations(DEFAULT_MAP_LOCATIONS)
}

export async function updateMapLocations(next: MapLocations) {
  const normalized = normalizeMapLocations(next)

  await prisma.appConfig.upsert({
    where: { key: MAP_LOCATIONS_KEY },
    update: { value: JSON.stringify(normalized) },
    create: { key: MAP_LOCATIONS_KEY, value: JSON.stringify(normalized) },
  })

  return normalized
}