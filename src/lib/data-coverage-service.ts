import 'server-only'

import { Prisma } from '@prisma/client'

import { sessionDateOf } from '@/lib/match-sessions'
import { prisma } from '@/lib/prisma'
import { TELEMETRY_LIVE_SYNC_QUEUE_ACTION } from '@/lib/pubg-telemetry/live-sync-queue'
import { TELEMETRY_RESYNC_QUEUE_ACTION } from '@/lib/pubg-telemetry/resync-queue'

/**
 * Depuis quand le site a les données d'un joueur ou d'un clan, famille par famille (docs/TODO/aide-des-pages.md, D4) :
 * une seule lecture pour l'outil `getDataCoverage` du Coach IA et pour la barre « D'où viennent ces chiffres ? » des
 * pages, qui donnent donc les mêmes dates. Dates de soirée (heure de Paris, journée de 06:00, `sessionDateOf`).
 *
 * Le joueur : ses propres lignes, quel que soit le clan où il jouait (les lignes portent le clan du moment). Le clan :
 * les lignes de ses membres actifs, comme ses pages (`clanPlacementMemberWhere`). Aucun pseudo, aucun compte : des
 * dates et des volumes seulement — la route du clan est publique en mode visiteur.
 */

export type CoverageSpan = { since: string | null; until: string | null; count?: number }

export type ClanMatchesCoverage = {
  firstSession: string | null
  firstMatchAt: string | null
  lastSession: string | null
  lastMatchAt: string | null
  count: number
}

export type TelemetryCoverage = { since: string | null; until: string | null; analyzed: number; of: number; percent: number }

type CommonCoverage = {
  /** Parties avec le clan (`SquadMatch`) : la base de la plupart des pages. */
  clanMatches: ClanMatchesCoverage
  /** Parties dont le déroulé est analysé (télémétrie `success`) : largages, kill feed, positions, fins de zone. */
  telemetry: TelemetryCoverage
  drops: CoverageSpan
  closures: CoverageSpan
  items: CoverageSpan
}

export type ClanDataCoverage = CommonCoverage & { scope: 'clan'; activeMembers: number }

export type MemberDataCoverage = CommonCoverage & {
  scope: 'member'
  /** Arrivée du joueur sur le site (création de sa ligne de membre). */
  onSiteSince: string | null
  /** Ses parties PUBG suivies, même sans coéquipier du clan (`Match`) : base de son calendrier et de son tableau de bord. */
  pubgMatches: CoverageSpan & { byType: Array<{ matchType: string; count: number }> }
  kills: CoverageSpan
  positions: CoverageSpan
  careerSyncedAt: string | null
}

type SquadRange = {
  firstAt: Date | null
  lastAt: Date | null
  matches: bigint | number
  analyzed: bigint | number | string | null
  analyzedFirst: Date | null
  analyzedLast: Date | null
}

type DateAggregate = { _min: Record<string, Date | null>; _max: Record<string, Date | null>; _count?: { _all: number } }

const day = (value: Date | null | undefined) => (value ? sessionDateOf(value) : null)

function spanOf(row: DateAggregate, field: string): CoverageSpan {
  return { since: day(row._min[field]), until: day(row._max[field]), ...(row._count ? { count: row._count._all } : {}) }
}

function squadCoverage(squad: SquadRange | undefined): Pick<CommonCoverage, 'clanMatches' | 'telemetry'> {
  const count = Number(squad?.matches ?? 0)
  const analyzed = Number(squad?.analyzed ?? 0)
  const lastAt = squad?.lastAt ? new Date(squad.lastAt) : null
  return {
    clanMatches: {
      firstSession: count > 0 ? day(squad?.firstAt) : null,
      firstMatchAt: count > 0 && squad?.firstAt ? new Date(squad.firstAt).toISOString() : null,
      lastSession: count > 0 ? day(lastAt) : null,
      lastMatchAt: count > 0 && lastAt ? lastAt.toISOString() : null,
      count,
    },
    telemetry: {
      since: analyzed > 0 ? day(squad?.analyzedFirst) : null,
      until: analyzed > 0 ? day(squad?.analyzedLast) : null,
      analyzed,
      of: count,
      percent: count > 0 ? Math.round((analyzed / count) * 100) : 0,
    },
  }
}

// Parties et télémétrie en une lecture SQL : la même en Prisma (`members: { some }` + `telemetry`) prenait 5,4 s pour
// un joueur, contre 0,3 s ici (mesuré sur le clan 25, 2026-10-27).
function squadRangeSql(from: Prisma.Sql) {
  return Prisma.sql`
    SELECT MIN(sm.createdAt) AS firstAt, MAX(sm.createdAt) AS lastAt, COUNT(*) AS matches,
           SUM(t.status = 'success') AS analyzed,
           MIN(CASE WHEN t.status = 'success' THEN sm.createdAt END) AS analyzedFirst,
           MAX(CASE WHEN t.status = 'success' THEN sm.createdAt END) AS analyzedLast
    ${from}`
}

