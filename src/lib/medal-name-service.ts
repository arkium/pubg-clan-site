import medalNameData from '@/lib/pubg-assets/dictionaries/weaponMastery/medalName.json'

type MedalEntry = { name: string; description: string }

export const MEDAL_NAMES = medalNameData as Record<string, MedalEntry>

export function resolveMedalName(id: string): string {
  return MEDAL_NAMES[id]?.name ?? id
}

export function resolveMedalDescription(id: string): string {
  return MEDAL_NAMES[id]?.description ?? ''
}
