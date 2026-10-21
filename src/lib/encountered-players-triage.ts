import 'server-only'

import type { Prisma } from '@prisma/client'

import {
  ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
} from '@/lib/encountered-player-resolution-constants'
import {
  buildPlayerStatusesWhere,
  derivePlayerResolutionStatus,
  type EncounteredPlayerResolutionStatus,
} from '@/lib/encountered-player-status'
import { buildNameFilter } from '@/lib/players-directory'
import { prisma } from '@/lib/prisma'

/**
 * Lecture du Triage (`GET /api/settings/encountered-players`, onglet « Triage API » de Plateforme › Joueurs) : une
 * ligne par identité `Player`, avec ses compteurs tous clans et le détail de ses `ClanEncounter`.
 *
 * Fin d'EncounteredPlayer, étape 3 (docs/TODO/inventaire-2026-10-20.md §6) : auparavant une ligne `EncounteredPlayer`
 * par clan, dédupliquée page par page, et une recherche par nom qui chargeait toutes les lignes trouvées avant de
 * paginer. Le statut est désormais celui de l'identité, le même pour tous les clans qui l'ont croisée.
 */

export const TRIAGE_PAGE_SIZE = 20

export type TriageQuery = {
  statuses: EncounteredPlayerResolutionStatus[]
  minAttempts: number | null
  clanId: number | null
  q: string
  sortBy: string | null
  sortOrder: Prisma.SortOrder
  page: number
}

export type TriageClan = {
  clanId: number
  clanName: string
  clanTag: string
  encounterCount: number
  lastSeenAt: string
}

export type TriageRow = {
  id: string
  playerId: string
  clanId: number | null
  clanTag: string | null
  clanName: string | null
  clan: { name: string; tag: string } | null
  pubgAccountId: string
  platformShard: string
  pubgPlayerName: string
  pubgClanTag: string | null
  pubgClanName: string | null
  clanResolvedAt: string | null
  encounterCount: number
  totalEncounterCount: number
  distinctClanCount: number
  resolveAttempts: number
  status: EncounteredPlayerResolutionStatus
  lastSeenAt: string
  clans: TriageClan[]
}

const THRESHOLDS = {
  minEncounters: ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
  maxAttempts: ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
}

/** Ordre par défaut : celui du cron de résolution (`selectPrioritizedEncounteredPlayerIdentities`), lu sur l'index. */
const QUEUE_ORDER: Prisma.PlayerOrderByWithRelationInput[] = [
  { combatInteractionsCount: 'desc' },
  { encounterCount: 'desc' },
  { resolveAttempts: 'desc' },
  { id: 'desc' },
]

export function buildTriageWhere(query: Pick<TriageQuery, 'statuses' | 'minAttempts' | 'clanId' | 'q'>): Prisma.PlayerWhereInput {
  // Un joueur n'est à trier qu'une fois croisé : chaque statut l'exige, et sans filtre de statut la clause le pose seule.
  const andClauses: Prisma.PlayerWhereInput[] = [buildPlayerStatusesWhere(query.statuses, THRESHOLDS)]

  if (query.minAttempts !== null) {
    andClauses.push({ resolveAttempts: { gte: query.minAttempts } })
  }
  if (query.clanId !== null) {
    andClauses.push({ encounters: { some: { clanId: query.clanId } } })
  }
  // Même filtre que l'annuaire : `_` et `%` échappés, `*` ou `%` en tête pour une sous-chaîne ; un `*` seul ne filtre rien.
  const nameFilter = buildNameFilter(query.q)
  if (nameFilter) {
    andClauses.push({ pubgPlayerName: nameFilter })
  }

  return { AND: andClauses }
}

export function buildTriageOrderBy(sortBy: string | null, sortOrder: Prisma.SortOrder): Prisma.PlayerOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'totalEncounterCount':
    case 'encounterCount':
      return [{ encounterCount: sortOrder }, { id: 'desc' }]
    case 'resolveAttempts':
      return [{ resolveAttempts: sortOrder }, { encounterCount: 'desc' }, { id: 'desc' }]
    case 'lastSeenAt':
      return [{ lastSeenAt: sortOrder }, { id: 'desc' }]
    case 'pubgPlayerName':
      return [{ pubgPlayerName: sortOrder }, { id: 'asc' }]
    case 'status':
      return [{ clanResolvedAt: sortOrder }, { resolveAttempts: sortOrder }, { encounterCount: 'desc' }, { id: 'desc' }]
    default:
      // `distinctClanCount` compris : trier toutes les identités par leur nombre de clans demanderait de compter les
      // `ClanEncounter` de chaque joueur (3,6 M lignes) ; ce tri reste appliqué à la page, comme avant l'étape 3.
      return QUEUE_ORDER
  }
}

