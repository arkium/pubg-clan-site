/**
 * Lecture de zone — côté serveur (docs/features/lecture-de-zone.md) : analyse d'une carte, séries d'entraînement,
 * classement du clan.
 *
 * - **Analyse** : toutes les parties du site (une ligne `ZoneReadingMatch` par partie), filtrées par carte, mode et
 *   période, gardées en mémoire dix minutes. Aucun nom de joueur : ce sont des cercles et des lignes de vol.
 * - **Série d'un membre** : le serveur tire les dix parties et garde leur géométrie ; il ne dévoile le cercle suivant
 *   qu'après avoir reçu la position de l'étape, et calcule seul les écarts. Le classement ne mesure donc pas la triche.
 * - **Série d'un visiteur** : tout est envoyé d'emblée et rien n'est écrit, comme au Mortier.
 */
import { randomInt } from 'node:crypto'

import type { AuthSessionContext } from '@/lib/auth-session'
import { getMapLocations } from '@/lib/map-location-service'
import { getPeriodStart, type Period } from '@/lib/period'
import { prisma } from '@/lib/prisma'
import { getMapBounds } from '@/lib/pubg-telemetry/position-heatmap'

import {
  ZONE_READING_GRID_CELLS,
  ZONE_READING_MIN_MATCHES,
  analyseZoneReading,
  densestAxis,
  encodeAxisEntry,
  gridCellLabel,
  type ZoneReadingMatchGeometry,
} from './zone-reading-analysis'
import {
  ZONE_READING_LEADERBOARD_SIZE,
  type ZoneReadingAnalysis,
  type ZoneReadingGuessResult,
  type ZoneReadingLeaderboard,
  type ZoneReadingLeaderboardRow,
  type ZoneReadingMode,
  type ZoneReadingRoundFull,
  type ZoneReadingRoundPublic,
  type ZoneReadingSeriesStart,
} from './zone-reading-api'
import {
  ZONE_READING_MIN_CIRCLES,
  ZONE_READING_ROUNDS,
  ZONE_READING_STEPS,
  parseZoneReadingGuess,
  scoreZoneReadingRound,
  scoreZoneReadingSeries,
  withPlaneForRound,
} from './zone-reading-game'
import type { Circle, FlightLine, Point } from './zone-reading-geometry'

/** Types de partie analysés : parties publiques et classées. Les événements, arcades et parties perso sont écartés. */
export const ZONE_READING_MATCH_TYPES = ['official', 'competitive']
/** Une série commencée il y a plus de deux heures ne peut plus être poursuivie. */
export const ZONE_READING_SERIES_MAX_DURATION_MS = 2 * 60 * 60_000
const ANALYSIS_CACHE_TTL_MS = 10 * 60_000

type ZoneReadingSession = Pick<AuthSessionContext, 'activeMemberId'> | null

const cm = (value: number) => Math.round(value) / 100

export function mapSizeMetersOf(mapName: string) {
  return getMapBounds(mapName).width / 100
}

type MatchRowGeometry = {
  lineStartX: number
  lineStartY: number
  lineEndX: number
  lineEndY: number
  circles: unknown
  finalX: number
  finalY: number
}

function readCircles(value: unknown): Circle[] {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((entry) => {
    const { x, y, r } = (entry ?? {}) as { x?: unknown; y?: unknown; r?: unknown }
    return typeof x === 'number' && typeof y === 'number' && typeof r === 'number' ? [{ x: cm(x), y: cm(y), r: cm(r) }] : []
  })
}

export function geometryOfRow(row: MatchRowGeometry): ZoneReadingMatchGeometry {
  return {
    line: { start: { x: cm(row.lineStartX), y: cm(row.lineStartY) }, end: { x: cm(row.lineEndX), y: cm(row.lineEndY) } },
    circles: readCircles(row.circles),
    final: { x: cm(row.finalX), y: cm(row.finalY) },
  }
}

