/**
 * Entraînement au mortier — côté serveur (docs/features/mortier.md) : départ et fin d'une série, classement du clan.
 *
 * Le serveur tire la graine et recalcule le score à partir d'elle et des seuls réglages reçus : un client ne peut pas
 * envoyer un faux écart. Les séries d'un visiteur (sans membre actif) se jouent sans aucune écriture.
 */
import { randomBytes } from 'node:crypto'

import type { AuthSessionContext } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'

import {
  MORTAR_LEADERBOARD_SIZE,
  type MortarLeaderboard,
  type MortarLeaderboardRow,
  type MortarSeriesFinish,
  type MortarSeriesStart,
} from './mortar-api'
import {
  generateMortarTargets,
  parseMortarDifficulty,
  scoreMortarSeries,
  validateMortarShots,
  type MortarDifficulty,
} from './mortar-game'

/** Une série commencée il y a plus de deux heures ne peut plus être terminée. */
export const MORTAR_SERIES_MAX_DURATION_MS = 2 * 60 * 60_000
/**
 * Tolérance du contrôle de plausibilité : la somme des temps de visée annoncés ne peut pas dépasser le temps réel
 * écoulé côté serveur depuis le départ, à cinq secondes près (latence réseau, horloge du navigateur).
 */
export const MORTAR_TIME_TOLERANCE_MS = 5_000

type MortarSession = Pick<AuthSessionContext, 'activeMemberId'> | null

export type MortarSeriesErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'finished'
  | 'expired'
  | 'unreadable'
  | 'invalid_shots'
  | 'implausible_time'

/** Refus métier d'une fin de série ; `status` est le code HTTP que la route renvoie tel quel. */
export class MortarSeriesError extends Error {
  constructor(
    readonly code: MortarSeriesErrorCode,
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'MortarSeriesError'
  }
}

/** Graine d'une série : 10 caractères hexadécimaux (40 bits) tirés par `crypto`, imprévisibles pour le client. */
export function createMortarSeed() {
  return randomBytes(5).toString('hex')
}

export async function startMortarSeries(
  session: MortarSession,
  difficulty: MortarDifficulty,
  now: Date = new Date()
): Promise<MortarSeriesStart> {
  const seed = createMortarSeed()
  const memberId = session?.activeMemberId ?? null
  if (!memberId) return { seriesId: null, seed, difficulty, recorded: false }

  // Une seule série ouverte par joueur : une série abandonnée (onglet fermé, nouvelle partie) disparaît ici.
  await prisma.mortarSeries.deleteMany({ where: { memberId, status: 'started' } })
  const series = await prisma.mortarSeries.create({
    data: { memberId, difficulty, seed, status: 'started', startedAt: now },
    select: { id: true },
  })
  return { seriesId: series.id, seed, difficulty, recorded: true }
}

