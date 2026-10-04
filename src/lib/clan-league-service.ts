import { Prisma } from '@prisma/client'

import {
  LEAGUE_MIN_MATCHES,
  LEAGUE_PRIOR_MATCHES,
  leagueFeed,
  leagueMatchTypeValues,
  leagueTableBetween,
  leagueTitles,
  standingsBetween,
  type LeagueAverage,
  type LeagueClan,
  type LeagueFeedEvent,
  type LeagueMatchRow,
  type LeagueMatchType,
  type LeagueQualifier,
  type LeagueStanding,
} from '@/lib/clan-league'
import { sessionDateOf } from '@/lib/match-sessions'
import { getPeriodRange, type StandardPeriod } from '@/lib/period'
import { prisma } from '@/lib/prisma'

/**
 * Ligue Inter-Clans calculée à la volée depuis les parties d'un type (Normal, Ranked, Casual, Tournois / Custom ;
 * docs/features/ligue-clans.md) — plus depuis `ClanComparatorCache`, qui ne gardait que la période en cours : les
 * flèches (période précédente), le fil de la ligue (soirée par soirée) et la meilleure remontée demandent des
 * classements passés. Une requête groupée par clan et par partie (≈ 21 000 lignes sur tout l'historique, 1,2 s mesurée
 * le 2026-09-27), gardée 5 minutes en mémoire par période et par type.
 */

export type LeagueEntry = LeagueStanding & {
  /** Rang au Power score sur la période précédente ; `null` : pas classé alors, ou période « Tous ». */
  previousRank: number | null
  /** Joueurs actifs du clan ayant joué sur la période. */
  activeMembers: number
}

export type ClanLeaguePayload = {
  period: StandardPeriod
  matchType: LeagueMatchType
  generatedAt: string
  /** Dernière partie du type prise en compte (fraîcheur réelle du classement). */
  lastMatchAt: string | null
  /** Clans classés (au moins `minMatches` parties du type sur la période), au Power score. */
  standings: LeagueEntry[]
  /** Clans qui ont joué sous le seuil : pas de rang, progression « 3 / 5 parties ». */
  qualifying: LeagueQualifier[]
  /** Clans suivis sans partie du type sur la période : non classés. */
  withoutMatch: LeagueClan[]
  feed: LeagueFeedEvent[]
  titles: ReturnType<typeof leagueTitles>
  /** Règles de la période, pour l'explication du Power score affichée sur la page. */
  scoring: { minMatches: number; priorMatches: number; league: LeagueAverage }
}

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { expiresAt: number; payload: ClanLeaguePayload }>()
const FEED_DAYS = 7

type RawRow = { clanId: number; matchId: string; createdAt: Date; placement: number; damage: number | null; kills: number | bigint | null; knocks: number | bigint | null }

async function loadLeagueClans(): Promise<LeagueClan[]> {
  const clans = await prisma.clan.findMany({
    where: { isActive: true, pubgClanId: { not: null } },
    select: { id: true, name: true, tag: true, clanConfigs: { where: { key: 'login_welcome_image_url' }, select: { value: true }, take: 1 } },
  })
  return clans.map((clan) => ({ clanId: clan.id, name: clan.name, tag: clan.tag, imageUrl: clan.clanConfigs[0]?.value || null }))
}

/** Filtre SQL du type de partie (`leagueMatchTypeValues` : Casual couvre aussi les lobbies de bots `airoyale`). */
const matchTypeSql = (matchType: LeagueMatchType) => Prisma.sql`sm.matchType IN (${Prisma.join(leagueMatchTypeValues(matchType))})`