function baseWhere(mode: ZoneReadingMode, period: Period, now: Date) {
  const start = getPeriodStart(period, now)
  return {
    teamMode: mode,
    ...(start ? { matchDate: { gte: start } } : {}),
    squadMatch: { is: { matchType: { in: ZONE_READING_MATCH_TYPES } } },
  }
}

// ── Analyse ─────────────────────────────────────────────────────────────────────────

const analysisCache = new Map<string, { at: number; value: ZoneReadingAnalysis }>()

export function resetZoneReadingCache() {
  analysisCache.clear()
}

export async function loadZoneReadingAnalysis(input: {
  mapName: string | null
  mode: ZoneReadingMode
  period: Period
  now?: Date
}): Promise<ZoneReadingAnalysis> {
  const now = input.now ?? new Date()
  const key = `${input.mapName ?? ''}|${input.mode}|${input.period}`
  const cached = analysisCache.get(key)
  if (cached && now.getTime() - cached.at < ANALYSIS_CACHE_TTL_MS) return cached.value

  const where = baseWhere(input.mode, input.period, now)
  const groups = await prisma.zoneReadingMatch.groupBy({ by: ['mapName'], where, _count: { _all: true } })
  const mapOptions = groups
    .map((group) => ({ mapName: group.mapName, matches: group._count._all }))
    .sort((left, right) => right.matches - left.matches || left.mapName.localeCompare(right.mapName))
  const mapName =
    input.mapName && mapOptions.some((option) => option.mapName === input.mapName) ? input.mapName : (mapOptions[0]?.mapName ?? null)

  const empty: ZoneReadingAnalysis = {
    mapName,
    mapSizeMeters: mapSizeMetersOf(mapName ?? ''),
    mode: input.mode,
    period: input.period,
    mapOptions,
    matchCount: 0,
    since: null,
    threshold: ZONE_READING_MIN_MATCHES,
    ready: false,
    stats: null,
    axes: [],
    defaultAxis: null,
    cellLabels: [],
  }
  if (!mapName) {
    analysisCache.set(key, { at: now.getTime(), value: empty })
    return empty
  }

  const rows = await prisma.zoneReadingMatch.findMany({
    where: { ...where, mapName },
    select: {
      matchDate: true,
      lineStartX: true,
      lineStartY: true,
      lineEndX: true,
      lineEndY: true,
      circles: true,
      finalX: true,
      finalY: true,
    },
  })
  const mapSizeMeters = mapSizeMetersOf(mapName)
  const geometries = rows.map(geometryOfRow).filter((geometry) => geometry.circles.length > 0)
  const since = rows.reduce<Date | null>((oldest, row) => (!oldest || row.matchDate < oldest ? row.matchDate : oldest), null)
  const ready = geometries.length >= ZONE_READING_MIN_MATCHES
  const axes = ready ? geometries.map((geometry) => encodeAxisEntry(geometry, mapSizeMeters)) : []

  const places = ((await getMapLocations())[mapName] ?? [])
    .filter((location) => location.enabled)
    .map(({ name, xPct, yPct, radiusPct }) => ({ name, xPct, yPct, radiusPct }))
  const cellLabels = Array.from({ length: ZONE_READING_GRID_CELLS * ZONE_READING_GRID_CELLS }, (_, index) =>
    gridCellLabel(index % ZONE_READING_GRID_CELLS, Math.floor(index / ZONE_READING_GRID_CELLS), places)
  )

  const value: ZoneReadingAnalysis = {
    ...empty,
    mapSizeMeters,
    matchCount: geometries.length,
    since: since ? since.toISOString() : null,
    ready,
    stats: ready ? analyseZoneReading(geometries) : null,
    axes,
    defaultAxis: ready ? densestAxis(axes, mapSizeMeters) : null,
    cellLabels,
  }
  analysisCache.set(key, { at: now.getTime(), value })
  return value
}

// ── Séries ──────────────────────────────────────────────────────────────────────────

export type ZoneReadingSeriesErrorCode =
  | 'not_enough_matches'
  | 'not_found'
  | 'forbidden'
  | 'finished'
  | 'expired'
  | 'unreadable'
  | 'invalid_guess'
  | 'out_of_order'

