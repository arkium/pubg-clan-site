import type { ApiMock } from './api'
import { CLAN_ID, PLAYERS } from './data'
import type { MortarLeaderboard, MortarLeaderboardRow, MortarSeriesFinish, MortarSeriesStart } from '../../src/lib/mortar/mortar-api'
import {
  generateMortarTargets,
  scoreMortarSeries,
  type MortarDifficulty,
  type MortarShotInput,
} from '../../src/lib/mortar/mortar-game'

/**
 * Entraînement au mortier (`/mortier`, docs/features/mortier.md) : réponses figées des trois routes. Graine fixe, donc
 * cibles connues d'avance (`mortarTargets`) ; le test calcule les bons réglages avec les mêmes fonctions que la page.
 */

export const MORTAR_SEED = 'e2e-mortier'
export const MORTAR_SERIES_ID = 'serie-e2e-1'
export const MORTAR_FINISH_PATH = `/api/mortar/series/${MORTAR_SERIES_ID}/finish`
/** Ancien record du joueur renvoyé par la fin de série. */
export const MORTAR_PREVIOUS_BEST = 12.8

export function mortarTargets(difficulty: MortarDifficulty) {
  return generateMortarTargets(MORTAR_SEED, difficulty)
}

const VIEWER = PLAYERS[0]

function row(rank: number, playerIndex: number, best: number, series: number): MortarLeaderboardRow {
  const player = PLAYERS[playerIndex]
  return { rank, memberId: player.memberId, displayName: player.displayName, series, best }
}

/**
 * Classements : en Moyen, dix artilleurs et le lecteur 12e (ligne ajoutée en bas) ; en Facile, le lecteur 2e ; en
 * Difficile, personne. Visiteur : jamais de ligne du lecteur.
 */
export function mortarLeaderboard(difficulty: MortarDifficulty, options: { viewer?: boolean } = {}): MortarLeaderboard {
  const withViewer = options.viewer ?? true
  if (difficulty === 'hard') return { clanId: CLAN_ID, difficulty, rows: [], viewer: null }
  if (difficulty === 'easy') {
    const rows = [row(1, 3, 6.2, 12), row(2, 0, 7.9, 41), row(3, 5, 9.4, 3), row(4, 8, 14.1, 1)]
    return { clanId: CLAN_ID, difficulty, rows: withViewer ? rows : rows.filter((entry) => entry.memberId !== VIEWER.memberId), viewer: withViewer ? rows[1] : null }
  }
  const rows = Array.from({ length: 10 }, (_, index) => row(index + 1, index + 1, 7.9 + index * 1.3, 40 - index * 3))
  return { clanId: CLAN_ID, difficulty, rows, viewer: withViewer ? row(12, 0, 22.5, 2) : null }
}

export type MortarMockState = {
  starts: Array<{ difficulty: MortarDifficulty }>
  finishes: Array<{ shots: MortarShotInput[] }>
}

export function mockMortar(api: ApiMock, options: { recorded?: boolean; viewer?: boolean; finish?: Partial<MortarSeriesFinish> } = {}) {
  const recorded = options.recorded ?? true
  const state: MortarMockState = { starts: [], finishes: [] }

  api.on('POST', '/api/mortar/series', (_url, request) => {
    const body = request.postDataJSON() as { difficulty: MortarDifficulty }
    state.starts.push(body)
    const reply: MortarSeriesStart = { seriesId: recorded ? MORTAR_SERIES_ID : null, seed: MORTAR_SEED, difficulty: body.difficulty, recorded }
    return { body: reply }
  })

  api.on('POST', MORTAR_FINISH_PATH, (_url, request) => {
    const body = request.postDataJSON() as { shots: MortarShotInput[] }
    state.finishes.push(body)
    const difficulty = state.starts.at(-1)?.difficulty ?? 'medium'
    const reply: MortarSeriesFinish = {
      score: scoreMortarSeries(mortarTargets(difficulty), body.shots, difficulty),
      previousBest: MORTAR_PREVIOUS_BEST,
      isRecord: true,
      seriesCount: 3,
      ...options.finish,
    }
    return { body: reply }
  })

  api.on('GET', '/api/mortar/leaderboard', (url) => ({
    body: mortarLeaderboard((url.searchParams.get('difficulty') ?? 'medium') as MortarDifficulty, { viewer: options.viewer ?? recorded }),
  }))

  return state
}
