import type { Prisma } from '@prisma/client'

import { ARCHIVE_REASON_UNGROUPED_INACTIVE } from '@/lib/clan-lifecycle/ungrouped-archive'
import { prisma } from '@/lib/prisma'

/**
 * Annuaire transverse des joueurs — onglet « Joueurs » de `/settings/opponents`.
 *
 * Spécification : docs/TODO/players.md. Une ligne par `Player` (identité PUBG globale),
 * avec son statut de suivi calculé depuis `ClanMember`.
 *
 * La forme des requêtes découle des mesures du 2026-09-25 en production
 * (scripts/check-players-directory-cost.ts) : 520 000 `Player`, 2,1 M `ClanEncounter`,
 * 406 `ClanMember`.
 * - Trier TOUS les joueurs par rencontres impose un agrégat complet de `ClanEncounter` :
 *   204 s. Ce tri n'est servi que sur un ensemble borné, sinon il retombe sur la dernière vue.
 * - Deux des compteurs coûtent 1,3 s chacun : ils ne sont calculés qu'à la demande.
 * - `ClanMember` est minuscule : le rattachement membre → joueur se fait en mémoire.
 */

export const PLAYER_DIRECTORY_STATUS_FILTERS = ['all', 'tracked', 'untracked', 'noclan', 'favorites'] as const
export type PlayerDirectoryStatusFilter = (typeof PLAYER_DIRECTORY_STATUS_FILTERS)[number]

export const PLAYER_DIRECTORY_SORT_KEYS = ['lastSeenAt', 'pubgPlayerName', 'totalEncounters'] as const
export type PlayerDirectorySortKey = (typeof PLAYER_DIRECTORY_SORT_KEYS)[number]
export type PlayerDirectorySortOrder = 'asc' | 'desc'

export const PLAYER_DIRECTORY_DEFAULT_PAGE_SIZE = 25
export const PLAYER_DIRECTORY_MAX_PAGE_SIZE = 100
export const PLAYER_DIRECTORY_MAX_QUERY_LENGTH = 64
/** Au-delà, le tri par rencontres retombe sur la dernière vue (agrégat complet : 204 s). */
export const PLAYER_DIRECTORY_ENCOUNTER_SORT_MAX_CANDIDATES = 5000
/** Fenêtre du badge « mutation récente », qui renvoie vers le journal de `clan-lifecycle`. */
export const PLAYER_DIRECTORY_RECENT_CHANGE_DAYS = 30

/**
 * Statut de suivi d'un joueur, du plus fort au plus faible. `untracked` = aucune fiche
 * `ClanMember` ; les autres statuts en décrivent une.
 */
export type TrackingStatus = 'tracked' | 'parking' | 'pending' | 'archived' | 'stopped' | 'untracked'

const DEFAULT_SORT_ORDER: Record<PlayerDirectorySortKey, PlayerDirectorySortOrder> = {
  lastSeenAt: 'desc',
  totalEncounters: 'desc',
  pubgPlayerName: 'asc',
}

// ------------------------------------------------------------------ Paramètres

export type PlayersDirectoryQuery = {
  status: PlayerDirectoryStatusFilter
  q: string
  seenByClanId: number | null
  page: number
  pageSize: number
  sortBy: PlayerDirectorySortKey
  sortOrder: PlayerDirectorySortOrder
}

function parsePositiveInt(value: string | null) {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function isOneOf<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && (values as readonly string[]).includes(value)
}

