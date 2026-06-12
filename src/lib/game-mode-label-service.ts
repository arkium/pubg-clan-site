import gameModeData from '@/lib/pubg-assets/dictionaries/gameMode.json'

export const GAME_MODE_LABELS: Record<string, string> = gameModeData

export function gameModeDisplayName(gameModeId: string): string {
  return GAME_MODE_LABELS[gameModeId] ?? gameModeId
}
