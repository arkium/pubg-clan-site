import { prisma } from '@/lib/prisma'

const WEAPON_LABELS_KEY = 'pubg_weapon_labels'
const MAX_LABEL_LENGTH = 50

export const DEFAULT_WEAPON_LABELS: Record<string, string> = {
  WeapAK47_C: 'AKM',
  WeapBerylM762_C: 'Beryl M762',
  WeapACE32_C: 'ACE32',
  WeapGroza_C: 'Groza',
  WeapM16A4_C: 'M16A4',
  WeapAUG_C: 'AUG A3',
  WeapHK416_C: 'M416',
  'WeapSCAR-L_C': 'SCAR-L',
  WeapQBZ95_C: 'QBZ95',
  WeapG36C_C: 'G36C',
  WeapK2_C: 'K2',
  WeapMk47Mutant_C: 'Mk47 Mutant',
  WeapMini14_C: 'Mini14',
  WeapQBU88_C: 'QBU88',
  WeapMk12_C: 'Mk12',
  WeapM24_C: 'M24',
  WeapKar98k_C: 'Kar98k',
  WeapAWM_C: 'AWM',
  WeapDragunov_C: 'Dragunov',
  WeapSKS_C: 'SKS',
  WeapFNFal_C: 'SLR',
  WeapM249_C: 'M249',
  WeapMG3_C: 'MG3',
  WeapDP28_C: 'DP-28',
  WeapMP5K_C: 'MP5K',
  WeapMP9_C: 'MP9',
  WeapUMP_C: 'UMP45',
  WeapVector_C: 'Vector',
  WeapBizonPP19_C: 'PP-19 Bizon',
  WeapThompson_C: 'Tommy Gun',
  WeapUZI_C: 'Micro UZI',
  WeapP90_C: 'P90',
  WeapSaiga12_C: 'S12K',
  WeapDBS_C: 'DBS',
  WeapWinchester_C: 'S1897',
  WeapBerreta686_C: 'S686',
  WeapSawnoff_C: 'Sawed-Off',
  WeapPan_C: 'Poele',
  WeapCrossbow_1_C: 'Arbalete',
  WeapPanzerFaust100M1_C: 'Panzerfaust',
  WeapGrenade_C: 'Grenade',
  WeapMolotov_C: 'Molotov',
  EsiGameModeBase_BattleRoyaleBP_C: 'Evenement systeme',
}

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