/** Un paramètre invalide retombe sur sa valeur par défaut, comme dans `encountered-players`. */
export function parsePlayersDirectoryQuery(params: URLSearchParams): PlayersDirectoryQuery {
  const status = params.get('status')
  const sortBy = params.get('sortBy')
  const sortOrder = params.get('sortOrder')
  const pageSize = parsePositiveInt(params.get('pageSize'))
  const effectiveSortBy: PlayerDirectorySortKey = isOneOf(PLAYER_DIRECTORY_SORT_KEYS, sortBy) ? sortBy : 'lastSeenAt'

  return {
    status: isOneOf(PLAYER_DIRECTORY_STATUS_FILTERS, status) ? status : 'all',
    q: (params.get('q') ?? '').trim().slice(0, PLAYER_DIRECTORY_MAX_QUERY_LENGTH),
    seenByClanId: parsePositiveInt(params.get('seenByClanId')),
    page: parsePositiveInt(params.get('page')) ?? 1,
    pageSize: Math.min(pageSize ?? PLAYER_DIRECTORY_DEFAULT_PAGE_SIZE, PLAYER_DIRECTORY_MAX_PAGE_SIZE),
    sortBy: effectiveSortBy,
    sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : DEFAULT_SORT_ORDER[effectiveSortBy],
  }
}

// ------------------------------------------------------------------ Recherche

/**
 * Prisma ne protège PAS `_` ni `%` dans `startsWith` / `contains` : mesuré le 2026-09-25,
 * `startsWith('a_')` renvoie 36 416 joueurs au lieu de 285. On échappe donc nous-mêmes, avec
 * `\`, le caractère d'échappement par défaut de `LIKE` sous MariaDB.
 */
