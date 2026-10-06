import type { ApiMock } from './api'
import { CLAN_ID, PLAYERS } from './data'
import {
  ZONE_READING_MIN_MATCHES,
  analyseZoneReading,
  densestAxis,
  encodeAxisEntry,
  type ZoneReadingMatchGeometry,
} from '../../src/lib/zone-reading/zone-reading-analysis'
import type {
  ZoneReadingAnalysis,
  ZoneReadingGuessResult,
  ZoneReadingLeaderboard,
  ZoneReadingRoundFull,
  ZoneReadingSeriesStart,
} from '../../src/lib/zone-reading/zone-reading-api'
import {
  ZONE_READING_ROUNDS,
  ZONE_READING_STEPS,
  scoreZoneReadingRound,
  scoreZoneReadingSeries,
  withPlaneForRound,
} from '../../src/lib/zone-reading/zone-reading-game'
import { axisPivot, axisSegment, type Circle, type Point } from '../../src/lib/zone-reading/zone-reading-geometry'

/**
 * Lecture de zone (`/lecture-de-zone`, docs/features/lecture-de-zone.md) : réponses figées des quatre routes. Les
 * parties sont synthétiques mais déterministes (générateur à graine), et l'analyse est calculée avec les mêmes
 * fonctions que le serveur : le test compare la page aux titres attendus sans recopier de texte.
 */

export const ZONE_SERIES_ID = 'serie-e2e-zone'
export const ZONE_GUESS_PATH = `/api/zone-reading/series/${ZONE_SERIES_ID}/guess`
export const ZONE_PREVIOUS_BEST = 412.3

const MAP_SIZES: Record<string, number> = { Baltic_Main: 8192, Desert_Main: 8192, Heaven_Main: 1024 }
export const ZONE_MAP_COUNTS: Record<string, number> = { Baltic_Main: 360, Desert_Main: 320, Heaven_Main: 40 }

function generator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

/** Parties d'une carte : ligne de vol au hasard, cercle 1 traversé par la ligne, cercles suivants emboîtés. */
export function zoneMatches(mapName: string): ZoneReadingMatchGeometry[] {
  const size = MAP_SIZES[mapName] ?? 8192
  const scale = size / 8192
  const random = generator(mapName.length * 7919 + (ZONE_MAP_COUNTS[mapName] ?? 0))
  const radii = [1900, 1050, 630, 380, 250, 160].map((radius) => radius * scale)
  return Array.from({ length: ZONE_MAP_COUNTS[mapName] ?? 0 }, () => {
    const axis = { angleDeg: random() * 180, offset: (random() - 0.5) * size * 0.5 }
    const line = axisSegment(axis, size) ?? { start: { x: 0, y: size / 2 }, end: { x: size, y: size / 2 } }
    const pivot = axisPivot(axis, size)
    const radians = (axis.angleDeg * Math.PI) / 180
    const along = (random() - 0.5) * size * 0.4
    const across = (random() - 0.5) * 2 * radii[0] * 0.6
    const clamp = (value: number, radius: number) => Math.max(radius * 0.4, Math.min(size - radius * 0.4, value))
    const circles: Circle[] = [
      {
        x: clamp(pivot.x + Math.cos(radians) * along - Math.sin(radians) * across, radii[0]),
        y: clamp(pivot.y + Math.sin(radians) * along + Math.cos(radians) * across, radii[0]),
        r: radii[0],
      },
    ]
    for (const radius of radii.slice(1)) {
      const previous = circles[circles.length - 1]
      const angle = random() * Math.PI * 2
      const shift = random() * (previous.r - radius)
      circles.push({ x: previous.x + Math.cos(angle) * shift, y: previous.y + Math.sin(angle) * shift, r: radius })
    }
    const last = circles[circles.length - 1]
    return { line, circles, final: { x: last.x, y: last.y } }
  })
}

const CELL_NAMES: Record<number, string> = { 27: 'Pochinki', 28: 'sud de School', 36: 'Rozhok', 19: 'nord de Pochinki' }

export function zoneReadingAnalysis(url: URL): ZoneReadingAnalysis {
  const requested = url.searchParams.get('map')
  const mode = url.searchParams.get('mode') === 'duo' ? 'duo' : 'squad'
  const period = url.searchParams.get('period') ?? 'all'
  const mapOptions = Object.entries(ZONE_MAP_COUNTS)
    .map(([mapName, matches]) => ({ mapName, matches }))
    .sort((left, right) => right.matches - left.matches)
  const mapName = requested && ZONE_MAP_COUNTS[requested] ? requested : mapOptions[0].mapName
  const size = MAP_SIZES[mapName]
  const matches = zoneMatches(mapName)
  const ready = matches.length >= ZONE_READING_MIN_MATCHES
  const axes = ready ? matches.map((match) => encodeAxisEntry(match, size)) : []
  return {
    mapName,
    mapSizeMeters: size,
    mode,
    period,
    mapOptions,
    matchCount: matches.length,
    since: '2026-07-04T19:00:00.000Z',
    threshold: ZONE_READING_MIN_MATCHES,
    ready,
    stats: ready ? analyseZoneReading(matches) : null,
    axes,
    defaultAxis: ready ? densestAxis(axes, size) : null,
    cellLabels: Array.from({ length: 64 }, (_, index) => CELL_NAMES[index] ?? ''),
  }
}

