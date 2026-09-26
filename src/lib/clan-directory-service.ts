import { Prisma } from '@prisma/client'

import { aggregateActivity, pickClanOfMoment, type ActivityRow, type ClanDirectoryPayload } from '@/lib/clan-directory'
import { computeClansLeaderboard } from '@/lib/clans-leaderboard'
import { sessionDateOf } from '@/lib/match-sessions'
import { prisma } from '@/lib/prisma'

/**
 * Activité de l'annuaire des clans (`/clans`) : parties et top 1 des 7 derniers jours, joueurs de la soirée en cours,
 * dernière partie, rang en Ligue, clan du moment. Gardée 5 minutes en mémoire : la synchronisation est horaire.
 */

export const DIRECTORY_TTL_MS = 5 * 60_000
let cache: { at: number; value: Promise<ClanDirectoryPayload> } | null = null

export function resetClanDirectoryCache() {
  cache = null
}

export function getClanDirectory(now: number = Date.now()): Promise<ClanDirectoryPayload> {
  if (cache && now - cache.at < DIRECTORY_TTL_MS) return cache.value
  const value = loadClanDirectory(new Date(now))
  cache = { at: now, value }
  value.catch(() => {
    if (cache?.value === value) cache = null
  })
  return value
}

async function loadClanDirectory(now: Date): Promise<ClanDirectoryPayload> {
  const since = new Date(now.getTime() - 7 * 86_400_000)
  const [clans, rows, league] = await Promise.all([
    prisma.clan.findMany({ where: { isActive: true }, select: { id: true, isSystem: true, lastMatchAt: true } }),
    prisma.$queryRaw<ActivityRow[]>(Prisma.sql`
      SELECT cm.clanId AS clanId, cm.id AS memberId, sm.id AS squadMatchId, sm.placement AS placement, sm.createdAt AS createdAt
      FROM SquadMatch sm
      INNER JOIN SquadMember s ON s.squadMatchId = sm.id
      INNER JOIN ClanMember cm ON cm.id = s.memberId
      WHERE sm.createdAt >= ${since} AND sm.createdAt <= ${now} AND cm.clanId IS NOT NULL
    `),
    computeClansLeaderboard('month'),
  ])

  const tonight = sessionDateOf(now)
  const { byClan, tonightPlayers } = aggregateActivity(rows, tonight)
  const rankByClan = new Map(league.map((entry) => [entry.clanId, entry.rank]))

  const activity = clans.map((clan) => {
    const stats = byClan.get(clan.id) ?? { games7: 0, wins7: 0, playedTonight: 0 }
    return {
      clanId: clan.id,
      ...stats,
      lastMatchAt: clan.lastMatchAt?.toISOString() ?? null,
      leagueRank: rankByClan.get(clan.id) ?? null,
    }
  })

  return {
    generatedAt: now.toISOString(),
    tonight: { date: tonight, players: tonightPlayers },
    leagueSize: league.length,
    clanOfMomentId: pickClanOfMoment(activity.map((entry) => ({ ...entry, isSystem: clans.find((c) => c.id === entry.clanId)?.isSystem }))),
    activity,
  }
}