export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * Préfixe par défaut (servi par l'index `pubgPlayerName`) ; `*` ou `%` en tête demande une
 * sous-chaîne, même convention que l'onglet Triage. Casse et accents : la collation
 * `utf8mb4_unicode_ci` les ignore déjà.
 */
export function buildNameFilter(q: string): { startsWith: string } | { contains: string } | null {
  const trimmed = q.trim()
  const isContains = /^[*%]/.test(trimmed)
  const term = (isContains ? trimmed.replace(/^[*%]+/, '') : trimmed).trim()
  if (!term) return null
  const escaped = escapeLikePattern(term)
  return isContains ? { contains: escaped } : { startsWith: escaped }
}

// ------------------------------------------------------------------ Classification

export type DirectoryClan = { id: number; tag: string; name: string; isActive: boolean; isSystem: boolean }

export type DirectoryMember = {
  id: number
  displayName: string
  pubgPlayerName: string
  pubgAccountId: string | null
  platformShard: string
  playerId: string | null
  isActive: boolean
  joinStatus: string
  archivedReason: string | null
  clan: DirectoryClan | null
}

export type MemberClassification = {
  status: Exclude<TrackingStatus, 'untracked'>
  /** Pourquoi un membre n'est pas (ou plus) suivi : infobulle du badge. */
  reason: string | null
}

/**
 * Règles de docs/TODO/players.md §3.C. `isActive = false` porte plusieurs sens : seul
 * `archivedReason` distingue la purge du parking des autres arrêts de suivi. Tout
 * `joinStatus` autre que `active` / `pending` (`left`, `rejected`, l'ancienne watchlist
 * `tracked`) échappe aux synchronisations : il devient le motif d'un « suivi arrêté ».
 */
export function classifyMember(
  member: Pick<DirectoryMember, 'isActive' | 'joinStatus' | 'archivedReason' | 'clan'>
): MemberClassification {
  if (member.joinStatus === 'pending') return { status: 'pending', reason: null }

  if (member.isActive && member.joinStatus === 'active') {
    // Actif dans un clan qui ne l'est pas : hors de toute synchronisation, donc pas suivi.
    if (!member.clan) return { status: 'stopped', reason: 'no_clan' }
    if (!member.clan.isActive) return { status: 'stopped', reason: 'clan_inactive' }
    return { status: member.clan.isSystem ? 'parking' : 'tracked', reason: null }
  }

  if (!member.isActive && member.archivedReason === ARCHIVE_REASON_UNGROUPED_INACTIVE) {
    return { status: 'archived', reason: ARCHIVE_REASON_UNGROUPED_INACTIVE }
  }

  return {
    status: 'stopped',
    reason: member.archivedReason ?? (member.joinStatus !== 'active' ? member.joinStatus : 'deactivated'),
  }
}

const STATUS_PRIORITY: Record<MemberClassification['status'], number> = {
  tracked: 0,
  parking: 1,
  pending: 2,
  archived: 3,
  stopped: 4,
}

export type DirectoryMemberLink = MemberClassification & { member: DirectoryMember }

export type MemberIndex = {
  /** Fiche retenue pour chaque `Player` rattaché — la plus forte si plusieurs. */
  byPlayerId: Map<string, DirectoryMemberLink>
  /** Joueurs suivis (🟢 + 🔵) : le filtre `tracked`. */
  trackedPlayerIds: string[]
  /** Joueurs ayant au moins une fiche, quel que soit son statut : exclus de `untracked`. */
  linkedPlayerIds: string[]
  /** Membres suivis sans aucune ligne `Player` : absents de l'annuaire, signalés à part. */
  unlinkedMembers: DirectoryMember[]
}

export type PlayerAccountRow = { id: string; pubgAccountId: string; platformShard: string }

const accountKey = (pubgAccountId: string, platformShard: string) => `${platformShard}:${pubgAccountId}`

function isStrongerLink(candidate: DirectoryMemberLink, current: DirectoryMemberLink) {
  const diff = STATUS_PRIORITY[candidate.status] - STATUS_PRIORITY[current.status]
  return diff !== 0 ? diff < 0 : candidate.member.id > current.member.id
}

/**
 * `ClanMember.playerId` est nullable et n'est renseigné que par
 * `syncOpponentIdentityForMemberId` : on rattache aussi par (compte PUBG, shard), sinon
 * 21 membres actifs sur 398 seraient classés « non suivis » (mesure du 2026-09-25).
 */
export function buildMemberIndex(members: DirectoryMember[], players: PlayerAccountRow[]): MemberIndex {
  const playerIdByAccount = new Map(
    players.map((player) => [accountKey(player.pubgAccountId, player.platformShard), player.id])
  )
  const byPlayerId = new Map<string, DirectoryMemberLink>()
  const linked = new Set<string>()
  const unlinkedMembers: DirectoryMember[] = []

  for (const member of members) {
    const link: DirectoryMemberLink = { member, ...classifyMember(member) }
    const playerIds = new Set<string>()
    if (member.playerId) playerIds.add(member.playerId)
    if (member.pubgAccountId) {
      const viaAccount = playerIdByAccount.get(accountKey(member.pubgAccountId, member.platformShard))
      if (viaAccount) playerIds.add(viaAccount)
    }

    if (playerIds.size === 0) {
      if (link.status === 'tracked' || link.status === 'parking') unlinkedMembers.push(member)
      continue
    }

    for (const playerId of playerIds) {
      linked.add(playerId)
      const current = byPlayerId.get(playerId)
      if (!current || isStrongerLink(link, current)) byPlayerId.set(playerId, link)
    }
  }

  const trackedPlayerIds = Array.from(byPlayerId.entries())
    .filter(([, link]) => link.status === 'tracked' || link.status === 'parking')
    .map(([playerId]) => playerId)

  return { byPlayerId, trackedPlayerIds, linkedPlayerIds: Array.from(linked), unlinkedMembers }
}

const MEMBER_SELECT = {
  id: true,
  displayName: true,
  pubgPlayerName: true,
  pubgAccountId: true,
  platformShard: true,
  playerId: true,
  isActive: true,
  joinStatus: true,
  archivedReason: true,
  clan: { select: { id: true, tag: true, name: true, isActive: true, isSystem: true } },
} satisfies Prisma.ClanMemberSelect

export async function loadMemberIndex(): Promise<MemberIndex> {
  const members = await prisma.clanMember.findMany({ select: MEMBER_SELECT })

  const accountsByShard = new Map<string, Set<string>>()
  for (const member of members) {
    if (!member.pubgAccountId) continue
    const accounts = accountsByShard.get(member.platformShard) ?? new Set<string>()
    accounts.add(member.pubgAccountId)
    accountsByShard.set(member.platformShard, accounts)
  }

  const players =
    accountsByShard.size === 0
      ? []
      : await prisma.player.findMany({
          where: {
            OR: Array.from(accountsByShard.entries()).map(([platformShard, accounts]) => ({
              platformShard,
              pubgAccountId: { in: Array.from(accounts) },
            })),
          },
          select: { id: true, pubgAccountId: true, platformShard: true },
        })

  return buildMemberIndex(members, players)
}

// ------------------------------------------------------------------ Requête

/** Solo = résolu sans clan. Un joueur jamais résolu n'est pas solo : son clan est inconnu. */
export const SOLO_PLAYER_WHERE = {
  clanResolvedAt: { not: null },
  opponentClanId: null,
} satisfies Prisma.PlayerWhereInput

export function buildPlayersWhere(
  query: Pick<PlayersDirectoryQuery, 'status' | 'q' | 'seenByClanId'>,
  index: Pick<MemberIndex, 'trackedPlayerIds' | 'linkedPlayerIds'>
): { where: Prisma.PlayerWhereInput; empty: boolean } {
  const clauses: Prisma.PlayerWhereInput[] = []

  switch (query.status) {
    case 'tracked':
      // Aucun joueur suivi : inutile d'interroger la base.
      if (index.trackedPlayerIds.length === 0) return { where: {}, empty: true }
      clauses.push({ id: { in: index.trackedPlayerIds } })
      break
    case 'untracked':
      if (index.linkedPlayerIds.length > 0) clauses.push({ id: { notIn: index.linkedPlayerIds } })
      break
    case 'noclan':
      clauses.push(SOLO_PLAYER_WHERE)
      break
    case 'favorites':
      clauses.push({ isFavorite: true })
      break
  }

  const nameFilter = buildNameFilter(query.q)
  if (nameFilter) clauses.push({ pubgPlayerName: nameFilter })
  if (query.seenByClanId !== null) clauses.push({ encounters: { some: { clanId: query.seenByClanId } } })

  return { where: clauses.length > 0 ? { AND: clauses } : {}, empty: false }
}

function isUnfiltered(query: Pick<PlayersDirectoryQuery, 'status' | 'q' | 'seenByClanId'>) {
  return query.status === 'all' && buildNameFilter(query.q) === null && query.seenByClanId === null
}

/** Départage par `id` : sans lui, des ex æquo changeraient de page d'une requête à l'autre. */
export function buildPlayersOrderBy(
  sortBy: Exclude<PlayerDirectorySortKey, 'totalEncounters'>,
  sortOrder: PlayerDirectorySortOrder
): Prisma.PlayerOrderByWithRelationInput[] {
  return sortBy === 'pubgPlayerName'
    ? [{ pubgPlayerName: sortOrder }, { id: sortOrder }]
    : [{ lastSeenAt: sortOrder }, { id: sortOrder }]
}

export function sortPlayerIdsByEncounters(
  playerIds: string[],
  totals: Map<string, number>,
  sortOrder: PlayerDirectorySortOrder
) {
  const direction = sortOrder === 'asc' ? 1 : -1
  return [...playerIds].sort((a, b) => {
    const diff = (totals.get(a) ?? 0) - (totals.get(b) ?? 0)
    if (diff !== 0) return diff * direction
    return (a < b ? -1 : a > b ? 1 : 0) * direction
  })
}

// ------------------------------------------------------------------ Rencontres

export type EncounterRow = {
  playerId: string
  clanId: number
  encounterCount: number
  teammateEncounterCount: number
  lastSeenAt: Date
  clan: { tag: string; name: string } | null
}

export type EncounterSummary = {
  total: number
  asTeammate: number
  asOpponent: number
  distinctClanCount: number
  byClan: Array<{ clanId: number; tag: string | null; name: string | null; total: number; asTeammate: number }>
}

export const EMPTY_ENCOUNTER_SUMMARY: EncounterSummary = {
  total: 0,
  asTeammate: 0,
  asOpponent: 0,
  distinctClanCount: 0,
  byClan: [],
}

/** Une ligne `ClanEncounter` par (clan suivi, joueur) : on les somme par joueur. */
export function summarizeEncounters(rows: EncounterRow[]): Map<string, EncounterSummary> {
  const summaries = new Map<string, EncounterSummary>()

  for (const row of rows) {
    const summary = summaries.get(row.playerId) ?? { ...EMPTY_ENCOUNTER_SUMMARY, byClan: [] }
    summary.total += row.encounterCount
    summary.asTeammate += row.teammateEncounterCount
    summary.asOpponent = summary.total - summary.asTeammate
    summary.byClan.push({
      clanId: row.clanId,
      tag: row.clan?.tag ?? null,
      name: row.clan?.name ?? null,
      total: row.encounterCount,
      asTeammate: row.teammateEncounterCount,
    })
    summary.distinctClanCount = summary.byClan.length
    summaries.set(row.playerId, summary)
  }

  for (const summary of summaries.values()) {
    summary.byClan.sort((a, b) => b.total - a.total || a.clanId - b.clanId)
  }

  return summaries
}

// ------------------------------------------------------------------ Lignes

export function buildPubgLookupUrl(platformShard: string, pubgPlayerName: string) {
  return `https://pubglookup.com/players/${encodeURIComponent(platformShard)}/${encodeURIComponent(pubgPlayerName)}`
}

const PLAYER_SELECT = {
  id: true,
  pubgAccountId: true,
  platformShard: true,
  pubgPlayerName: true,
  isFavorite: true,
  firstSeenAt: true,
  lastSeenAt: true,
  clanResolvedAt: true,
  opponentClan: { select: { id: true, tag: true, name: true } },
} satisfies Prisma.PlayerSelect

export type DirectoryPlayer = Prisma.PlayerGetPayload<{ select: typeof PLAYER_SELECT }>

export type RecentClanChange = { id: string; status: string; source: string; detectedAt: string }

export type PlayersDirectoryRow = {
  playerId: string
  pubgAccountId: string
  platformShard: string
  pubgPlayerName: string
  isFavorite: boolean
  firstSeenAt: string
  lastSeenAt: string
  lookupUrl: string
  pubgClan:
    | { state: 'clan'; opponentClanId: string; tag: string | null; name: string | null }
    | { state: 'solo' }
    | { state: 'unknown' }
  encounters: EncounterSummary
  tracking: {
    status: TrackingStatus
    reason: string | null
    member: {
      id: number
      displayName: string
      clan: { id: number; tag: string; name: string; isSystem: boolean } | null
    } | null
  }
  recentChange: RecentClanChange | null
}

export function toDirectoryRow(
  player: DirectoryPlayer,
  encounters: EncounterSummary | undefined,
  link: DirectoryMemberLink | undefined,
  recentChange: RecentClanChange | undefined
): PlayersDirectoryRow {
  const pubgClan: PlayersDirectoryRow['pubgClan'] = player.opponentClan
    ? { state: 'clan', opponentClanId: player.opponentClan.id, tag: player.opponentClan.tag, name: player.opponentClan.name }
    : player.clanResolvedAt
      ? { state: 'solo' }
      : { state: 'unknown' }

  return {
    playerId: player.id,
    pubgAccountId: player.pubgAccountId,
    platformShard: player.platformShard,
    pubgPlayerName: player.pubgPlayerName,
    isFavorite: player.isFavorite,
    firstSeenAt: player.firstSeenAt.toISOString(),
    lastSeenAt: player.lastSeenAt.toISOString(),
    lookupUrl: buildPubgLookupUrl(player.platformShard, player.pubgPlayerName),
    pubgClan,
    encounters: encounters ?? { ...EMPTY_ENCOUNTER_SUMMARY, byClan: [] },
    tracking: link
      ? {
          status: link.status,
          reason: link.reason,
          member: {
            id: link.member.id,
            displayName: link.member.displayName,
            clan: link.member.clan
              ? {
                  id: link.member.clan.id,
                  tag: link.member.clan.tag,
                  name: link.member.clan.name,
                  isSystem: link.member.clan.isSystem,
                }
              : null,
          },
        }
      : { status: 'untracked', reason: null, member: null },
    recentChange: recentChange ?? null,
  }
}

// ------------------------------------------------------------------ Chargement

export type PlayersDirectoryCounters = {
  totalPlayers: number
  trackedPlayers: number
  untrackedPlayers: number
  soloPlayers: number
}

export type TrackableClan = { id: number; tag: string; name: string; isSystem: boolean; platformShard: string }

export type SortFallback = {
  requested: 'totalEncounters'
  reason: 'too_many_candidates'
  maxCandidates: number
}

export type PlayersDirectoryResult = {
  rows: PlayersDirectoryRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  sort: { by: PlayerDirectorySortKey; order: PlayerDirectorySortOrder; fallback: SortFallback | null }
  counters: PlayersDirectoryCounters | null
  /** Clans actifs : cibles du bouton « Suivre » et du filtre « Croisés par ». */
  trackableClans: TrackableClan[]
  unlinkedMembers: Array<{ id: number; displayName: string; clanTag: string | null }>
}

/** `untracked` se déduit du total : un `NOT IN` compté coûterait une seconde de plus. */
export async function loadPlayersDirectoryCounters(
  index: Pick<MemberIndex, 'trackedPlayerIds' | 'linkedPlayerIds'>
): Promise<PlayersDirectoryCounters> {
  const [totalPlayers, soloPlayers] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: SOLO_PLAYER_WHERE }),
  ])

  return {
    totalPlayers,
    trackedPlayers: index.trackedPlayerIds.length,
    untrackedPlayers: Math.max(0, totalPlayers - index.linkedPlayerIds.length),
    soloPlayers,
  }
}