/** Refus métier ; `status` est le code HTTP que la route renvoie tel quel. */
export class ZoneReadingSeriesError extends Error {
  constructor(
    readonly code: ZoneReadingSeriesErrorCode,
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ZoneReadingSeriesError'
  }
}

/** Partie gardée avec la série : tout ce qu'il faut pour noter les étapes sans relire la télémétrie. */
export type ZoneReadingStoredRound = {
  squadMatchId: string
  matchDate: string
  mode: ZoneReadingMode
  withPlane: boolean
  line: FlightLine
  circles: Circle[]
  final: Point
  guesses: Point[]
}

function publicRound(round: ZoneReadingStoredRound, index: number, mapName: string): ZoneReadingRoundPublic {
  return {
    index,
    matchDate: round.matchDate,
    mapName,
    mode: round.mode,
    withPlane: round.withPlane,
    line: round.withPlane ? round.line : null,
    circles: round.circles.slice(0, 1),
  }
}

function fullRound(round: ZoneReadingStoredRound, index: number, mapName: string): ZoneReadingRoundFull {
  return { ...publicRound(round, index, mapName), line: round.line, circles: round.circles, final: round.final }
}

/** Tirage sans remise de `count` éléments (crypto : imprévisible pour le client). */
export function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items]
  const picked: T[] = []
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(randomInt(pool.length), 1)[0])
  }
  return picked
}

export async function startZoneReadingSeries(
  session: ZoneReadingSession,
  input: { mapName: string; mode: ZoneReadingMode; period: Period; clanId: number | null },
  now: Date = new Date()
): Promise<ZoneReadingSeriesStart> {
  const where = { ...baseWhere(input.mode, input.period, now), mapName: input.mapName, circleCount: { gte: ZONE_READING_MIN_CIRCLES } }

  // Parties du clan d'abord : rejouer « nos » parties. Le site entier sert de repli quand le clan en a trop peu.
  let source: 'clan' | 'site' = 'site'
  let candidates: Array<{ squadMatchId: string }> = []
  if (input.clanId) {
    candidates = await prisma.zoneReadingMatch.findMany({
      where: { ...where, squadMatch: { is: { ...where.squadMatch.is, members: { some: { member: { is: { clanId: input.clanId } } } } } } },
      select: { squadMatchId: true },
    })
    if (candidates.length >= ZONE_READING_ROUNDS) source = 'clan'
  }
  if (source === 'site') candidates = await prisma.zoneReadingMatch.findMany({ where, select: { squadMatchId: true } })
  if (candidates.length < ZONE_READING_ROUNDS) {
    throw new ZoneReadingSeriesError('not_enough_matches', 409, 'Pas assez de parties sur cette carte pour une série : change de carte ou de période.')
  }

  const ids = pickRandom(candidates, ZONE_READING_ROUNDS).map((candidate) => candidate.squadMatchId)
  const rows = await prisma.zoneReadingMatch.findMany({
    where: { squadMatchId: { in: ids } },
    select: {
      squadMatchId: true,
      matchDate: true,
      teamMode: true,
      lineStartX: true,
      lineStartY: true,
      lineEndX: true,
      lineEndY: true,
      circles: true,
      finalX: true,
      finalY: true,
    },
  })
  const byId = new Map(rows.map((row) => [row.squadMatchId, row]))
  const rounds: ZoneReadingStoredRound[] = ids.flatMap((id, index) => {
    const row = byId.get(id)
    if (!row) return []
    const geometry = geometryOfRow(row)
    return [
      {
        squadMatchId: id,
        matchDate: row.matchDate.toISOString(),
        mode: row.teamMode === 'duo' ? 'duo' : 'squad',
        withPlane: withPlaneForRound(index),
        line: geometry.line,
        circles: geometry.circles.slice(0, ZONE_READING_STEPS),
        final: geometry.final,
        guesses: [],
      },
    ]
  })
  if (rounds.length < ZONE_READING_ROUNDS) {
    throw new ZoneReadingSeriesError('not_enough_matches', 409, 'Parties introuvables : relance une série.')
  }

  const base = { mapName: input.mapName, mapSizeMeters: mapSizeMetersOf(input.mapName), source }
  const memberId = session?.activeMemberId ?? null
  if (!memberId) {
    return { seriesId: null, recorded: false, ...base, rounds: rounds.map((round, index) => fullRound(round, index, input.mapName)) }
  }

  // Une seule série ouverte par joueur : une série abandonnée disparaît ici.
  await prisma.zoneReadingSeries.deleteMany({ where: { memberId, status: 'started' } })
  const series = await prisma.zoneReadingSeries.create({
    data: { memberId, mapName: input.mapName, status: 'started', progress: 0, rounds, startedAt: now },
    select: { id: true },
  })
  return { seriesId: series.id, recorded: true, ...base, rounds: rounds.map((round, index) => publicRound(round, index, input.mapName)) }
}