export async function finishMortarSeries(
  session: MortarSession,
  seriesId: string,
  rawShots: unknown,
  now: Date = new Date()
): Promise<MortarSeriesFinish> {
  const memberId = session?.activeMemberId ?? null
  const series = await prisma.mortarSeries.findUnique({
    where: { id: seriesId },
    select: { id: true, memberId: true, difficulty: true, seed: true, status: true, startedAt: true },
  })
  if (!series) throw new MortarSeriesError('not_found', 404, 'Série introuvable : une autre série a peut-être été lancée depuis.')
  if (!memberId || series.memberId !== memberId) {
    throw new MortarSeriesError('forbidden', 403, 'Cette série appartient à un autre joueur.')
  }
  if (series.status !== 'started') throw new MortarSeriesError('finished', 409, 'Cette série est déjà terminée.')

  const elapsedMs = now.getTime() - series.startedAt.getTime()
  if (elapsedMs > MORTAR_SERIES_MAX_DURATION_MS) {
    throw new MortarSeriesError('expired', 409, 'Série expirée : plus de deux heures depuis le départ. Lance une nouvelle série.')
  }
  const difficulty = parseMortarDifficulty(series.difficulty)
  if (!difficulty) throw new MortarSeriesError('unreadable', 409, 'Série illisible : difficulté inconnue. Lance une nouvelle série.')

  const validation = validateMortarShots(rawShots)
  if (!validation.ok) throw new MortarSeriesError('invalid_shots', 400, `${validation.error}.`)
  const shots = validation.shots

  const claimedMs = shots.reduce((sum, shot) => sum + shot.timeMs, 0)
  if (claimedMs > elapsedMs + MORTAR_TIME_TOLERANCE_MS) {
    throw new MortarSeriesError('implausible_time', 400, 'Temps de tir impossible : la série a duré moins longtemps que la somme des tirs.')
  }

  // Seuls les réglages comptent : les cibles sont reconstruites à partir de la graine gardée en base.
  const score = scoreMortarSeries(generateMortarTargets(series.seed, difficulty), shots, difficulty)

  // Record et compteur lus avant la mise à jour : la série courante est encore `started`, donc exclue.
  const previous = await prisma.mortarSeries.aggregate({
    where: { memberId, difficulty, status: 'finished' },
    _min: { meanError: true },
    _count: { _all: true },
  })
  const previousBest = previous._min.meanError ?? null

  // Mise à jour conditionnelle : deux envois simultanés de la même série n'en terminent qu'un.
  const updated = await prisma.mortarSeries.updateMany({
    where: { id: series.id, status: 'started' },
    data: {
      status: 'finished',
      meanError: score.meanError,
      hits: score.hits,
      avgTimeMs: score.avgTimeMs,
      shots: score.results,
      finishedAt: now,
    },
  })
  if (updated.count !== 1) throw new MortarSeriesError('finished', 409, 'Cette série est déjà terminée.')

  return {
    score,
    previousBest,
    isRecord: previousBest === null || score.meanError < previousBest,
    seriesCount: previous._count._all + 1,
  }
}

type MortarMemberResult = { memberId: number; displayName: string; series: number; best: number }

/** Tri du classement : meilleur écart croissant, puis plus de séries, puis nom ; rangs 1..n sans ex æquo. */
export function rankMortarResults(results: MortarMemberResult[]): MortarLeaderboardRow[] {
  return [...results]
    .sort(
      (a, b) =>
        a.best - b.best ||
        b.series - a.series ||
        a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }) ||
        a.memberId - b.memberId
    )
    .map((result, index) => ({ rank: index + 1, ...result }))
}

/** « Artilleurs du clan » : membres actifs du clan ayant terminé au moins une série à cette difficulté. */
export async function getMortarLeaderboard(
  clanId: number,
  difficulty: MortarDifficulty,
  viewerMemberId: number | null
): Promise<MortarLeaderboard> {
  const groups = await prisma.mortarSeries.groupBy({
    by: ['memberId'],
    where: { difficulty, status: 'finished', meanError: { not: null }, member: { is: { clanId, isActive: true } } },
    _count: { _all: true },
    _min: { meanError: true },
  })

  const members = groups.length
    ? await prisma.clanMember.findMany({
        where: { id: { in: groups.map((group) => group.memberId) } },
        select: { id: true, displayName: true },
      })
    : []
  const names = new Map(members.map((member) => [member.id, member.displayName]))

  const ranked = rankMortarResults(
    groups.flatMap((group) =>
      group._min.meanError === null
        ? []
        : [{ memberId: group.memberId, displayName: names.get(group.memberId) ?? '', series: group._count._all, best: group._min.meanError }]
    )
  )

  return {
    clanId,
    difficulty,
    rows: ranked.slice(0, MORTAR_LEADERBOARD_SIZE),
    viewer: viewerMemberId === null ? null : (ranked.find((row) => row.memberId === viewerMemberId) ?? null),
  }
}
