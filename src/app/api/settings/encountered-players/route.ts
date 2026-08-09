import { Prisma } from '@prisma/client'

import {
  ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
} from '@/lib/encountered-player-resolution-constants'
import {
  buildStatusWhereClause,
  deriveEncounteredPlayerStatus,
  type EncounteredPlayerResolutionStatus,
} from '@/lib/encountered-player-status'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

const PAGE_SIZE = 20
const VALID_STATUSES: EncounteredPlayerResolutionStatus[] = [
  'below_threshold',
  'never_attempted',
  'retry_pending',
  'failed',
  'resolved_with_clan',
  'resolved_without_clan',
]

function parseStatuses(values: string[]): EncounteredPlayerResolutionStatus[] {
  return values.filter((value): value is EncounteredPlayerResolutionStatus =>
    VALID_STATUSES.includes(value as EncounteredPlayerResolutionStatus)
  )
}

function parsePage(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function parseMinAttempts(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

function parseClanId(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: Request) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const url = new URL(request.url)
  const statuses = parseStatuses(url.searchParams.getAll('status'))
  const minAttempts = parseMinAttempts(url.searchParams.get('minAttempts'))
  const clanId = parseClanId(url.searchParams.get('clanId'))
  const page = parsePage(url.searchParams.get('page'))

  const thresholds = {
    minEncounters: ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
    maxAttempts: ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  }

  const statusFilter: Prisma.EncounteredPlayerWhereInput | undefined =
    statuses.length > 0
      ? { OR: statuses.map((status) => buildStatusWhereClause(status, thresholds)) }
      : undefined

  const where: Prisma.EncounteredPlayerWhereInput = {
    ...(statusFilter ?? {}),
    ...(minAttempts !== null ? { resolveAttempts: { gte: minAttempts } } : {}),
    ...(clanId !== null ? { clanId } : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.encounteredPlayer.count({ where }),
    prisma.encounteredPlayer.findMany({
      where,
      orderBy: [{ resolveAttempts: 'desc' }, { encounterCount: 'desc' }, { lastSeenAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { clan: { select: { tag: true, name: true } } },
    }),
  ])

  // Nombre de clans suivis distincts ayant croisé chaque identité affichée —
  // même logique de priorisation que le cron (voir selectPrioritizedEncounteredPlayerIdentities),
  // ici uniquement informatif pour expliquer visuellement l'ordre de traitement.
  const distinctClanCounts =
    rows.length > 0
      ? await prisma.encounteredPlayer.groupBy({
          by: ['pubgAccountId', 'platformShard'],
          where: {
            OR: rows.map((row) => ({
              pubgAccountId: row.pubgAccountId,
              platformShard: row.platformShard,
            })),
          },
          _count: { clanId: true },
        })
      : []

  const distinctClanCountByIdentity = new Map(
    distinctClanCounts.map((group) => [
      `${group.platformShard}:${group.pubgAccountId}`,
      group._count.clanId,
    ])
  )

  return Response.json({
    data: {
      thresholds,
      page,
      pageSize: PAGE_SIZE,
      total,
      players: rows.map((row) => ({
        id: row.id,
        playerId: row.playerId,
        clanId: row.clanId,
        clanTag: row.clan.tag,
        clanName: row.clan.name,
        pubgAccountId: row.pubgAccountId,
        platformShard: row.platformShard,
        pubgPlayerName: row.pubgPlayerName,
        pubgClanTag: row.pubgClanTag,
        pubgClanName: row.pubgClanName,
        encounterCount: row.encounterCount,
        resolveAttempts: row.resolveAttempts,
        status: deriveEncounteredPlayerStatus(row, thresholds),
        distinctClanCount: distinctClanCountByIdentity.get(`${row.platformShard}:${row.pubgAccountId}`) ?? 1,
        lastSeenAt: row.lastSeenAt.toISOString(),
      })),
    },
  })
}
