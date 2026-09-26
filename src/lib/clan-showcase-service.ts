import { computeClansLeaderboard } from '@/lib/clans-leaderboard'
import { getMapLabels } from '@/lib/map-label-service'
import { matchDebriefPath } from '@/lib/match-links'
import { getPeriodRange } from '@/lib/period'
import { prisma } from '@/lib/prisma'
import { weaponDisplayName } from '@/lib/pubg-telemetry/debrief-view'
import { listTournamentOverviews } from '@/lib/tournament-overview'
import { getWeaponLabels } from '@/lib/weapon-label-service'
import {
  pickMvp,
  pubgClanFacts,
  sessionsOf,
  winStreak,
  type ClanShowcase,
  type ClanShowcaseLongestKill,
  type ClanShowcaseWin,
} from '@/lib/clan-showcase'

/**
 * Données de la vitrine d'un clan (vue d'ensemble) : palmarès, briefing de la semaine, indices de navigation.
 * Réponse gardée 5 minutes en mémoire par clan : la vitrine n'a pas besoin d'être à la seconde, et le classement de
 * la Ligue comme les tournois se recalculent à chaque lecture.
 */

export const SHOWCASE_TTL_MS = 5 * 60_000
const cache = new Map<number, { at: number; value: Promise<ClanShowcase | null> }>()

export function resetClanShowcaseCache() {
  cache.clear()
}

export function getClanShowcase(clanId: number, now: number = Date.now()): Promise<ClanShowcase | null> {
  const hit = cache.get(clanId)
  if (hit && now - hit.at < SHOWCASE_TTL_MS) return hit.value
  const value = loadClanShowcase(clanId, new Date(now))
  cache.set(clanId, { at: now, value })
  value.catch(() => {
    if (cache.get(clanId)?.value === value) cache.delete(clanId)
  })
  return value
}

async function loadClanShowcase(clanId: number, now: Date): Promise<ClanShowcase | null> {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { platformShard: true, clanStats: true },
  })
  if (!clan) return null

  const month = getPeriodRange('month', now)!
  const week = getPeriodRange('week', now)!
  const from = month.start < week.start ? month.start : week.start

  const [matches, mapLabels, weaponLabels, league, tournaments, activeChallenges, longest] = await Promise.all([
    prisma.squadMatch.findMany({
      where: {
        createdAt: { gte: from, lt: now },
        members: { some: { member: { clanId, isActive: true } } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        placement: true,
        createdAt: true,
        mapName: true,
        // Un SquadMatch peut être partagé entre clans : seuls les membres de ce clan comptent.
        members: {
          where: { member: { clanId, isActive: true } },
          select: { kills: true, member: { select: { displayName: true } } },
        },
      },
    }),
    getMapLabels(),
    getWeaponLabels(),
    computeClansLeaderboard('month'),
    listTournamentOverviews(now),
    prisma.challenge.count({ where: { clanId, status: 'active', endDate: { gte: now } } }),
    prisma.killEvent.findFirst({
      where: { clanId, killerMemberId: { not: null }, matchDate: { gte: week.start, lt: week.end } },
      orderBy: { distance: 'desc' },
      select: {
        squadMatchId: true,
        distance: true,
        weaponName: true,
        headshot: true,
        matchDate: true,
        victimAccountId: true,
        killerMember: { select: { displayName: true } },
        victimMember: { select: { clan: { select: { tag: true, isSystem: true } } } },
      },
    }),
  ])

  const simplified = matches.map((match) => ({
    ...match,
    members: match.members.map((member) => ({ kills: member.kills, name: member.member.displayName })),
  }))
  const monthMatches = simplified.filter((match) => match.createdAt >= month.start)
  const weekMatches = simplified.filter((match) => match.createdAt >= week.start)

  // Fait n°1 : le dernier top 1 de la semaine.
  const lastWin = weekMatches.find((match) => match.placement === 1)
  const win: ClanShowcaseWin | null = lastWin
    ? {
        squadMatchId: lastWin.id,
        mapName: lastWin.mapName,
        mapLabel: mapLabels[lastWin.mapName] ?? lastWin.mapName,
        playedAt: lastWin.createdAt.toISOString(),
        kills: lastWin.members.reduce((sum, member) => sum + member.kills, 0),
        squadSize: lastWin.members.length,
        mvp: pickMvp(lastWin.members),
        debriefPath: matchDebriefPath(clanId, lastWin.id),
      }
    : null

  // Fait n°2 : le plus long kill de la semaine (distances de la télémétrie en centimètres).
  let longestKill: ClanShowcaseLongestKill | null = null
  if (longest && longest.distance && longest.distance > 0) {
    let victimTag = longest.victimMember?.clan && !longest.victimMember.clan.isSystem ? longest.victimMember.clan.tag : null
    if (!longest.victimMember && longest.victimAccountId) {
      const player = await prisma.player.findFirst({
        where: { pubgAccountId: longest.victimAccountId },
        select: { opponentClan: { select: { tag: true } } },
      })
      victimTag = player?.opponentClan?.tag ?? null
    }
    longestKill = {
      killer: longest.killerMember?.displayName ?? 'Joueur',
      weapon: weaponDisplayName(longest.weaponName, weaponLabels),
      distanceMeters: Math.round(longest.distance / 100),
      headshot: longest.headshot,
      victimTag,
      playedAt: longest.matchDate.toISOString(),
      replayPath: `${matchDebriefPath(clanId, longest.squadMatchId)}?tab=replay`,
    }
  }

  // Fait n°3 : la série de soirées avec un top 1 (toutes les soirées lues, pas seulement la semaine).
  const sessions = sessionsOf(simplified)
  const weekSessions = sessionsOf(weekMatches)
  const streak = winStreak(sessions)

  const facts = pubgClanFacts(clan.clanStats)
  const tracked = (clan.clanStats as { tracked?: { aggregated?: { totalKills?: number } } } | null)?.tracked
  const leagueEntry = league.find((entry) => entry.clanId === clanId)
  const wonTournament = tournaments.find((tournament) => tournament.phase === 'finished' && tournament.winner?.clanId === clanId)

  return {
    generatedAt: now.toISOString(),
    level: facts.level,
    pubgMemberCount: facts.memberCount,
    platform: clan.platformShard,
    palmares: {
      monthWins: monthMatches.filter((match) => match.placement === 1).length,
      monthGames: monthMatches.length,
      league: leagueEntry ? { rank: leagueEntry.rank, of: league.length } : null,
      trackedKills: Number(tracked?.aggregated?.totalKills ?? 0),
      tournament: wonTournament ? { id: wonTournament.id, title: wonTournament.title } : null,
    },
    briefing: {
      win,
      longestKill,
      streak: {
        ...streak,
        atLeast: streak.count > 0 && streak.count === sessions.length,
        weekSessions: weekSessions.length,
        weekWins: weekMatches.filter((match) => match.placement === 1).length,
      },
    },
    hints: {
      activeChallenges,
      openTournaments: tournaments.filter((tournament) => tournament.phase === 'live' || tournament.phase === 'upcoming').length,
      weekGames: weekMatches.length,
    },
  }
}
