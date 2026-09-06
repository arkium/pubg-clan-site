import type { ClanTeamModeFilter } from '@/types/squad-matches'

export function teamModeFromMemberCount(memberCount: number): 'duo' | 'trio' | 'squad' {
  if (memberCount <= 2) return 'duo'
  if (memberCount === 3) return 'trio'
  return 'squad'
}

export function parseClanTeamModeFilter(value: string | null): ClanTeamModeFilter {
  if (value === 'duo' || value === 'trio' || value === 'squad') return value
  return 'all'
}
