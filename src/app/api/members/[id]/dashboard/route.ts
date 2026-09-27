import { getMapLabels } from '@/lib/map-label-service'
import { matchDebriefPath } from '@/lib/match-links'
import { dominantRole } from '@/lib/member-roster'
import { activityBuckets, statsPeriodKeys } from '@/lib/player-dashboard'
import { prisma } from '@/lib/prisma'
import { getPeriodStart, type StandardPeriod } from '@/lib/period'
import type { PlayerDashboardResponse, PlayerPlaystyle } from '@/types/dashboard'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

/**
 * Tableau de bord d'un joueur (`/members/[id]/dashboard`, docs/features/membres.md) — refonte du 2026-09-27 : tout ce
 * que la page affiche sur **une seule période**, en une requête. Chiffres clés et écart au clan (`PlayerStats`), barres
 * d'activité par soirée, meilleure partie, profil de jeu avec la période précédente et la moyenne du clan
 * (`MemberTelemetryStats`), frères d'armes. Pression au drop et villes ont rejoint la page « Zones de drop »
 * (`/api/members/[id]/drop-pressure`, `/api/members/[id]/city-insights`).
 */

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

function parsePeriod(value: string | null): StandardPeriod {
  return value === 'month' || value === 'all' ? value : 'week'
}

/** Parties lues pour les barres : la période, ou les 8 dernières semaines pour « Tous ». */
function barsStart(period: StandardPeriod, now: Date) {
  return getPeriodStart(period, now) ?? new Date(getPeriodStart('week', now)!.getTime() - 7 * 7 * 86_400_000)
}

const TELEMETRY_SELECT = {
  memberId: true,
  period: true,
  aggressionScore: true,
  supportScore: true,
  zoneDisciplineScore: true,
  avgSafeZonePresencePercent: true,
  avgHealAmount: true,
  avgDamageTaken: true,
  avgFirstContactPhase: true,
  matchesPlayed: true,
} as const

type TelemetryRow = {
  aggressionScore: number
  supportScore: number
  zoneDisciplineScore: number
  avgSafeZonePresencePercent: number
  avgHealAmount: number
  avgDamageTaken: number
  avgFirstContactPhase: number
  matchesPlayed: number
}

