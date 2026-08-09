import {
  ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
} from '@/lib/encountered-player-resolution-constants'
import { deriveEncounteredPlayerStatus } from '@/lib/encountered-player-status'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type Period = 'week' | 'month' | 'all'

// Nombre de joueurs renvoyés dans la liste détaillée. Les agrégats
// (summary, rivalClans) sont eux calculés sur l'ensemble filtré complet,
// indépendamment de cette limite — voir diagnostic du 2026-08-09.
const PLAYERS_LIST_LIMIT = 300

function parsePeriod(value: string | null): Period {
  return value === 'week' || value === 'month' ? value : 'all'
}

function getPeriodStart(period: Period): Date | null {
  if (period === 'week') {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  }

  if (period === 'month') {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  }

  return null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)

  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const roleError = await requireRole(['Owner', 'Admin'])(request, {
    clanId: parsedClanId,
  })

  if (roleError) {
    return roleError
  }

  try {
    const url = new URL(request.url)
    const period = parsePeriod(url.searchParams.get('period'))
    const periodStart = getPeriodStart(period)

    // Toutes les lignes filtrées sont chargées ici : les agrégats (summary,
    // rivalClans) doivent porter sur l'ensemble réel, pas sur l'échantillon
    // affiché. Seule la liste "players" retournée en fin de route est tronquée
    // à PLAYERS_LIST_LIMIT.
    const allRows = await prisma.encounteredPlayer.findMany({
      where: {
        clanId: parsedClanId,
        // Filtre sur la dernière rencontre, pas un compteur recalculé sur la
        // période : encounterCount reste le cumul total historique.
        ...(periodStart ? { lastSeenAt: { gte: periodStart } } : {}),
      },
      orderBy: [{ encounterCount: 'desc' }, { lastSeenAt: 'desc' }],
    })
    const rows = allRows.slice(0, PLAYERS_LIST_LIMIT)

    const clanMembers = await prisma.clanMember.findMany({
      where: { clanId: parsedClanId },
      select: { id: true },
    })
    const memberIds = clanMembers.map((member) => member.id)

    // Croisé avec le kill-feed (KillEvent) : qui a déjà été tué par le clan,
    // et qui a déjà tué un membre du clan — ne couvre que les matchs
    // synchronisés depuis le déploiement du kill-feed, pas d'historique complet.
    const [killedByClanGroups, killedClanMemberGroups] = await Promise.all([
      prisma.killEvent.groupBy({
        by: ['victimAccountId'],
        where: { clanId: parsedClanId, killerMemberId: { not: null }, victimAccountId: { not: null } },
        _count: { _all: true },
      }),
      prisma.killEvent.groupBy({
        by: ['killerAccountId'],
        where: { clanId: parsedClanId, victimMemberId: { not: null }, killerAccountId: { not: null } },
        _count: { _all: true },
      }),
    ])

    const killedByClanCounts = new Map(
      killedByClanGroups.map((group) => [group.victimAccountId as string, group._count._all])
    )
    const killedClanMemberCounts = new Map(
      killedClanMemberGroups.map((group) => [group.killerAccountId as string, group._count._all])
    )

    // Une vraie partie synchronisée génère une ligne Match par membre tracké
    // qui y a joué — un match croisé par plusieurs membres du clan compte donc
    // plusieurs fois dans cette moyenne, approximation acceptable pour un
    // indicateur de fréquentation, pas une statistique exacte par match unique.
    const botStats =
      memberIds.length > 0
        ? await prisma.match.aggregate({
            where: {
              memberId: { in: memberIds },
              botCount: { not: null },
              ...(periodStart ? { pubgCreatedAt: { gte: periodStart } } : {}),
            },
            _avg: { botCount: true },
            _count: { botCount: true },
          })
        : null

    // Un coéquipier occasionnel (même roster qu'un membre suivi) n'est pas un
    // rival — seuls les croisements en tant qu'adversaire réel comptent ici,
    // sinon le clan d'un ami qui joue parfois avec nous polluerait ce classement.
    type RivalClanAccumulator = {
      tag: string
      name: string | null
      playerCount: number
      opponentEncounterCount: number
      killedByClanCount: number
      killedClanMemberCount: number
      lastSeenAt: Date
    }

    const thresholds = {
      minEncounters: ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
      maxAttempts: ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
    }

    const rivalClanMap = new Map<string, RivalClanAccumulator>()
    let resolvedCount = 0
    let teammateCount = 0

    for (const row of allRows) {
      if (row.clanResolvedAt) {
        resolvedCount += 1
      }

      if (row.teammateEncounterCount > 0) {
        teammateCount += 1
      }

      const opponentEncounterCount = row.encounterCount - row.teammateEncounterCount
      if (!row.pubgClanTag || opponentEncounterCount === 0) {
        continue
      }

      const existing = rivalClanMap.get(row.pubgClanTag)
      const killedByClan = killedByClanCounts.get(row.pubgAccountId) ?? 0
      const killedMember = killedClanMemberCounts.get(row.pubgAccountId) ?? 0

      if (existing) {
        existing.playerCount += 1
        existing.opponentEncounterCount += opponentEncounterCount
        existing.killedByClanCount += killedByClan
        existing.killedClanMemberCount += killedMember
        existing.name = existing.name ?? row.pubgClanName
        if (row.lastSeenAt > existing.lastSeenAt) {
          existing.lastSeenAt = row.lastSeenAt
        }
      } else {
        rivalClanMap.set(row.pubgClanTag, {
          tag: row.pubgClanTag,
          name: row.pubgClanName,
          playerCount: 1,
          opponentEncounterCount,
          killedByClanCount: killedByClan,
          killedClanMemberCount: killedMember,
          lastSeenAt: row.lastSeenAt,
        })
      }
    }

    const rivalClans = Array.from(rivalClanMap.values())
      .map((clan) => ({
        tag: clan.tag,
        name: clan.name,
        playerCount: clan.playerCount,
        opponentEncounterCount: clan.opponentEncounterCount,
        killedByClanCount: clan.killedByClanCount,
        killedClanMemberCount: clan.killedClanMemberCount,
        lastSeenAt: clan.lastSeenAt.toISOString(),
      }))
      .sort((left, right) => right.opponentEncounterCount - left.opponentEncounterCount)

    const topRivalClans = rivalClans
      .slice(0, 5)
      .map((clan) => ({ tag: clan.tag, encounterCount: clan.opponentEncounterCount }))

    return Response.json({
      data: {
        period,
        summary: {
          totalPlayers: allRows.length,
          resolvedCount,
          pendingCount: allRows.length - resolvedCount,
          distinctClansIdentified: rivalClanMap.size,
          teammateCount,
          killedByClanPlayerCount: killedByClanCounts.size,
          killedClanMemberPlayerCount: killedClanMemberCounts.size,
        },
        playersListLimit: PLAYERS_LIST_LIMIT,
        playersListTruncated: allRows.length > PLAYERS_LIST_LIMIT,
        thresholds,
        botStats: {
          avgBotsPerMatch: botStats?._avg.botCount ?? null,
          matchesWithData: botStats?._count.botCount ?? 0,
        },
        topRivalClans,
        rivalClans,
        players: rows.map((row) => ({
          id: row.id,
          pubgAccountId: row.pubgAccountId,
          pubgPlayerName: row.pubgPlayerName,
          pubgClanTag: row.pubgClanTag,
          pubgClanName: row.pubgClanName,
          clanResolvedAt: row.clanResolvedAt ? row.clanResolvedAt.toISOString() : null,
          encounterCount: row.encounterCount,
          teammateEncounterCount: row.teammateEncounterCount,
          opponentEncounterCount: row.encounterCount - row.teammateEncounterCount,
          resolveAttempts: row.resolveAttempts,
          status: deriveEncounteredPlayerStatus(row, thresholds),
          killedByClanCount: killedByClanCounts.get(row.pubgAccountId) ?? 0,
          killedClanMemberCount: killedClanMemberCounts.get(row.pubgAccountId) ?? 0,
          firstSeenAt: row.firstSeenAt.toISOString(),
          lastSeenAt: row.lastSeenAt.toISOString(),
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching encountered players:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