export async function loadEncounteredPlayersTriage(query: TriageQuery) {
  const where = buildTriageWhere(query)

  // En deux temps : la page est triée sur les seuls identifiants, que l'index `idx_player_resolution_priority` couvre
  // avec les colonnes de filtre et de tri, puis ses 20 lignes sont relues. Trier les lignes complètes faisait relire
  // chaque joueur de la file (373 000 accès au hasard) : 6,4 s pour le tri par rencontres contre 1,3 s ainsi
  // (mesuré en production le 2026-10-21).
  const [total, pageIds] = await Promise.all([
    prisma.player.count({ where }),
    prisma.player.findMany({
      where,
      orderBy: buildTriageOrderBy(query.sortBy, query.sortOrder),
      skip: (query.page - 1) * TRIAGE_PAGE_SIZE,
      take: TRIAGE_PAGE_SIZE,
      select: { id: true },
    }),
  ])

  const pageRows =
    pageIds.length > 0
      ? await prisma.player.findMany({
          where: { id: { in: pageIds.map((row) => row.id) } },
          select: {
            id: true,
            pubgAccountId: true,
            platformShard: true,
            pubgPlayerName: true,
            encounterCount: true,
            resolveAttempts: true,
            clanResolvedAt: true,
            lastSeenAt: true,
            opponentClanId: true,
            opponentClan: { select: { tag: true, name: true } },
          },
        })
      : []
  const rowById = new Map(pageRows.map((row) => [row.id, row]))
  const players = pageIds.flatMap((row) => rowById.get(row.id) ?? [])

  const encounters =
    players.length > 0
      ? await prisma.clanEncounter.findMany({
          where: { playerId: { in: players.map((player) => player.id) } },
          select: {
            playerId: true,
            encounterCount: true,
            lastSeenAt: true,
            clan: { select: { id: true, name: true, tag: true } },
          },
          orderBy: [{ encounterCount: 'desc' }, { lastSeenAt: 'desc' }],
        })
      : []

  const encountersByPlayer = new Map<string, typeof encounters>()
  for (const encounter of encounters) {
    const list = encountersByPlayer.get(encounter.playerId) ?? []
    list.push(encounter)
    encountersByPlayer.set(encounter.playerId, list)
  }

  const rows: TriageRow[] = players.map((player) => {
    const playerEncounters = encountersByPlayer.get(player.id) ?? []
    // Clan affiché en tête : celui du filtre s'il y en a un, sinon celui qui l'a le plus croisé.
    const primary =
      (query.clanId !== null ? playerEncounters.find((encounter) => encounter.clan.id === query.clanId) : undefined) ??
      playerEncounters[0]

    return {
      id: player.id,
      playerId: player.id,
      clanId: primary?.clan.id ?? null,
      clanTag: primary?.clan.tag ?? null,
      clanName: primary?.clan.name ?? null,
      clan: primary ? { name: primary.clan.name, tag: primary.clan.tag } : null,
      pubgAccountId: player.pubgAccountId,
      platformShard: player.platformShard,
      pubgPlayerName: player.pubgPlayerName,
      pubgClanTag: player.opponentClan?.tag ?? null,
      pubgClanName: player.opponentClan?.name ?? null,
      clanResolvedAt: player.clanResolvedAt?.toISOString() ?? null,
      encounterCount: primary?.encounterCount ?? player.encounterCount,
      totalEncounterCount: player.encounterCount,
      distinctClanCount: playerEncounters.length,
      resolveAttempts: player.resolveAttempts,
      status: derivePlayerResolutionStatus(player, THRESHOLDS),
      lastSeenAt: player.lastSeenAt.toISOString(),
      clans: playerEncounters.map((encounter) => ({
        clanId: encounter.clan.id,
        clanName: encounter.clan.name,
        clanTag: encounter.clan.tag,
        encounterCount: encounter.encounterCount,
        lastSeenAt: encounter.lastSeenAt.toISOString(),
      })),
    }
  })

  if (query.sortBy === 'distinctClanCount') {
    rows.sort((a, b) =>
      query.sortOrder === 'asc' ? a.distinctClanCount - b.distinctClanCount : b.distinctClanCount - a.distinctClanCount
    )
  }

  return { thresholds: THRESHOLDS, page: query.page, pageSize: TRIAGE_PAGE_SIZE, total, rows }
}
