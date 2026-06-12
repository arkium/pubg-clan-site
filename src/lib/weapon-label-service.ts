import { prisma } from '@/lib/prisma'
import damageCauserNameData from '@/lib/pubg-assets/dictionaries/damageCauserName.json'

const WEAPON_LABELS_KEY = 'pubg_weapon_labels'
const MAX_LABEL_LENGTH = 50

export const DEFAULT_WEAPON_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(damageCauserNameData).filter(([key]) => key.startsWith('Weap'))
)

function sanitizeLabel(raw: string, fallback: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return fallback
  }

  return trimmed.slice(0, MAX_LABEL_LENGTH)
}

function parseStoredWeaponLabels(value: string | null) {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  } catch {
    return {}
  }
}

function humanizeWeaponKey(weaponName: string) {
  const withoutPrefix = weaponName.startsWith('Weap') ? weaponName.slice(4) : weaponName
  const withoutSuffix = withoutPrefix.endsWith('_C')
    ? withoutPrefix.slice(0, withoutPrefix.length - 2)
    : withoutPrefix

  return withoutSuffix.replaceAll('_', ' ').trim() || weaponName
}

export function normalizeWeaponLabels(input: Record<string, string>) {
  const keys = new Set<string>([
    ...Object.keys(DEFAULT_WEAPON_LABELS),
    ...Object.keys(input),
  ])

  const normalized: Record<string, string> = {}

  for (const key of keys) {
    const fallback = DEFAULT_WEAPON_LABELS[key] ?? humanizeWeaponKey(key)
    normalized[key] = sanitizeLabel(input[key] ?? '', fallback)
  }

  return normalized
}

export async function getWeaponLabels() {
  const config = await prisma.appConfig.findUnique({
    where: { key: WEAPON_LABELS_KEY },
    select: { value: true },
  })

  const stored = parseStoredWeaponLabels(config?.value ?? null)
  return normalizeWeaponLabels(stored)
}

export async function updateWeaponLabels(next: Record<string, string>) {
  const normalized = normalizeWeaponLabels(next)

  await prisma.appConfig.upsert({
    where: { key: WEAPON_LABELS_KEY },
    update: {
      value: JSON.stringify(normalized),
    },
    create: {
      key: WEAPON_LABELS_KEY,
      value: JSON.stringify(normalized),
    },
  })

  return normalized
}

export function weaponDisplayName(weaponName: string, weaponLabels: Record<string, string>) {
  return weaponLabels[weaponName] ?? DEFAULT_WEAPON_LABELS[weaponName] ?? humanizeWeaponKey(weaponName)
}