async function loadTrackableClans(): Promise<TrackableClan[]> {
  return prisma.clan.findMany({
    where: { isActive: true },
    select: { id: true, tag: true, name: true, isSystem: true, platformShard: true },
    orderBy: [{ isSystem: 'asc' }, { tag: 'asc' }],
  })
}

async function loadPage(
  where: Prisma.PlayerWhereInput,
  sortBy: Exclude<PlayerDirectorySortKey, 'totalEncounters'>,
  sortOrder: PlayerDirectorySortOrder,
  skip: number,
  take: number
) {
  return prisma.player.findMany({ where, orderBy: buildPlayersOrderBy(sortBy, sortOrder), skip, take, select: PLAYER_SELECT })
}

/** Réservé aux ensembles bornés : l'agrégat ne porte que sur les joueurs candidats. */
async function loadPageByEncounters(
  where: Prisma.PlayerWhereInput,
  sortOrder: PlayerDirectorySortOrder,
  skip: number,
  take: number
): Promise<DirectoryPlayer[]> {
  const candidates = await prisma.player.findMany({
    where,
    select: { id: true },
    take: PLAYER_DIRECTORY_ENCOUNTER_SORT_MAX_CANDIDATES,
  })
  const candidateIds = candidates.map((candidate) => candidate.id)
  if (candidateIds.length === 0) return []

  const sums = await prisma.clanEncounter.groupBy({
    by: ['playerId'],
    where: { playerId: { in: candidateIds } },
    _sum: { encounterCount: true },
  })
  const totals = new Map(sums.map((sum) => [sum.playerId, sum._sum.encounterCount ?? 0]))
  const pageIds = sortPlayerIdsByEncounters(candidateIds, totals, sortOrder).slice(skip, skip + take)
  if (pageIds.length === 0) return []

  const players = await prisma.player.findMany({ where: { id: { in: pageIds } }, select: PLAYER_SELECT })
  const byId = new Map(players.map((player) => [player.id, player]))
  return pageIds.map((id) => byId.get(id)).filter((player): player is DirectoryPlayer => Boolean(player))
}