const scoresOf = (row: TelemetryRow) => ({ aggression: row.aggressionScore, support: row.supportScore, zoneDiscipline: row.zoneDisciplineScore })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)
    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const now = new Date()
    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    const keys = statsPeriodKeys(period, now)
    // « Tous » : cumuls depuis toujours, mais seules les 8 dernières semaines servent aux barres.
    const rangeStart = barsStart(period, now)
    const matchWindow = period === 'all' ? {} : { pubgCreatedAt: { gte: rangeStart } }

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        displayName: true,
        pubgPlayerName: true,
        createdAt: true,
        lastMatchAt: true,
        clanId: true,
        clan: { select: { id: true, name: true, tag: true } },
        identities: { select: { user: { select: { avatarUrl: true } } }, take: 1 },
      },
    })
    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const [playerStat, clanStats, activityMatches, bestCandidate, telemetryRows, clanTelemetry, squadRows, mapLabels] = await Promise.all([
      prisma.playerStats.findUnique({ where: { memberId_period: { memberId, period: keys.current } } }),
      member.clanId
        ? prisma.playerStats.findMany({
            where: { member: { clanId: member.clanId, isActive: true }, period: keys.current },
            select: { totalKills: true, totalDamage: true, winRate: true, matchesPlayed: true, totalAssists: true, totalRevives: true },
          })
        : Promise.resolve([]),
      prisma.match.findMany({
        where: { memberId, matchType: 'official', pubgCreatedAt: { gte: rangeStart } },
        select: { pubgCreatedAt: true, kills: true, damageDealt: true, placement: true },
      }),
      prisma.match.findFirst({
        where: { memberId, matchType: 'official', ...matchWindow },
        orderBy: [{ kills: 'desc' }, { damageDealt: 'desc' }, { placement: 'asc' }],
        select: { pubgMatchId: true, mapName: true, gameMode: true, kills: true, damageDealt: true, placement: true, pubgCreatedAt: true },
      }),
      prisma.memberTelemetryStats.findMany({
        where: { memberId, period: { in: [keys.current, ...(keys.previous ? [keys.previous] : [])] } },
        select: TELEMETRY_SELECT,
      }),
      member.clanId
        ? prisma.memberTelemetryStats.findMany({
            where: { period: keys.current, member: { clanId: member.clanId, isActive: true } },
            select: { memberId: true, aggressionScore: true, supportScore: true, zoneDisciplineScore: true },
          })
        : Promise.resolve([]),
      prisma.squadMember.findMany({
        where: { memberId, ...(period === 'all' ? {} : { squadMatch: { createdAt: { gte: rangeStart } } }) },
        select: { squadMatchId: true, timeSurvived: true },
      }),
      getMapLabels(),
    ])

    const count = clanStats.length
    const clanAverage = count
      ? {
          avgKills: clanStats.reduce((sum, row) => sum + row.totalKills, 0) / count,
          avgDamage: clanStats.reduce((sum, row) => sum + row.totalDamage, 0) / count,
          avgWinRate: clanStats.reduce((sum, row) => sum + row.winRate, 0) / count,
          avgMatches: clanStats.reduce((sum, row) => sum + row.matchesPlayed, 0) / count,
          avgAssists: clanStats.reduce((sum, row) => sum + row.totalAssists, 0) / count,
          avgRevives: clanStats.reduce((sum, row) => sum + row.totalRevives, 0) / count,
        }
      : null

    // ── Profil de jeu ──
    const currentRow = telemetryRows.find((row) => row.period === keys.current) ?? null
    const previousRow = keys.previous ? telemetryRows.find((row) => row.period === keys.previous) ?? null : null
    const measuredClan = clanTelemetry.filter((row) => row.aggressionScore > 0 || row.supportScore > 0 || row.zoneDisciplineScore > 0)
    const clanScores = measuredClan.length
      ? {
          aggression: measuredClan.reduce((sum, row) => sum + row.aggressionScore, 0) / measuredClan.length,
          support: measuredClan.reduce((sum, row) => sum + row.supportScore, 0) / measuredClan.length,
          zoneDiscipline: measuredClan.reduce((sum, row) => sum + row.zoneDisciplineScore, 0) / measuredClan.length,
        }
      : null
    const playstyle: PlayerPlaystyle = {
      current: currentRow && currentRow.matchesPlayed > 0
        ? {
            ...scoresOf(currentRow),
            safeZonePercent: Math.min(100, currentRow.avgSafeZonePresencePercent),
            healCoveragePercent: currentRow.avgDamageTaken > 0 ? Math.min(100, (currentRow.avgHealAmount / currentRow.avgDamageTaken) * 100) : null,
            firstContactPhase: currentRow.avgFirstContactPhase > 0 ? currentRow.avgFirstContactPhase : null,
            matchesPlayed: currentRow.matchesPlayed,
          }
        : null,
      previous: previousRow && previousRow.matchesPlayed > 0 ? scoresOf(previousRow) : null,
      clan: clanScores,
    }

    // ── Meilleure partie : kills, puis dégâts ──
    let bestMatch: PlayerDashboardResponse['bestMatch'] = null
    if (bestCandidate) {
      const squadEntry = await prisma.squadMember.findFirst({
        where: { memberId, squadMatch: { pubgMatchId: bestCandidate.pubgMatchId } },
        select: {
          timeSurvived: true,
          squadMatch: {
            select: {
              id: true,
              telemetry: { select: { id: true } },
              members: { where: { memberId: { not: memberId } }, select: { member: { select: { displayName: true } } } },
            },
          },
        },
      })
      bestMatch = {
        mapName: bestCandidate.mapName,
        mapLabel: mapLabels[bestCandidate.mapName] ?? bestCandidate.mapName,
        gameMode: bestCandidate.gameMode,
        kills: bestCandidate.kills,
        damage: bestCandidate.damageDealt,
        placement: bestCandidate.placement,
        createdAt: bestCandidate.pubgCreatedAt.toISOString(),
        timeSurvived: squadEntry && squadEntry.timeSurvived > 0 ? squadEntry.timeSurvived : null,
        teammates: squadEntry?.squadMatch.members.map((entry) => entry.member.displayName) ?? [],
        debriefHref:
          member.clanId && squadEntry?.squadMatch.telemetry ? matchDebriefPath(member.clanId, squadEntry.squadMatch.id, { period }) : null,
      }
    }

    // ── Frères d'armes : les partenaires de clan les plus fréquents ──
    const playTimeByMatch = new Map(squadRows.map((row) => [row.squadMatchId, row.timeSurvived]))
    const coPlayers = squadRows.length
      ? await prisma.squadMember.findMany({
          where: { squadMatchId: { in: squadRows.map((row) => row.squadMatchId) }, memberId: { not: memberId } },
          select: {
            memberId: true,
            squadMatchId: true,
            timeSurvived: true,
            squadMatch: { select: { placement: true } },
            member: { select: { displayName: true, identities: { select: { user: { select: { avatarUrl: true } } }, take: 1 } } },
          },
        })
      : []
    const mateMap = new Map<number, { displayName: string; avatarUrl: string | null; matchCount: number; wins: number; sharedPlayTimeSeconds: number }>()
    for (const row of coPlayers) {
      const entry = mateMap.get(row.memberId) ?? {
        displayName: row.member.displayName,
        avatarUrl: row.member.identities[0]?.user.avatarUrl ?? null,
        matchCount: 0,
        wins: 0,
        sharedPlayTimeSeconds: 0,
      }
      entry.matchCount += 1
      if (row.squadMatch.placement === 1) entry.wins += 1
      entry.sharedPlayTimeSeconds += Math.min(playTimeByMatch.get(row.squadMatchId) ?? 0, row.timeSurvived)
      mateMap.set(row.memberId, entry)
    }
    const clanTelemetryByMember = new Map(clanTelemetry.map((row) => [row.memberId, row]))
    const mates = Array.from(mateMap.entries())
      .sort((a, b) => b[1].matchCount - a[1].matchCount || a[1].displayName.localeCompare(b[1].displayName, 'fr'))
      .slice(0, 3)
      .map(([mateId, entry]) => {
        const scores = clanTelemetryByMember.get(mateId)
        return {
          memberId: mateId,
          displayName: entry.displayName,
          avatarUrl: entry.avatarUrl,
          matchCount: entry.matchCount,
          winRate: entry.matchCount > 0 ? entry.wins / entry.matchCount : 0,
          sharedPlayTimeSeconds: entry.sharedPlayTimeSeconds,
          role:
            (scores
              ? dominantRole({ aggression: scores.aggressionScore, support: scores.supportScore, zoneDiscipline: scores.zoneDisciplineScore })?.id
              : null) ?? null,
        }
      })

    const response: PlayerDashboardResponse = {
      period,
      member: {
        id: member.id,
        displayName: member.displayName,
        pubgPlayerName: member.pubgPlayerName,
        avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
        createdAt: member.createdAt.toISOString(),
        lastMatchAt: member.lastMatchAt?.toISOString() ?? null,
        clan: member.clan,
      },
      stats: playerStat
        ? {
            totalKills: playerStat.totalKills,
            totalDamage: playerStat.totalDamage,
            totalAssists: playerStat.totalAssists,
            totalRevives: playerStat.totalRevives,
            matchesPlayed: playerStat.matchesPlayed,
            matchesWon: playerStat.matchesWon,
            winRate: playerStat.winRate,
          }
        : null,
      clanAverage,
      activity: activityBuckets(
        activityMatches.map((match) => ({
          createdAt: match.pubgCreatedAt.toISOString(),
          kills: match.kills,
          damage: match.damageDealt,
          placement: match.placement,
        })),
        period,
        now
      ),
      bestMatch,
      playstyle,
      mates,
    }
    return Response.json(response)
  } catch (error) {
    console.error('Error fetching dashboard:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
