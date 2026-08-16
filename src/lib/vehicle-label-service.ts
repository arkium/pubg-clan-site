import { prisma } from '@/lib/prisma'
import damageCauserNameData from '@/lib/pubg-assets/dictionaries/damageCauserName.json'
import { isVehicleKey } from '@/lib/pubg-assets/vehicle-detection'

const VEHICLE_LABELS_KEY = 'pubg_vehicle_labels'
const MAX_LABEL_LENGTH = 50

export { isVehicleKey } from '@/lib/pubg-assets/vehicle-detection'

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