function readStoredRounds(value: unknown): ZoneReadingStoredRound[] | null {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value
  if (!Array.isArray(parsed) || parsed.length !== ZONE_READING_ROUNDS) return null
  return parsed as ZoneReadingStoredRound[]
}

export async function submitZoneReadingGuess(
  session: ZoneReadingSession,
  seriesId: string,
  body: unknown,
  now: Date = new Date()
): Promise<ZoneReadingGuessResult> {
  const memberId = session?.activeMemberId ?? null
  const series = await prisma.zoneReadingSeries.findUnique({
    where: { id: seriesId },
    select: { id: true, memberId: true, mapName: true, status: true, progress: true, rounds: true, startedAt: true },
  })
  if (!series) throw new ZoneReadingSeriesError('not_found', 404, 'Série introuvable : une autre série a peut-être été lancée depuis.')
  if (!memberId || series.memberId !== memberId) throw new ZoneReadingSeriesError('forbidden', 403, 'Cette série appartient à un autre joueur.')
  if (series.status !== 'started') throw new ZoneReadingSeriesError('finished', 409, 'Cette série est déjà terminée.')
  if (now.getTime() - series.startedAt.getTime() > ZONE_READING_SERIES_MAX_DURATION_MS) {
    throw new ZoneReadingSeriesError('expired', 409, 'Série expirée : plus de deux heures depuis le départ. Lance une nouvelle série.')
  }

  let rounds: ZoneReadingStoredRound[] | null = null
  try {
    rounds = readStoredRounds(series.rounds)
  } catch {
    rounds = null
  }
  if (!rounds) throw new ZoneReadingSeriesError('unreadable', 409, 'Série illisible. Lance une nouvelle série.')

  const payload = (body ?? {}) as { round?: unknown; step?: unknown }
  const guess = parseZoneReadingGuess(body, mapSizeMetersOf(series.mapName))
  if (!guess || !Number.isInteger(payload.round) || !Number.isInteger(payload.step)) {
    throw new ZoneReadingSeriesError('invalid_guess', 400, 'Position invalide : x et y en mètres, dans la carte.')
  }
  const roundIndex = Math.floor(series.progress / ZONE_READING_STEPS)
  const step = (series.progress % ZONE_READING_STEPS) + 1
  if (payload.round !== roundIndex || payload.step !== step) {
    throw new ZoneReadingSeriesError('out_of_order', 409, `Étape inattendue : la série attend la partie ${roundIndex + 1}, cercle ${step}.`)
  }

  const round = rounds[roundIndex]
  round.guesses = [...(round.guesses ?? []).slice(0, step - 1), guess]
  const progress = series.progress + 1

  if (step < ZONE_READING_STEPS) {
    await commit(series.id, series.progress, { progress, rounds })
    return { kind: 'circle', round: roundIndex, step: step + 1, circle: round.circles[step] }
  }

  const score = scoreZoneReadingRound(round, round.guesses)
  const reveal = { round: roundIndex, line: round.line, circles: round.circles, final: round.final, score }
  if (roundIndex < ZONE_READING_ROUNDS - 1) {
    await commit(series.id, series.progress, { progress, rounds })
    return { kind: 'reveal', reveal, finish: null }
  }

  const seriesScore = scoreZoneReadingSeries(
    rounds.map((entry, index) => {
      const result = index === roundIndex ? score : scoreZoneReadingRound(entry, entry.guesses ?? [])
      return { index, withPlane: entry.withPlane, you: result.you, center: result.center, line: result.line }
    })
  )
  // Record et compteur lus avant la mise à jour : la série courante est encore `started`, donc exclue.
  const previous = await prisma.zoneReadingSeries.aggregate({
    where: { memberId, mapName: series.mapName, status: 'finished' },
    _min: { meanError: true },
    _count: { _all: true },
  })
  const previousBest = previous._min.meanError ?? null
  await commit(series.id, series.progress, {
    progress,
    rounds,
    status: 'finished',
    meanError: seriesScore.meanError,
    betterThanCenter: seriesScore.betterThanCenter,
    betterThanLine: seriesScore.betterThanLine,
    withPlaneError: seriesScore.withPlane.meanError,
    withoutPlaneError: seriesScore.withoutPlane.meanError,
    finishedAt: now,
  })
  return {
    kind: 'reveal',
    reveal,
    finish: {
      score: seriesScore,
      previousBest,
      isRecord: previousBest === null || seriesScore.meanError < previousBest,
      seriesCount: previous._count._all + 1,
    },
  }
}

