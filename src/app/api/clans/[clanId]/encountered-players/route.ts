import { prisma } from '@/lib/prisma'
import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type Period = 'week' | 'month' | 'all'

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

    const rows = await prisma.encounteredPlayer.findMany({
      where: {
        clanId: parsedClanId,
        // Filtre sur la dernière rencontre, pas un compteur recalculé sur la
        // période : encounterCount reste le cumul total historique.
        ...(periodStart ? { lastSeenAt: { gte: periodStart } } : {}),
      },
      orderBy: [{ encounterCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: 300,
    })

    const clanMembers = await prisma.clanMember.findMany({
      where: { clanId: parsedClanId },
      select: { id: true },
    })
    const memberIds = clanMembers.map((member) => member.id)

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
    const resolvedClanTags = new Map<string, number>()
    let resolvedCount = 0
    let teammateCount = 0

    for (const row of rows) {
      if (row.clanResolvedAt) {
        resolvedCount += 1
      }

      if (row.teammateEncounterCount > 0) {
        teammateCount += 1
      }

      const opponentEncounterCount = row.encounterCount - row.teammateEncounterCount
      if (row.pubgClanTag && opponentEncounterCount > 0) {
        resolvedClanTags.set(
          row.pubgClanTag,
          (resolvedClanTags.get(row.pubgClanTag) ?? 0) + opponentEncounterCount
        )
      }
    }

    const topRivalClans = Array.from(resolvedClanTags.entries())
      .map(([tag, encounterCount]) => ({ tag, encounterCount }))
      .sort((left, right) => right.encounterCount - left.encounterCount)
      .slice(0, 5)

    return Response.json({
      data: {
        period,
        summary: {
          totalPlayers: rows.length,
          resolvedCount,
          pendingCount: rows.length - resolvedCount,
          distinctClansIdentified: resolvedClanTags.size,
          teammateCount,
        },
        botStats: {
          avgBotsPerMatch: botStats?._avg.botCount ?? null,
          matchesWithData: botStats?._count.botCount ?? 0,
        },
        topRivalClans,
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
