import type { ApiMock } from './api'
import { sessionToday } from './career'
import { CLAN_ID, MEMBER_ID } from './data'
import { mockMemberProfile } from './members'

/**
 * Carnet de vol d'un joueur (e2e/player-matches.spec.ts) : 21 parties sur 6 soirées, les quatre modes (dont « Sans le
 * clan »), télémétrie prête, expirée et en attente. Chiffres inventés, dates relatives à l'heure du test.
 */

const daysBefore = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

type Mode = 'duo' | 'trio' | 'squad' | 'solo'
// [jours avant aujourd'hui, place, kills, mode, carte]
type Game = [number, number, number, Mode, string]
const GAMES: Game[] = [
  [12, 14, 1, 'squad', 'Baltic_Main'],
  [12, 3, 4, 'squad', 'Desert_Main'],
  [12, 22, 0, 'solo', 'Baltic_Main'],
  [9, 7, 2, 'duo', 'Savage_Main'],
  [9, 1, 6, 'duo', 'Baltic_Main'],
  [9, 18, 1, 'duo', 'Tiger_Main'],
  [9, 5, 3, 'trio', 'Desert_Main'],
  [6, 9, 2, 'squad', 'Baltic_Main'],
  [6, 2, 5, 'squad', 'Neon_Main'],
  [6, 30, 0, 'squad', 'Baltic_Main'],
  [6, 11, 1, 'solo', 'Desert_Main'],
  [6, 4, 4, 'squad', 'Baltic_Main'],
  [3, 6, 3, 'trio', 'Savage_Main'],
  [3, 12, 1, 'trio', 'Baltic_Main'],
  [1, 1, 8, 'squad', 'Baltic_Main'],
  [1, 8, 2, 'squad', 'Desert_Main'],
  [1, 16, 1, 'squad', 'Tiger_Main'],
  [1, 2, 4, 'duo', 'Baltic_Main'],
  [0, 5, 3, 'squad', 'Baltic_Main'],
  [0, 1, 7, 'squad', 'Desert_Main'],
  [0, 19, 0, 'squad', 'Baltic_Main'],
]

const MATES: Record<Mode, string[]> = { solo: [], duo: ['Joueur Bravo'], trio: ['Joueur Bravo', 'Joueur Charlie'], squad: ['Joueur Bravo', 'Joueur Charlie', 'Joueur Delta'] }

export function playerMatches() {
  const today = sessionToday()
  const counters = new Map<number, number>()
  return GAMES.map(([days, placement, kills, mode, mapName], index) => {
    const date = daysBefore(today, days)
    const slot = counters.get(days) ?? 0
    counters.set(days, slot + 1)
    // 19:00 UTC = 21:00 à Paris, puis une partie toutes les 30 minutes : même soirée.
    const createdAt = new Date(Date.parse(`${date}T19:00:00Z`) + slot * 30 * 60_000).toISOString()
    const squad = mode !== 'solo'
    const telemetryStatus = !squad ? null : days === 12 ? 'expired' : days === 0 && slot === 2 ? 'pending' : 'success'
    return {
      id: `m-${index + 1}`,
      pubgMatchId: `p-${index + 1}`,
      clanMode: mode,
      mapName,
      gameMode: 'squad-fpp',
      matchType: 'official',
      duration: 1500 + slot * 60,
      placement,
      kills,
      damageDealt: kills * 110 + 80,
      assists: slot % 3,
      revives: slot % 2,
      pubgCreatedAt: createdAt,
      squad: MATES[mode],
      clanId: squad ? CLAN_ID : null,
      squadMatchId: squad ? `sm-${index + 1}` : null,
      telemetryAvailable: telemetryStatus === 'success',
      teamCount: telemetryStatus === 'success' ? 28 : null,
      telemetryStatus,
    }
  }).reverse()
}

export function mockPlayerMatches(api: ApiMock) {
  mockMemberProfile(api)
  api.on('GET', `/api/members/${MEMBER_ID}/matches`, () => {
    const matches = playerMatches()
    return { body: { sortBy: 'pubgCreatedAt', sortDirection: 'desc', matches, totalCount: matches.length, mapLabels: { Baltic_Main: 'Erangel', Desert_Main: 'Miramar', Savage_Main: 'Sanhok', Tiger_Main: 'Taego', Neon_Main: 'Rondo' } } }
  })
}

export const sessionDaysAgo = (days: number) => daysBefore(sessionToday(), days)