/** Une ligne par clan et par partie du type, stats des seuls membres actifs du clan (règle du comparateur). */
export async function loadLeagueRows(since: Date | null, matchType: LeagueMatchType = 'official'): Promise<LeagueMatchRow[]> {
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT cm.clanId AS clanId, sm.id AS matchId, sm.createdAt AS createdAt, sm.placement AS placement,
           SUM(sq.damage) AS damage, SUM(sq.kills) AS kills, SUM(sq.knockouts) AS knocks
    FROM SquadMember sq
    INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
    INNER JOIN ClanMember cm ON cm.id = sq.memberId
    INNER JOIN Clan c ON c.id = cm.clanId
    WHERE ${matchTypeSql(matchType)}
      AND cm.isActive = 1 AND cm.joinStatus = 'active'
      AND c.isActive = 1 AND c.pubgClanId IS NOT NULL
      ${since ? Prisma.sql`AND sm.createdAt >= ${since}` : Prisma.empty}
    GROUP BY cm.clanId, sm.id, sm.createdAt, sm.placement
  `)
  return rows.map((row) => ({
    clanId: Number(row.clanId),
    matchId: row.matchId,
    createdAt: new Date(row.createdAt),
    placement: Number(row.placement),
    damage: Number(row.damage ?? 0),
    kills: Number(row.kills ?? 0),
    knocks: Number(row.knocks ?? 0),
  }))
}

async function loadActiveMembers(since: Date | null, matchType: LeagueMatchType) {
  const rows = await prisma.$queryRaw<Array<{ clanId: number; players: bigint | number }>>(Prisma.sql`
    SELECT cm.clanId AS clanId, COUNT(DISTINCT sq.memberId) AS players
    FROM SquadMember sq
    INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
    INNER JOIN ClanMember cm ON cm.id = sq.memberId
    WHERE ${matchTypeSql(matchType)} AND cm.isActive = 1 AND cm.joinStatus = 'active'
      ${since ? Prisma.sql`AND sm.createdAt >= ${since}` : Prisma.empty}
    GROUP BY cm.clanId
  `)
  return new Map(rows.map((row) => [Number(row.clanId), Number(row.players)]))
}

/** Période précédente : semaine d'avant, mois d'avant ; aucune pour « Tous ». */
export function previousPeriodRange(period: StandardPeriod, now: Date) {
  if (period === 'all') return null
  if (period === 'month') return getPeriodRange('month-1', now)
  const current = getPeriodRange('week', now)!
  return { start: new Date(current.start.getTime() - 7 * 86_400_000), end: current.start }
}

/** Les soirées du fil : les 7 dernières, plus la veille de la première comme point de départ. */
export function feedSessionDates(now: Date, days = FEED_DAYS) {
  const today = sessionDateOf(now)
  const base = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))
  return Array.from({ length: days + 1 }, (_, index) => new Date(base - (days - index) * 86_400_000).toISOString().slice(0, 10))
}

export async function getClanLeague(period: StandardPeriod, matchType: LeagueMatchType = 'official', now = new Date()): Promise<ClanLeaguePayload> {
  const cacheKey = `${period}:${matchType}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.payload

  const current = getPeriodRange(period, now)
  const previous = previousPeriodRange(period, now)
  const sessionDates = feedSessionDates(now)
  const feedStart = new Date(`${sessionDates[0]}T00:00:00Z`)
  // Une seule lecture couvre la période, la période précédente et les soirées du fil.
  const since =
    period === 'all' ? null : new Date(Math.min(current!.start.getTime(), previous!.start.getTime(), feedStart.getTime() - 86_400_000))

  const [clans, rows, activeMembers] = await Promise.all([
    loadLeagueClans(),
    loadLeagueRows(since, matchType),
    loadActiveMembers(current?.start ?? null, matchType),
  ])

  // Même seuil pour la période, la période précédente et le fil : seuls les clans classés y figurent.
  const minMatches = LEAGUE_MIN_MATCHES[period]
  const { standings, qualifying, league } = leagueTableBetween(rows, clans, current?.start ?? null, null, minMatches)
  const previousStandings = previous ? standingsBetween(rows, clans, previous.start, previous.end, minMatches) : null
  const previousRanks = previousStandings ? new Map(previousStandings.map((standing) => [standing.clanId, standing.rank])) : null
  const played = new Set([...standings, ...qualifying].map((entry) => entry.clanId))
  const lastMatch = rows.reduce<Date | null>((latest, row) => (!latest || row.createdAt > latest ? row.createdAt : latest), null)

  const payload: ClanLeaguePayload = {
    period,
    matchType,
    generatedAt: now.toISOString(),
    lastMatchAt: lastMatch?.toISOString() ?? null,
    standings: standings.map((standing) => ({
      ...standing,
      previousRank: previousRanks?.get(standing.clanId) ?? null,
      activeMembers: activeMembers.get(standing.clanId) ?? 0,
    })),
    qualifying,
    withoutMatch: clans.filter((clan) => !played.has(clan.clanId)).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    feed: leagueFeed(rows, clans, current?.start ?? null, sessionDates, minMatches),
    titles: leagueTitles(standings, previousRanks),
    scoring: { minMatches, priorMatches: LEAGUE_PRIOR_MATCHES, league },
  }
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload })
  return payload
}