/** Les dix parties d'une série : les dix premières parties de la carte, une sur deux sans avion. */
export function zoneSeriesRounds(mapName = 'Baltic_Main'): ZoneReadingRoundFull[] {
  return zoneMatches(mapName)
    .slice(0, ZONE_READING_ROUNDS)
    .map((match, index) => ({
      index,
      matchDate: '2026-09-12T20:00:00.000Z',
      mapName,
      mode: 'squad',
      withPlane: withPlaneForRound(index),
      line: match.line,
      circles: match.circles.slice(0, ZONE_READING_STEPS),
      final: match.final,
    }))
}

export function zoneLeaderboard(mapName: string, options: { viewer?: boolean } = {}): ZoneReadingLeaderboard {
  const rows = [
    { rank: 1, memberId: PLAYERS[3].memberId, displayName: PLAYERS[3].displayName, series: 31, average: 162 },
    { rank: 2, memberId: PLAYERS[0].memberId, displayName: PLAYERS[0].displayName, series: 9, average: 214 },
    { rank: 3, memberId: PLAYERS[5].memberId, displayName: PLAYERS[5].displayName, series: 3, average: 344 },
  ]
  const withViewer = options.viewer ?? false
  return {
    clanId: CLAN_ID,
    mapName,
    rows: withViewer ? rows : rows.filter((row) => row.memberId !== PLAYERS[0].memberId),
    viewer: withViewer ? rows[1] : null,
  }
}

export type ZoneReadingMockState = {
  starts: Array<{ map: string; mode: string; period: string; clanId: number | null }>
  guesses: Array<{ round: number; step: number; x: number; y: number }>
}

/**
 * Les quatre routes. `recorded` : membre connecté, les cercles et la zone finale ne passent que par `…/guess`, qui
 * rejoue la logique du serveur (ordre des étapes, écarts, bilan, record).
 */
export function mockZoneReading(api: ApiMock, options: { recorded?: boolean } = {}) {
  const recorded = options.recorded ?? false
  const state: ZoneReadingMockState = { starts: [], guesses: [] }
  let rounds = zoneSeriesRounds()
  let guesses: Point[][] = rounds.map(() => [])

  api.on('GET', '/api/zone-reading', (url) => ({ body: zoneReadingAnalysis(url) }))
  api.on('GET', '/api/zone-reading/leaderboard', (url) => ({ body: zoneLeaderboard(url.searchParams.get('map') ?? 'Baltic_Main', { viewer: recorded }) }))

  api.on('POST', '/api/zone-reading/series', (_url, request) => {
    const body = request.postDataJSON() as ZoneReadingMockState['starts'][number]
    state.starts.push(body)
    rounds = zoneSeriesRounds(ZONE_MAP_COUNTS[body.map] ? body.map : 'Baltic_Main')
    guesses = rounds.map(() => [])
    const base = { mapName: rounds[0].mapName, mapSizeMeters: MAP_SIZES[rounds[0].mapName], source: 'clan' as const }
    const reply: ZoneReadingSeriesStart = recorded
      ? {
          seriesId: ZONE_SERIES_ID,
          recorded: true,
          ...base,
          rounds: rounds.map((round) => ({
            index: round.index,
            matchDate: round.matchDate,
            mapName: round.mapName,
            mode: round.mode,
            withPlane: round.withPlane,
            line: round.withPlane ? round.line : null,
            circles: round.circles.slice(0, 1),
          })),
        }
      : { seriesId: null, recorded: false, ...base, rounds }
    return { status: recorded ? 201 : 200, body: reply }
  })

  api.on('POST', ZONE_GUESS_PATH, (_url, request) => {
    const body = request.postDataJSON() as ZoneReadingMockState['guesses'][number]
    state.guesses.push(body)
    const round = rounds[body.round]
    const list = guesses[body.round]
    list.push({ x: body.x, y: body.y })
    if (body.step < ZONE_READING_STEPS) {
      const reply: ZoneReadingGuessResult = { kind: 'circle', round: body.round, step: body.step + 1, circle: round.circles[body.step] }
      return { body: reply }
    }
    const score = scoreZoneReadingRound(round, list)
    const reveal = { round: body.round, line: round.line, circles: round.circles, final: round.final, score }
    if (body.round < ZONE_READING_ROUNDS - 1) return { body: { kind: 'reveal', reveal, finish: null } satisfies ZoneReadingGuessResult }
    const seriesScore = scoreZoneReadingSeries(
      rounds.map((entry, index) => {
        const result = scoreZoneReadingRound(entry, guesses[index])
        return { index, withPlane: entry.withPlane, you: result.you, center: result.center, line: result.line }
      })
    )
    const reply: ZoneReadingGuessResult = {
      kind: 'reveal',
      reveal,
      finish: { score: seriesScore, previousBest: ZONE_PREVIOUS_BEST, isRecord: seriesScore.meanError < ZONE_PREVIOUS_BEST, seriesCount: 4 },
    }
    return { body: reply }
  })

  return state
}
