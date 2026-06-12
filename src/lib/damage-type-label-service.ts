import damageTypeCategoryData from '@/lib/pubg-assets/dictionaries/damageTypeCategory.json'

export const DAMAGE_TYPE_LABELS: Record<string, string> = damageTypeCategoryData

export function damageTypeDisplayName(damageTypeId: string): string {
  return DAMAGE_TYPE_LABELS[damageTypeId] ?? damageTypeId
}
