import { prisma } from '@/lib/prisma'

const WEAPON_CATEGORIES_KEY = 'pubg_weapon_categories'
const CATEGORY_LABELS_KEY = 'pubg_category_labels'

export const CATEGORY_CODES = ['AR', 'DMR', 'SR', 'SMG', 'LMG', 'SG', 'Autre'] as const
export type CategoryCode = (typeof CATEGORY_CODES)[number]

export const DEFAULT_WEAPON_CATEGORIES: Record<string, CategoryCode> = {
  WeapAK47_C: 'AR',
  WeapBerylM762_C: 'AR',
  WeapACE32_C: 'AR',
  WeapGroza_C: 'AR',
  WeapM16A4_C: 'AR',
  WeapAUG_C: 'AR',
  WeapHK416_C: 'AR',
  'WeapSCAR-L_C': 'AR',
  WeapQBZ95_C: 'AR',
  WeapG36C_C: 'AR',
  WeapK2_C: 'AR',
  WeapMk47Mutant_C: 'AR',
  WeapMini14_C: 'DMR',
  WeapQBU88_C: 'DMR',
  WeapMk12_C: 'DMR',
  WeapSKS_C: 'DMR',
  WeapFNFal_C: 'DMR',
  WeapDragunov_C: 'DMR',
  WeapM24_C: 'SR',
  WeapKar98k_C: 'SR',
  WeapAWM_C: 'SR',
  WeapM249_C: 'LMG',
  WeapMG3_C: 'LMG',
  WeapRPD_C: 'LMG',
  WeapDP28_C: 'LMG',
  WeapMP5K_C: 'SMG',
  WeapMP9_C: 'SMG',
  WeapUMP_C: 'SMG',
  WeapVector_C: 'SMG',
  WeapBizonPP19_C: 'SMG',
  WeapThompson_C: 'SMG',
  WeapUZI_C: 'SMG',
  WeapP90_C: 'SMG',
  WeapSaiga12_C: 'SG',
  WeapDBS_C: 'SG',
  WeapWinchester_C: 'SG',
  WeapBerreta686_C: 'SG',
  WeapSawnoff_C: 'SG',
}

export const DEFAULT_CATEGORY_LABELS: Record<CategoryCode, string> = {
  AR: "Fusils d'assaut",
  DMR: 'Fusils de précision',
  SR: 'Snipers',
  SMG: 'Pistolets-mitrailleurs',
  LMG: 'Mitrailleuses',
  SG: 'Fusils à pompe',
  Autre: 'Autre',
}

function isValidCategoryCode(value: unknown): value is CategoryCode {
  return CATEGORY_CODES.includes(value as CategoryCode)
}

function parseStoredRecord(value: string | null): Record<string, string> {
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

export async function getWeaponCategories(): Promise<Record<string, CategoryCode>> {
  const config = await prisma.appConfig.findUnique({
    where: { key: WEAPON_CATEGORIES_KEY },
    select: { value: true },
  })
  const stored = parseStoredRecord(config?.value ?? null)
  const merged: Record<string, CategoryCode> = { ...DEFAULT_WEAPON_CATEGORIES }
  for (const [key, value] of Object.entries(stored)) {
    if (isValidCategoryCode(value)) merged[key] = value
  }
  return merged
}

export async function getCategoryLabels(): Promise<Record<CategoryCode, string>> {
  const config = await prisma.appConfig.findUnique({
    where: { key: CATEGORY_LABELS_KEY },
    select: { value: true },
  })
  const stored = parseStoredRecord(config?.value ?? null)
  const merged: Record<CategoryCode, string> = { ...DEFAULT_CATEGORY_LABELS }
  for (const code of CATEGORY_CODES) {
    if (typeof stored[code] === 'string' && stored[code].trim()) {
      merged[code] = stored[code].trim().slice(0, 50)
    }
  }
  return merged
}

export async function updateWeaponCategories(next: Record<string, string>): Promise<Record<string, CategoryCode>> {
  const validated: Record<string, CategoryCode> = {}
  for (const [key, value] of Object.entries(next)) {
    if (isValidCategoryCode(value)) validated[key] = value
  }
  await prisma.appConfig.upsert({
    where: { key: WEAPON_CATEGORIES_KEY },
    update: { value: JSON.stringify(validated) },
    create: { key: WEAPON_CATEGORIES_KEY, value: JSON.stringify(validated) },
  })
  return { ...DEFAULT_WEAPON_CATEGORIES, ...validated }
}

export async function updateCategoryLabels(next: Record<string, string>): Promise<Record<CategoryCode, string>> {
  const validated: Partial<Record<CategoryCode, string>> = {}
  for (const code of CATEGORY_CODES) {
    if (typeof next[code] === 'string' && next[code].trim()) {
      validated[code] = next[code].trim().slice(0, 50)
    }
  }
  await prisma.appConfig.upsert({
    where: { key: CATEGORY_LABELS_KEY },
    update: { value: JSON.stringify(validated) },
    create: { key: CATEGORY_LABELS_KEY, value: JSON.stringify(validated) },
  })
  return { ...DEFAULT_CATEGORY_LABELS, ...validated }
}

export function weaponCategoryCode(weaponName: string, categories: Record<string, CategoryCode>): CategoryCode {
  return categories[weaponName] ?? 'Autre'
}

export function weaponCategoryLabel(code: CategoryCode, labels: Record<CategoryCode, string>): string {
  return labels[code] ?? DEFAULT_CATEGORY_LABELS[code]
}
