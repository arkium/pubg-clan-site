import { prisma } from '@/lib/prisma'
import damageCauserNameData from '@/lib/pubg-assets/dictionaries/damageCauserName.json'

const VEHICLE_LABELS_KEY = 'pubg_vehicle_labels'
const MAX_LABEL_LENGTH = 50

const VEHICLE_KEY_PREFIXES = [
  'AirBoat', 'AquaRail',
  'BP_ATV', 'BP_BearV2', 'BP_BRDM', 'BP_Bicycle', 'BP_Blanc', 'BP_CoupeRB',
  'BP_DO_', 'BP_Dirtbike', 'BP_Food_Truck', 'BP_Helicopter',
  'BP_KillTruck', 'BP_LootTruck', 'BP_M_Rony', 'BP_Mirado',
  'BP_Motorbike', 'BP_Motorglider', 'BP_Niva', 'BP_PickupTruck',
  'BP_Pillar_Car', 'BP_PonyCoupe', 'BP_Porter', 'BP_Scooter',
  'BP_Snowbike', 'BP_Snowmobile', 'BP_TukTukTuk', 'BP_Van',
  'Boat_', 'Buggy_', 'Dacia_', 'EmergencyAircraft_', 'PG117_', 'Uaz_',
] as const

function isVehicleKey(key: string): boolean {
  return VEHICLE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export const DEFAULT_VEHICLE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(damageCauserNameData).filter(([key]) => isVehicleKey(key))
)

function sanitizeLabel(raw: string, fallback: string): string {
  const trimmed = raw.trim()
  return trimmed ? trimmed.slice(0, MAX_LABEL_LENGTH) : fallback
}

function parseStoredVehicleLabels(value: string | null): Record<string, string> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  } catch {
    return {}
  }
}

export function normalizeVehicleLabels(input: Record<string, string>): Record<string, string> {
  const keys = new Set<string>([
    ...Object.keys(DEFAULT_VEHICLE_LABELS),
    ...Object.keys(input),
  ])
  const normalized: Record<string, string> = {}
  for (const key of keys) {
    const fallback = DEFAULT_VEHICLE_LABELS[key] ?? key
    normalized[key] = sanitizeLabel(input[key] ?? '', fallback)
  }
  return normalized
}

export async function getVehicleLabels(): Promise<Record<string, string>> {
  const config = await prisma.appConfig.findUnique({
    where: { key: VEHICLE_LABELS_KEY },
    select: { value: true },
  })
  const stored = parseStoredVehicleLabels(config?.value ?? null)
  return normalizeVehicleLabels(stored)
}

export async function updateVehicleLabels(next: Record<string, string>): Promise<Record<string, string>> {
  const normalized = normalizeVehicleLabels(next)
  await prisma.appConfig.upsert({
    where: { key: VEHICLE_LABELS_KEY },
    update: { value: JSON.stringify(normalized) },
    create: { key: VEHICLE_LABELS_KEY, value: JSON.stringify(normalized) },
  })
  return normalized
}

export function vehicleDisplayName(vehicleId: string, vehicleLabels: Record<string, string>): string {
  return vehicleLabels[vehicleId] ?? DEFAULT_VEHICLE_LABELS[vehicleId] ?? vehicleId
}
