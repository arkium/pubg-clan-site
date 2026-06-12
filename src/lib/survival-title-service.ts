import survivalTitlesData from '@/lib/pubg-assets/survivalTitles.json'

type SurvivalTitleEntry = {
  title: number
  minPoints: number
  maxPoints: number | null
  hasLevels: boolean
}

export const SURVIVAL_TITLES = survivalTitlesData as Record<string, SurvivalTitleEntry>

export type SurvivalTitleKey =
  | 'UNKNOWN' | 'BEGINNER' | 'NOVICE' | 'EXPERIENCED'
  | 'SKILLED' | 'SPECIALIST' | 'EXPERT' | 'SURVIVOR' | 'LONE SURVIVOR'

/** Returns the title key for a given survival points total. */
export function survivalTitleFromPoints(sp: number): SurvivalTitleKey {
  const ordered: SurvivalTitleKey[] = [
    'LONE SURVIVOR', 'SURVIVOR', 'EXPERT',
    'SPECIALIST', 'SKILLED', 'EXPERIENCED', 'NOVICE', 'BEGINNER',
  ]
  for (const key of ordered) {
    const entry = SURVIVAL_TITLES[key]
    if (!entry) continue
    if (sp >= entry.minPoints && (entry.maxPoints === null || sp <= entry.maxPoints)) {
      return key
    }
  }
  return 'UNKNOWN'
}

/** Title-cases a survival title key for display (e.g. "LONE SURVIVOR" → "Lone Survivor"). */
export function formatSurvivalTitle(key: string): string {
  return key
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Returns level within a title (1–5) based on SP offset, or null for single-level titles. */
export function survivalLevelFromPoints(sp: number): number | null {
  const key = survivalTitleFromPoints(sp)
  const entry = SURVIVAL_TITLES[key]
  if (!entry?.hasLevels) return null
  const offset = sp - entry.minPoints
  const level = 5 - Math.floor(offset / 200)
  return Math.max(1, Math.min(5, level))
}