export async function loadMemberDataCoverage(memberId: number): Promise<MemberDataCoverage> {
  const owner = { memberId }
  const [[squad], drops, closures, items, kills, cells, member, pubg, pubgTypes, career] = await Promise.all([
    prisma.$queryRaw<SquadRange[]>(
      squadRangeSql(Prisma.sql`FROM SquadMember sq JOIN SquadMatch sm ON sm.id = sq.squadMatchId LEFT JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id WHERE sq.memberId = ${memberId}`)
    ),
    prisma.dropPressureStat.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true }, _count: { _all: true } }),
    prisma.zoneClosurePosition.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true }, _count: { _all: true } }),
    prisma.memberItemUseStat.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true } }),
    prisma.killEvent.aggregate({ where: { OR: [{ killerMemberId: memberId }, { victimMemberId: memberId }] }, _min: { matchDate: true }, _max: { matchDate: true }, _count: { _all: true } }),
    prisma.positionMetricCell.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true } }),
    prisma.clanMember.findUnique({ where: { id: memberId }, select: { createdAt: true } }),
    prisma.match.aggregate({ where: owner, _min: { pubgCreatedAt: true }, _max: { pubgCreatedAt: true }, _count: { _all: true } }),
    prisma.match.groupBy({ by: ['matchType'], where: owner, _count: { _all: true } }),
    prisma.memberLifetimeStats.findUnique({ where: { memberId }, select: { lastRefreshedAt: true } }),
  ])
  return {
    scope: 'member',
    onSiteSince: day(member?.createdAt),
    ...squadCoverage(squad),
    pubgMatches: {
      ...spanOf(pubg, 'pubgCreatedAt'),
      byType: [...pubgTypes]
        .map((row) => ({ matchType: row.matchType, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
    },
    drops: spanOf(drops, 'matchDate'),
    kills: spanOf(kills, 'matchDate'),
    positions: spanOf(cells, 'matchDate'),
    closures: spanOf(closures, 'matchDate'),
    items: spanOf(items, 'matchDate'),
    careerSyncedAt: career?.lastRefreshedAt.toISOString() ?? null,
  }
}

export async function loadClanDataCoverage(clanId: number): Promise<ClanDataCoverage> {
  const owner = { member: { clanId, isActive: true, joinStatus: 'active' } }
  const [[squad], drops, closures, items, activeMembers] = await Promise.all([
    prisma.$queryRaw<SquadRange[]>(
      squadRangeSql(Prisma.sql`FROM SquadMatch sm LEFT JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
        WHERE sm.id IN (SELECT sq.squadMatchId FROM SquadMember sq JOIN ClanMember cm ON cm.id = sq.memberId
                         WHERE cm.clanId = ${clanId} AND cm.isActive = 1 AND cm.joinStatus = 'active')`)
    ),
    prisma.dropPressureStat.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true }, _count: { _all: true } }),
    prisma.zoneClosurePosition.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true }, _count: { _all: true } }),
    prisma.memberItemUseStat.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true } }),
    prisma.clanMember.count({ where: { clanId, isActive: true, joinStatus: 'active' } }),
  ])
  return {
    scope: 'clan',
    activeMembers,
    ...squadCoverage(squad),
    drops: spanOf(drops, 'matchDate'),
    closures: spanOf(closures, 'matchDate'),
    items: spanOf(items, 'matchDate'),
  }
}

/** Analyses de télémétrie du clan encore en file (parties importées, déroulé pas encore lu). */
export async function countPendingAnalyses(clanId: number) {
  return prisma.cronExecution.count({
    where: { clanId, action: { in: [TELEMETRY_LIVE_SYNC_QUEUE_ACTION, TELEMETRY_RESYNC_QUEUE_ACTION] }, status: { in: ['queued', 'running'] } },
  })
}

// ── Cache des routes de page (5 min) : une lecture SQL par page ouverte, jamais à chaque changement de filtre ─────

const COVERAGE_CACHE_TTL_MS = 5 * 60 * 1000

type CoverageCacheEntry = { at: number; value: unknown }

const globalForCoverage = globalThis as typeof globalThis & { dataCoverageCache?: Map<string, CoverageCacheEntry> }
globalForCoverage.dataCoverageCache ??= new Map()

/** Réservé aux tests : vide le cache des routes. */
export function resetDataCoverageCache() {
  globalForCoverage.dataCoverageCache?.clear()
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cache = globalForCoverage.dataCoverageCache!
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < COVERAGE_CACHE_TTL_MS) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  return value
}

export type PageCoveragePayload<T> = { coverage: T; pendingAnalyses: number; computedAt: string }

/** Réponse de `GET /api/members/[id]/data-coverage` ; `clanId` = clan actuel du joueur (file d'analyses), s'il en a un. */
export function getMemberPageCoverage(memberId: number, clanId: number | null): Promise<PageCoveragePayload<MemberDataCoverage>> {
  return cached(`member:${memberId}`, async () => {
    const [coverage, pendingAnalyses] = await Promise.all([loadMemberDataCoverage(memberId), clanId ? countPendingAnalyses(clanId) : 0])
    return { coverage, pendingAnalyses, computedAt: new Date().toISOString() }
  })
}

/** Réponse de `GET /api/clans/[clanId]/data-coverage`. */
export function getClanPageCoverage(clanId: number): Promise<PageCoveragePayload<ClanDataCoverage>> {
  return cached(`clan:${clanId}`, async () => {
    const [coverage, pendingAnalyses] = await Promise.all([loadClanDataCoverage(clanId), countPendingAnalyses(clanId)])
    return { coverage, pendingAnalyses, computedAt: new Date().toISOString() }
  })
}