async function loadRecentChanges(memberIds: number[], now: Date) {
  const latestByMember = new Map<number, RecentClanChange>()
  if (memberIds.length === 0) return latestByMember

  const since = new Date(now.getTime() - PLAYER_DIRECTORY_RECENT_CHANGE_DAYS * 24 * 60 * 60 * 1000)
  const changes = await prisma.playerClanChange.findMany({
    where: { clanMemberId: { in: memberIds }, detectedAt: { gte: since } },
    orderBy: { detectedAt: 'desc' },
    select: { id: true, clanMemberId: true, status: true, source: true, detectedAt: true },
  })

  for (const change of changes) {
    if (change.clanMemberId === null || latestByMember.has(change.clanMemberId)) continue
    latestByMember.set(change.clanMemberId, {
      id: change.id,
      status: change.status,
      source: change.source,
      detectedAt: change.detectedAt.toISOString(),
    })
  }

  return latestByMember
}

export async function listPlayersDirectory(
  query: PlayersDirectoryQuery,
  options: { includeCounters?: boolean; now?: Date } = {}
): Promise<PlayersDirectoryResult> {
  const index = await loadMemberIndex()
  const { where, empty } = buildPlayersWhere(query, index)
  const skip = (query.page - 1) * query.pageSize

  const countersPromise = options.includeCounters ? loadPlayersDirectoryCounters(index) : Promise.resolve(null)
  // Sans filtre, le total est le compteur « Joueurs répertoriés » : un seul COUNT pour les deux.
  const totalPromise: Promise<number> = empty
    ? Promise.resolve(0)
    : isUnfiltered(query) && options.includeCounters
      ? countersPromise.then((counters) => counters?.totalPlayers ?? 0)
      : prisma.player.count({ where })
  const clansPromise = loadTrackableClans()

  let sortBy = query.sortBy
  let sortOrder = query.sortOrder
  let fallback: SortFallback | null = null
  let playersPromise: Promise<DirectoryPlayer[]>

  if (empty) {
    playersPromise = Promise.resolve([])
  } else if (query.sortBy === 'totalEncounters') {
    if ((await totalPromise) <= PLAYER_DIRECTORY_ENCOUNTER_SORT_MAX_CANDIDATES) {
      playersPromise = loadPageByEncounters(where, query.sortOrder, skip, query.pageSize)
    } else {
      fallback = {
        requested: 'totalEncounters',
        reason: 'too_many_candidates',
        maxCandidates: PLAYER_DIRECTORY_ENCOUNTER_SORT_MAX_CANDIDATES,
      }
      sortBy = 'lastSeenAt'
      sortOrder = DEFAULT_SORT_ORDER.lastSeenAt
      playersPromise = loadPage(where, sortBy, sortOrder, skip, query.pageSize)
    }
  } else {
    playersPromise = loadPage(where, query.sortBy, query.sortOrder, skip, query.pageSize)
  }

  const [total, counters, trackableClans, players] = await Promise.all([
    totalPromise,
    countersPromise,
    clansPromise,
    playersPromise,
  ])

  const playerIds = players.map((player) => player.id)
  const memberIds = playerIds
    .map((playerId) => index.byPlayerId.get(playerId)?.member.id)
    .filter((memberId): memberId is number => typeof memberId === 'number')

  const [encounterRows, recentChanges] = await Promise.all([
    playerIds.length === 0
      ? Promise.resolve([] as EncounterRow[])
      : prisma.clanEncounter.findMany({
          where: { playerId: { in: playerIds } },
          select: {
            playerId: true,
            clanId: true,
            encounterCount: true,
            teammateEncounterCount: true,
            lastSeenAt: true,
            clan: { select: { tag: true, name: true } },
          },
        }),
    loadRecentChanges(memberIds, options.now ?? new Date()),
  ])

  const summaries = summarizeEncounters(encounterRows)
  const rows = players.map((player) => {
    const link = index.byPlayerId.get(player.id)
    return toDirectoryRow(
      player,
      summaries.get(player.id),
      link,
      link ? recentChanges.get(link.member.id) : undefined
    )
  })

  return {
    rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
    sort: { by: sortBy, order: sortOrder, fallback },
    counters,
    trackableClans,
    unlinkedMembers: index.unlinkedMembers.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      clanTag: member.clan?.tag ?? null,
    })),
  }
}
