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

  const q = (url.searchParams.get('q') ?? '').trim()
  const sortByParam = url.searchParams.get('sortBy')
  const sortOrder: Prisma.SortOrder = url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

  const thresholds = {
    minEncounters: ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
    maxAttempts: ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  }

  const statusFilter: Prisma.EncounteredPlayerWhereInput | undefined =
    statuses.length > 0
      ? { OR: statuses.map((status) => buildStatusWhereClause(status, thresholds)) }
      : undefined

  const andClauses: Prisma.EncounteredPlayerWhereInput[] = []

  if (statusFilter) {
    andClauses.push(statusFilter)
  }
  if (minAttempts !== null) {
    andClauses.push({ resolveAttempts: { gte: minAttempts } })
  }
  if (clanId !== null) {
    andClauses.push({ clanId })
  }
  if (q) {
    const isContains = q.startsWith('*') || q.startsWith('%')
    const cleanQ = isContains ? q.replace(/^[*%]+/, '').trim() : q
    if (cleanQ) {
      andClauses.push({
        pubgPlayerName: isContains ? { contains: cleanQ } : { startsWith: cleanQ },
      })
    }
  }

  const where: Prisma.EncounteredPlayerWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {}

  let orderBy: Prisma.EncounteredPlayerOrderByWithRelationInput[] = [
    { resolveAttempts: 'desc' },
    { encounterCount: 'desc' },
  ]

  if (sortByParam === 'totalEncounterCount' || sortByParam === 'encounterCount') {
    orderBy = [{ encounterCount: sortOrder }]
  } else if (sortByParam === 'resolveAttempts') {
    orderBy = [{ resolveAttempts: sortOrder }, { encounterCount: 'desc' }]
  } else if (sortByParam === 'lastSeenAt') {
    orderBy = [{ lastSeenAt: sortOrder }]
  } else if (sortByParam === 'pubgPlayerName') {
    orderBy = [{ pubgPlayerName: sortOrder }]
  } else if (sortByParam === 'status') {
    orderBy = [{ clanResolvedAt: sortOrder }, { resolveAttempts: sortOrder }, { encounterCount: 'desc' }]
  }

  // Si recherche active (q) : agrégation immédiate et déduplication par joueur
  if (q) {
    const rawMatches = await prisma.encounteredPlayer.findMany({
      where,
      include: { clan: { select: { id: true, name: true, tag: true } } },
      orderBy: [{ encounterCount: 'desc' }, { lastSeenAt: 'desc' }],
    })

    const playerMap = new Map<string, any>()
    for (const row of rawMatches) {
      let existing = playerMap.get(row.pubgAccountId)
      if (!existing) {
        existing = {
          id: row.id,
          playerId: row.playerId,
          pubgAccountId: row.pubgAccountId,
          platformShard: row.platformShard,
          pubgPlayerName: row.pubgPlayerName,
          pubgClanTag: row.pubgClanTag,
          pubgClanName: row.pubgClanName,
          resolveAttempts: row.resolveAttempts,
          lastSeenAt: row.lastSeenAt,
          totalEncounterCount: 0,
          clans: [],
          clanId: row.clanId,
          clanTag: row.clan.tag,
          clanName: row.clan.name,
          clan: row.clan,
          status: deriveEncounteredPlayerStatus(row, thresholds),
        }
        playerMap.set(row.pubgAccountId, existing)
      }
      existing.totalEncounterCount += row.encounterCount
      existing.resolveAttempts = Math.max(existing.resolveAttempts, row.resolveAttempts)
      if (row.lastSeenAt > existing.lastSeenAt) {
        existing.lastSeenAt = row.lastSeenAt
      }
      if (row.pubgClanTag && !existing.pubgClanTag) {
        existing.pubgClanTag = row.pubgClanTag
        existing.pubgClanName = row.pubgClanName
        existing.status = deriveEncounteredPlayerStatus(row, thresholds)
      }
      existing.clans.push({
        clanId: row.clan.id,
        clanName: row.clan.name,
        clanTag: row.clan.tag,
        encounterCount: row.encounterCount,
        lastSeenAt: row.lastSeenAt.toISOString(),
      })
    }

    let uniquePlayers = Array.from(playerMap.values()).map((p) => ({
      ...p,
      distinctClanCount: p.clans.length,
      lastSeenAt: p.lastSeenAt.toISOString(),
    }))

    if (sortByParam === 'totalEncounterCount' || sortByParam === 'encounterCount') {
      uniquePlayers.sort((a, b) =>
        sortOrder === 'asc'
          ? a.totalEncounterCount - b.totalEncounterCount
          : b.totalEncounterCount - a.totalEncounterCount
      )
    } else if (sortByParam === 'distinctClanCount') {
      uniquePlayers.sort((a, b) =>
        sortOrder === 'asc'
          ? a.distinctClanCount - b.distinctClanCount
          : b.distinctClanCount - a.distinctClanCount
      )
    }

    const total = uniquePlayers.length
    const paginatedPlayers = uniquePlayers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const payload = {
      thresholds,
      page,
      pageSize: PAGE_SIZE,
      total,
      rows: paginatedPlayers,
      players: paginatedPlayers,
    }

    return Response.json({
      ...payload,
      data: payload,
    })
  }

  // Navigation standard (sans recherche de nom)
  const [total, rows] = await Promise.all([
    prisma.encounteredPlayer.count({ where }),
    prisma.encounteredPlayer.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { clan: { select: { id: true, tag: true, name: true } } },
    }),
  ])

  const accountIds = Array.from(new Set(rows.map((row) => row.pubgAccountId)))

  // Récupérer toutes les rencontres des clans suivis pour chaque joueur de la page
  const crossClanEncounters =
    accountIds.length > 0
      ? await prisma.encounteredPlayer.findMany({
          where: { pubgAccountId: { in: accountIds } },
          include: { clan: { select: { id: true, name: true, tag: true } } },
          orderBy: { encounterCount: 'desc' },
        })
      : []

  const encountersByAccount = new Map<string, typeof crossClanEncounters>()
  for (const encounter of crossClanEncounters) {
    const list = encountersByAccount.get(encounter.pubgAccountId) ?? []
    list.push(encounter)
    encountersByAccount.set(encounter.pubgAccountId, list)
  }

  // Déduplication au niveau de la page : un seul enregistrement par compte PUBG
  const seenAccounts = new Set<string>()
  const uniqueRows = rows.filter((row) => {
    if (seenAccounts.has(row.pubgAccountId)) return false
    seenAccounts.add(row.pubgAccountId)
    return true
  })

  const mappedPlayers = uniqueRows.map((row) => {
    const allClanEncounters = encountersByAccount.get(row.pubgAccountId) ?? [row]
    const distinctClanCount = allClanEncounters.length
    const totalEncounterCount = allClanEncounters.reduce((sum, e) => sum + e.encounterCount, 0)
    const maxAttempts = Math.max(...allClanEncounters.map((e) => e.resolveAttempts))
    const latestSeen = new Date(Math.max(...allClanEncounters.map((e) => e.lastSeenAt.getTime())))
    const resolvedRow = allClanEncounters.find((e) => e.clanResolvedAt !== null)

    return {
      id: row.id,
      playerId: row.playerId,
      clanId: row.clanId,
      clanTag: row.clan.tag,
      clanName: row.clan.name,
      clan: {
        name: row.clan.name,
        tag: row.clan.tag,
      },
      pubgAccountId: row.pubgAccountId,
      platformShard: row.platformShard,
      pubgPlayerName: row.pubgPlayerName,
      pubgClanTag: resolvedRow?.pubgClanTag ?? row.pubgClanTag,
      pubgClanName: resolvedRow?.pubgClanName ?? row.pubgClanName,
      encounterCount: row.encounterCount,
      totalEncounterCount,
      distinctClanCount,
      resolveAttempts: maxAttempts,
      status: deriveEncounteredPlayerStatus(resolvedRow ?? row, thresholds),
      lastSeenAt: latestSeen.toISOString(),
      clans: allClanEncounters.map((e) => ({
        clanId: e.clan.id,
        clanName: e.clan.name,
        clanTag: e.clan.tag,
        encounterCount: e.encounterCount,
        lastSeenAt: e.lastSeenAt.toISOString(),
      })),
    }
  })

  if (sortByParam === 'distinctClanCount') {
    mappedPlayers.sort((a, b) =>
      sortOrder === 'asc'
        ? a.distinctClanCount - b.distinctClanCount
        : b.distinctClanCount - a.distinctClanCount
    )
  }

  const payload = {
    thresholds,
    page,
    pageSize: PAGE_SIZE,
    total,
    rows: mappedPlayers,
    players: mappedPlayers,
  }

  return Response.json({
    ...payload,
    data: payload,
  })
}