/** Mise à jour conditionnelle : deux envois simultanés de la même étape n'en comptent qu'un. */
async function commit(
  id: string,
  expectedProgress: number,
  data: {
    progress: number
    rounds: ZoneReadingStoredRound[]
    status?: string
    meanError?: number
    betterThanCenter?: number
    betterThanLine?: number
    withPlaneError?: number | null
    withoutPlaneError?: number | null
    finishedAt?: Date
  }
) {
  const updated = await prisma.zoneReadingSeries.updateMany({
    where: { id, status: 'started', progress: expectedProgress },
    data,
  })
  if (updated.count !== 1) throw new ZoneReadingSeriesError('out_of_order', 409, 'Cette étape a déjà été jouée.')
}

// ── Classement ──────────────────────────────────────────────────────────────────────

type MemberResult = { memberId: number; displayName: string; series: number; average: number }

/** Écart moyen croissant, puis plus de séries, puis nom ; rangs 1..n sans ex æquo. */
export function rankZoneReadingResults(results: MemberResult[]): ZoneReadingLeaderboardRow[] {
  return [...results]
    .sort(
      (a, b) =>
        a.average - b.average ||
        b.series - a.series ||
        a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }) ||
        a.memberId - b.memberId
    )
    .map((result, index) => ({ rank: index + 1, ...result }))
}

/** « Le clan » : membres actifs du clan ayant terminé au moins une série sur cette carte. */
export async function getZoneReadingLeaderboard(
  clanId: number,
  mapName: string,
  viewerMemberId: number | null
): Promise<ZoneReadingLeaderboard> {
  const groups = await prisma.zoneReadingSeries.groupBy({
    by: ['memberId'],
    where: { mapName, status: 'finished', meanError: { not: null }, member: { is: { clanId, isActive: true } } },
    _count: { _all: true },
    _avg: { meanError: true },
  })
  const members = groups.length
    ? await prisma.clanMember.findMany({
        where: { id: { in: groups.map((group) => group.memberId) } },
        select: { id: true, displayName: true },
      })
    : []
  const names = new Map(members.map((member) => [member.id, member.displayName]))
  const ranked = rankZoneReadingResults(
    groups.flatMap((group) =>
      group._avg.meanError === null
        ? []
        : [
            {
              memberId: group.memberId,
              displayName: names.get(group.memberId) ?? '',
              series: group._count._all,
              average: Math.round(group._avg.meanError * 10) / 10,
            },
          ]
    )
  )
  return {
    clanId,
    mapName,
    rows: ranked.slice(0, ZONE_READING_LEADERBOARD_SIZE),
    viewer: viewerMemberId === null ? null : (ranked.find((row) => row.memberId === viewerMemberId) ?? null),
  }
}
