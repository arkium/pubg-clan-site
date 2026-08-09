import axios, { type AxiosRequestConfig } from 'axios'

import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'
import { prisma } from '@/lib/prisma'

// Fenêtre de fraîcheur du cache Player pour searchPlayerByName — plus courte
// que la résolution de clan (PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS dans
// cron-jobs.ts) car un renommage de joueur est possible, quoique rare.
// Valeur de départ à ajuster après observation réelle.
const PLAYER_NAME_SEARCH_FRESHNESS_DAYS = 3

type PubgApiError = Error & {
  status?: number
  responseHeaders?: Record<string, unknown>
}

export type PubgApiCallContext = {
  clanId?: number
  memberId?: number
  // Distingue l'origine d'un appel dans PubgApiCallLog (ex. 'encountered-player-resolution-cron'
  // vs 'encountered-player-resolution-manual') — remplace le 'pubg-lib' par défaut si fourni.
  source?: string
}

const PUBG_API_KEY = process.env.PUBG_API_KEY
const PUBG_BASE_URL = process.env.PUBG_BASE_URL || 'https://api.pubg.com'

export const pubgApi = axios.create({
  baseURL: PUBG_BASE_URL,
  headers: {
    Authorization: `Bearer ${PUBG_API_KEY}`,
    Accept: 'application/vnd.api+json',
  },
})

async function queuedPubgGet<T>(url: string, config?: AxiosRequestConfig, context?: PubgApiCallContext) {
  return enqueuePubgApiRequestWithMetadata(() => pubgApi.get<T>(url, config), {
    source: context?.source ?? 'pubg-lib',
    method: 'GET',
    endpoint: url,
    shard: extractShardFromEndpoint(url),
    clanId: context?.clanId ?? null,
    memberId: context?.memberId ?? null,
  })
}

function extractShardFromEndpoint(url: string) {
  const match = url.match(/\/shards\/([^/]+)/i)
  return match?.[1] ?? null
}

pubgApi.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error)
    }

    const status = error.response?.status
    const method = (error.config?.method || 'get').toUpperCase()
    const url = error.config?.url || 'unknown-url'
    const safeError: PubgApiError = new Error(
      `[PUBG] API request failed (${status ?? 'no-status'}) ${method} ${url}`
    )
    safeError.status = status
    safeError.responseHeaders = (error.response?.headers as Record<string, unknown> | undefined) ?? undefined

    return Promise.reject(safeError)
  }
)

function ensurePubgApiKey() {
  if (!PUBG_API_KEY) {
    throw new Error('PUBG_API_KEY is missing')
  }
}

type PubgPlayerSearchResponse = {
  data?: Array<{
    id: string
    attributes?: {
      name?: string
    }
  }>
}

type JsonApiRelationship = {
  id?: string
  type?: string
}

type JsonApiRelationshipData = JsonApiRelationship | JsonApiRelationship[] | null

type PubgClanResource = {
  id?: string
  type?: string
  attributes?: Record<string, unknown>
  relationships?: Record<string, unknown>
}

type PubgPlayerDetailResponse = {
  data?: {
    id?: string
    attributes?: {
      clanId?: string
      clanID?: string
      clan_id?: string
    }
    relationships?: {
      clan?: {
        data?: JsonApiRelationshipData
      }
      clans?: {
        data?: JsonApiRelationshipData
      }
    }
  }
  included?: PubgClanResource[]
}

type PubgClanLookupResponse = {
  data?: PubgClanResource[] | PubgClanResource
}

type MatchReference = {
  id?: string
}

type PubgLifetimeMatchesResponse = {
  data?: {
    attributes?: {
      gameModeStats?: Record<string, PubgGameModeStats>
    }
    relationships?: Record<
      string,
      {
        data?: MatchReference[]
      }
    >
  }
}

type PubgGameModeStats = {
  assists?: number
  boosts?: number
  damageDealt?: number
  dBNOs?: number
  headshotKills?: number
  heals?: number
  kills?: number
  longestKill?: number
  losses?: number
  maxKillStreaks?: number
  mostSurvivalTime?: number
  revives?: number
  rideDistance?: number
  roadKills?: number
  suicides?: number
  swimDistance?: number
  teamKills?: number
  vehicleDestroys?: number
  walkDistance?: number
  weaponsAcquired?: number
  wins?: number
}

type ParticipantStats = {
  name?: string
  playerId?: string
  kills?: number
  DBNOs?: number
  assists?: number
  damageDealt?: number
  headshotKills?: number
  revives?: number
  winPlace?: number
  timeSurvived?: number
  rideDistance?: number
  walkDistance?: number
  swimDistance?: number
  boosts?: number
  heals?: number
  vehicleDestroys?: number
  roadKills?: number
  longestKill?: number
  teamKills?: number
  weaponsAcquired?: number
}

type PubgAssetAttributes = {
  URL?: string
  url?: string
  createdAt?: string
}

type PubgIncludedItem = {
  id?: string
  type?: string
  attributes?: {
    stats?: ParticipantStats
    URL?: string
    url?: string
    createdAt?: string
  }
  relationships?: {
    participants?: {
      data?: MatchReference[]
    }
  }
}

type PubgMatchResponse = {
  data?: {
    id: string
    attributes?: {
      gameMode?: string
      mapName?: string
      createdAt?: string
      duration?: number
      durationSeconds?: number
    }
    relationships?: {
      rosters?: {
        data?: MatchReference[]
      }
    }
  }
  included?: PubgIncludedItem[]
}

export type ResolvedPubgMatch = {
  id: string
  gameMode: string
  mapName: string
  createdAt: string
  durationSeconds: number
  rosters: Array<{
    id: string
    participants: Array<{
      playerId: string
      playerName: string
      kills: number
      knockouts: number
      assists: number
      damageDealt: number
      headshotKills: number
      revives: number
      position: number
      timeSurvived: number
      rideDistance: number
      walkDistance: number
      swimDistance: number
      boosts: number
      heals: number
      vehicleDestroys: number
      roadKills: number
      longestKill: number
      teamKills: number
      weaponsAcquired: number
    }>
  }>
  stats: {
    kills: number
    knockouts: number
    assists: number
    damageDealt: number
    headshotKills: number
    revives: number
    position: number
  }
}

export type ResolvedPubgMatchWithTelemetry = ResolvedPubgMatch & {
  telemetryAssetUrl: string | null
  telemetryGeneratedAt: string | null
}

function resolveRosterParticipants(
  included: PubgIncludedItem[],
  participants: MatchReference[]
) {
  return participants
    .map((participantRef) => {
      if (!participantRef.id) {
        return null
      }

      const participant = included.find(
        (item) => item.id === participantRef.id && item.type === 'participant'
      )
      const stats = participant?.attributes?.stats

      if (!participant?.id || !stats?.playerId) {
        return null
      }

      return {
        playerId: stats.playerId,
        playerName: stats.name ?? stats.playerId,
        kills: stats.kills ?? 0,
        knockouts: stats.DBNOs ?? 0,
        assists: stats.assists ?? 0,
        damageDealt: stats.damageDealt ?? 0,
        headshotKills: stats.headshotKills ?? 0,
        revives: stats.revives ?? 0,
        position: stats.winPlace ?? 0,
        timeSurvived: stats.timeSurvived ?? 0,
        rideDistance: stats.rideDistance ?? 0,
        walkDistance: stats.walkDistance ?? 0,
        swimDistance: stats.swimDistance ?? 0,
        boosts: stats.boosts ?? 0,
        heals: stats.heals ?? 0,
        vehicleDestroys: stats.vehicleDestroys ?? 0,
        roadKills: stats.roadKills ?? 0,
        longestKill: stats.longestKill ?? 0,
        teamKills: stats.teamKills ?? 0,
        weaponsAcquired: stats.weaponsAcquired ?? 0,
      }
    })
    .filter((participant): participant is NonNullable<typeof participant> => participant !== null)
}

function resolveTelemetryAssetFromIncluded(included: PubgIncludedItem[]) {
  const asset = included.find((item) => item.type === 'asset')

  if (!asset) {
    return {
      telemetryAssetUrl: null,
      telemetryGeneratedAt: null,
    }
  }

  const attributes = asset.attributes as PubgAssetAttributes | undefined

  return {
    telemetryAssetUrl: attributes?.URL ?? attributes?.url ?? null,
    telemetryGeneratedAt: attributes?.createdAt ?? null,
  }
}

export type PubgLifetimeStats = {
  combat: {
    kills: number
    deaths: number
    kdRatio: number
    headshots: number
    assists: number
    knockouts: number
    highestKillstreak: number
    longestKill: number
    teamkills: number
    suicides: number
  }
  victory: {
    wins: number
    losses: number
    winLossRatio: number
    longestTimeAlive: number
  }
  support: {
    teammatesRevived: number
    boostsUsed: number
    healed: number
  }
  vehicle: {
    vehiclesDestroyed: number
    roadkills: number
  }
  movement: {
    drivenDistance: number
    walkedDistance: number
    swamDistance: number
  }
  other: {
    weaponsPicked: number
    damageGiven: number
  }
}

export type PubgClan = {
  id: string
  name: string
  tag: string
  memberCount: number | null
  memberIds: string[] | null
  raw: Record<string, unknown>
}

export type PubgClanMember = {
  accountId: string
  name: string | null
}

function pickString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function pickNumber(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function normalizePubgClanResource(resource: PubgClanResource): PubgClan | null {
  if (!resource.id) {
    return null
  }

  const attributes = resource.attributes ?? {}
  const name =
    pickString(attributes.name, attributes.clanName, attributes.title) ?? `Clan ${resource.id}`
  const tag = pickString(attributes.tag, attributes.clanTag, name) ?? name
  const memberCount = pickNumber(
    attributes.memberCount,
    attributes.membersCount,
    attributes.member_count,
    attributes.clanMemberCount
  )

  const membersRel = (resource.relationships?.members as { data?: { id?: string }[] } | undefined)
  const memberIds = Array.isArray(membersRel?.data)
    ? membersRel.data.map((m) => m.id).filter((id): id is string => typeof id === 'string')
    : null

  return {
    id: resource.id,
    name,
    tag,
    memberCount,
    memberIds: memberIds && memberIds.length > 0 ? memberIds : null,
    raw: {
      id: resource.id,
      type: resource.type ?? 'clan',
      attributes,
      relationships: resource.relationships ?? null,
    },
  }
}

function extractClanResource(payload: PubgClanLookupResponse): PubgClanResource | null {
  if (Array.isArray(payload.data)) {
    return payload.data[0] ?? null
  }

  return payload.data ?? null
}

function resolveClanRelationshipId(relationships?: PubgPlayerDetailResponse['data'] extends infer T
  ? T extends { relationships?: infer R }
    ? R
    : never
  : never) {
  const candidates: JsonApiRelationshipData[] = []

  if (relationships?.clan?.data !== undefined) {
    candidates.push(relationships.clan.data)
  }

  if (relationships?.clans?.data !== undefined) {
    candidates.push(relationships.clans.data)
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    if (Array.isArray(candidate)) {
      const firstClan = candidate.find((item) => typeof item?.id === 'string')
      if (firstClan?.id) {
        return firstClan.id
      }
      continue
    }

    if (typeof candidate.id === 'string' && candidate.id.length > 0) {
      return candidate.id
    }
  }

  return null
}

function resolveClanIdFromPlayerAttributes(
  attributes?: PubgPlayerDetailResponse['data'] extends infer T
    ? T extends { attributes?: infer A }
      ? A
      : never
    : never
) {
  return pickString(attributes?.clanId, attributes?.clanID, attributes?.clan_id)
}

export async function searchPlayerByName(
  playerName: string,
  shard: string = 'steam',
  context?: PubgApiCallContext
) {
  try {
    const freshnessCutoff = new Date(
      Date.now() - PLAYER_NAME_SEARCH_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
    )
    const cached = await prisma.player.findFirst({
      where: {
        pubgPlayerName: { equals: playerName },
        platformShard: shard,
        updatedAt: { gte: freshnessCutoff },
      },
    })

    if (cached) {
      return {
        playerName: cached.pubgPlayerName,
        accountId: cached.pubgAccountId,
      }
    }

    ensurePubgApiKey()
    const response = await queuedPubgGet<PubgPlayerSearchResponse>(
      `/shards/${shard}/players`,
      {
        params: {
          'filter[playerNames]': playerName,
        },
      },
      context
    )

    const players = response.data.data
    if (!players || players.length === 0) {
      return null
    }

    const player = players[0]
    const resolvedPlayerName = player.attributes?.name

    if (!player.id || !resolvedPlayerName) {
      return null
    }

    await prisma.player.upsert({
      where: { pubgAccountId_platformShard: { pubgAccountId: player.id, platformShard: shard } },
      update: { pubgPlayerName: resolvedPlayerName, lastSeenAt: new Date() },
      create: {
        pubgAccountId: player.id,
        platformShard: shard,
        pubgPlayerName: resolvedPlayerName,
      },
    })

    return {
      playerName: resolvedPlayerName,
      accountId: player.id,
    }
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    if (status === 404) {
      return null
    }
    console.error('Error searching player:', error)
    throw error
  }
}

export async function fetchPubgClanById(
  clanId: string,
  shard: string = 'steam',
  context?: PubgApiCallContext
) {
  ensurePubgApiKey()

  // La recherche par `filter[clanIds]` sur `/clans` echoue systematiquement en 404 sur ce compte API
  // (verifie sur 120 appels reels) ; on appelle directement `/clans/{clanId}` puisque l'ID est deja connu,
  // ce qui evite de doubler la consommation de quota RPM pour chaque lookup de clan.
  const response = await queuedPubgGet<PubgClanLookupResponse>(
    `/shards/${shard}/clans/${clanId}`,
    undefined,
    context
  )
  const clan = extractClanResource(response.data)
  return clan ? normalizePubgClanResource(clan) : null
}

export async function fetchClanMembers(
  clanId: string,
  shard: string = 'steam',
  context?: PubgApiCallContext
): Promise<PubgClanMember[]> {
  ensurePubgApiKey()

  try {
    const response = await queuedPubgGet<{ data?: { id?: string; attributes?: { name?: string } }[] }>(
      `/shards/${shard}/clans/${clanId}/members`,
      undefined,
      context
    )

    const members = response.data.data
    if (!Array.isArray(members)) return []

    return members
      .filter((m) => typeof m.id === 'string')
      .map((m) => ({
        accountId: m.id as string,
        name: pickString(m.attributes?.name) ?? null,
      }))
  } catch (error) {
    console.error('[PUBG] Error fetching clan members', { clanId, shard, error })
    throw error
  }
}

export async function fetchPlayerClan(
  playerId: string,
  shard: string = 'steam',
  context?: PubgApiCallContext
) {
  ensurePubgApiKey()

  console.info('[PUBG] Fetching clan for player', { playerId, shard })

  const response = await queuedPubgGet<PubgPlayerDetailResponse>(
    `/shards/${shard}/players/${playerId}`,
    undefined,
    context
  )

  const attributeClanId = resolveClanIdFromPlayerAttributes(response.data.data?.attributes)

  const relatedClanId = attributeClanId ?? resolveClanRelationshipId(response.data.data?.relationships)

  console.info('[PUBG] Player clan relationship resolved', {
    playerId,
    shard,
    attributeClanId,
    relatedClanId,
    hasIncludedClan: Array.isArray(response.data.included),
  })

  if (!relatedClanId) {
    console.warn('[PUBG] No clan relationship found for player', { playerId, shard })
    return null
  }

  const includedClan = Array.isArray(response.data.included)
    ? response.data.included.find(
        (item) =>
          item.id === relatedClanId &&
          (item.type === 'clan' || item.type === 'clans')
      )
    : null

  if (includedClan) {
        console.info('[PUBG] Clan found in included payload', {
          playerId,
          shard,
          clanId: includedClan.id,
        })
    return normalizePubgClanResource(includedClan)
  }

      console.info('[PUBG] Clan not included, fetching clan by id', {
        playerId,
        shard,
        relatedClanId,
      })

  return fetchPubgClanById(relatedClanId, shard, context)
}

export async function fetchRecentMatchIds(
  playerId: string,
  shard: string = 'steam',
  context?: PubgApiCallContext
) {
  ensurePubgApiKey()
  const response = await queuedPubgGet<PubgLifetimeMatchesResponse>(
    `/shards/${shard}/players/${playerId}/seasons/lifetime`,
    undefined,
    context
  )
  const relationships = response.data.data?.relationships ?? {}
  const matchIds: string[] = []

  Object.values(relationships).forEach((modeMatches) => {
    if (Array.isArray(modeMatches.data)) {
      modeMatches.data.forEach((match) => {
        if (match.id && !matchIds.includes(match.id)) {
          matchIds.push(match.id)
        }
      })
    }
  })

  return matchIds
}

function toNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toRatio(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return numerator > 0 ? numerator : 0
  }

  return numerator / denominator
}

function aggregateGameModeStats(gameModeStats: Record<string, PubgGameModeStats>) {
  return Object.values(gameModeStats).reduce<PubgGameModeStats>((acc, modeStats) => {
    Object.entries(modeStats).forEach(([key, value]) => {
      if (typeof value !== 'number') {
        return
      }

      const statKey = key as keyof PubgGameModeStats
      acc[statKey] = (acc[statKey] ?? 0) + value
    })

    return acc
  }, {})
}

function buildStatsFromMode(sourceStats: PubgGameModeStats): PubgLifetimeStats {
  const kills = toNumber(sourceStats.kills)
  const deaths = toNumber(sourceStats.losses)
  const wins = toNumber(sourceStats.wins)
  const losses = toNumber(sourceStats.losses)

  return {
    combat: {
      kills,
      deaths,
      kdRatio: toRatio(kills, deaths),
      headshots: toNumber(sourceStats.headshotKills),
      assists: toNumber(sourceStats.assists),
      knockouts: toNumber(sourceStats.dBNOs),
      highestKillstreak: toNumber(sourceStats.maxKillStreaks),
      longestKill: toNumber(sourceStats.longestKill),
      teamkills: toNumber(sourceStats.teamKills),
      suicides: toNumber(sourceStats.suicides),
    },
    victory: {
      wins,
      losses,
      winLossRatio: toRatio(wins, losses),
      longestTimeAlive: toNumber(sourceStats.mostSurvivalTime),
    },
    support: {
      teammatesRevived: toNumber(sourceStats.revives),
      boostsUsed: toNumber(sourceStats.boosts),
      healed: toNumber(sourceStats.heals),
    },
    vehicle: {
      vehiclesDestroyed: toNumber(sourceStats.vehicleDestroys),
      roadkills: toNumber(sourceStats.roadKills),
    },
    movement: {
      drivenDistance: toNumber(sourceStats.rideDistance),
      walkedDistance: toNumber(sourceStats.walkDistance),
      swamDistance: toNumber(sourceStats.swimDistance),
    },
    other: {
      weaponsPicked: toNumber(sourceStats.weaponsAcquired),
      damageGiven: toNumber(sourceStats.damageDealt),
    },
  }
}

function getModeAggregate(
  gameModeStats: Record<string, PubgGameModeStats>,
  ...keys: string[]
): PubgLifetimeStats | null {
  const present = keys.filter((k) => k in gameModeStats)
  if (present.length === 0) return null

  const merged = present.reduce<PubgGameModeStats>((acc, k) => {
    Object.entries(gameModeStats[k]).forEach(([key, value]) => {
      if (typeof value === 'number') {
        const statKey = key as keyof PubgGameModeStats
        acc[statKey] = (acc[statKey] ?? 0) + value
      }
    })
    return acc
  }, {})

  return buildStatsFromMode(merged)
}

export type PubgLifetimeStatsResult = PubgLifetimeStats & {
  byMode: {
    squad: PubgLifetimeStats | null
    duo: PubgLifetimeStats | null
    solo: PubgLifetimeStats | null
  }
}

export async function fetchLifetimeStats(
  playerId: string,
  shard: string = 'steam',
  context?: PubgApiCallContext
): Promise<PubgLifetimeStatsResult> {
  ensurePubgApiKey()
  const response = await queuedPubgGet<PubgLifetimeMatchesResponse>(
    `/shards/${shard}/players/${playerId}/seasons/lifetime`,
    undefined,
    context
  )
  const gameModeStats = response.data.data?.attributes?.gameModeStats ?? {}
  const sourceStats =
    gameModeStats.all ?? (Object.keys(gameModeStats).length > 0 ? aggregateGameModeStats(gameModeStats) : {})

  return {
    ...buildStatsFromMode(sourceStats),
    byMode: {
      squad: getModeAggregate(gameModeStats, 'squad', 'squad-fpp'),
      duo: getModeAggregate(gameModeStats, 'duo', 'duo-fpp'),
      solo: getModeAggregate(gameModeStats, 'solo', 'solo-fpp'),
    },
  }
}

type PubgSeasonsResponse = {
  data?: Array<{
    id?: string
    attributes?: {
      isCurrentSeason?: boolean
      isOffseason?: boolean
    }
  }>
}

type PubgRankedTier = {
  tier?: string
  subTier?: string
}

type PubgRankedGameModeStats = {
  currentTier?: PubgRankedTier
  currentRankPoint?: number
  bestTier?: PubgRankedTier
  bestRankPoint?: number
  kills?: number
  damageDealt?: number
  roundsPlayed?: number
  wins?: number
  assists?: number
  revives?: number
}

type PubgNormalGameModeStats = {
  kills?: number
  damageDealt?: number
  wins?: number
  losses?: number
  assists?: number
  revives?: number
  roundsPlayed?: number
}

type PubgRankedSeasonResponse = {
  data?: {
    attributes?: {
      rankedGameModeStats?: Record<string, PubgRankedGameModeStats>
    }
  }
}

type PubgNormalSeasonResponse = {
  data?: {
    attributes?: {
      gameModeStats?: Record<string, PubgNormalGameModeStats>
    }
  }
}

export type PubgCurrentSeason = {
  seasonId: string
  isCurrentSeason: boolean
  isOffseason: boolean
}

type PubgWeaponMasteryStatsTotal = {
  Kills?: number
  HeadShots?: number
  Defeats?: number
  Groggies?: number
  DamagePlayer?: number
  // LongestKill only exists in OfficialStatsTotal/CompetitiveStatsTotal — StatsTotal (legacy) never has it
  LongestKill?: number
}

type PubgWeaponMasteryItem = {
  XPTotal?: number
  LevelCurrent?: number
  TierCurrent?: number
  // StatsTotal is frozen as of patch 18.2 — legacy data only
  StatsTotal?: PubgWeaponMasteryStatsTotal
  // OfficialStatsTotal and CompetitiveStatsTotal are the active trackers post-18.2
  OfficialStatsTotal?: PubgWeaponMasteryStatsTotal
  CompetitiveStatsTotal?: PubgWeaponMasteryStatsTotal
}

type PubgWeaponMasteryResponse = {
  data?: {
    attributes?: {
      weaponSummaries?: Record<string, PubgWeaponMasteryItem>
      platform?: string
      seasonId?: string
      latestMatchId?: string
    }
  }
}

export type PubgWeaponMasteryEntry = {
  weaponId: string
  weaponName: string
  kills: number
  headshots: number
  knockouts: number
  shots: number
  hits: number
  damage: number
  longestKillDistance: number
  level: number
  xpTotal: number
  tier: number
}

export type PubgPlayerRankedStats = {
  tier: string | null
  subTier: string | null
  currentRankPoints: number
  bestTier: string | null
  bestSubTier: string | null
  bestRankPoints: number
  kills: number
  damageDealt: number
  roundsPlayed: number
  wins: number
  assists: number
  revives: number
  gameMode: string
}

export type PubgPlayerSeasonStats = {
  kills: number
  damageDealt: number
  wins: number
  losses: number
  assists: number
  revives: number
  roundsPlayed: number
}

export async function fetchCurrentSeason(shard: string = 'steam'): Promise<PubgCurrentSeason | null> {
  ensurePubgApiKey()
  const response = await queuedPubgGet<PubgSeasonsResponse>(`/shards/${shard}/seasons`)
  const seasons = response.data.data

  if (!Array.isArray(seasons)) {
    return null
  }

  const current = seasons.find((season) => season.attributes?.isCurrentSeason === true)

  if (!current?.id) {
    return null
  }

  return {
    seasonId: current.id,
    isCurrentSeason: true,
    isOffseason: current.attributes?.isOffseason === true,
  }
}

const SQUAD_RANKED_MODES = ['squad-fpp', 'squad', 'duo-fpp', 'duo', 'solo-fpp', 'solo']

export async function fetchPlayerRankedStats(
  playerId: string,
  shard: string = 'steam',
  seasonId: string,
  context?: PubgApiCallContext
): Promise<PubgPlayerRankedStats | null> {
  ensurePubgApiKey()

  try {
    const response = await queuedPubgGet<PubgRankedSeasonResponse>(
      `/shards/${shard}/players/${playerId}/seasons/${seasonId}/ranked`,
      undefined,
      context
    )

    const modeStats = response.data.data?.attributes?.rankedGameModeStats

    if (!modeStats) {
      return null
    }

    for (const mode of SQUAD_RANKED_MODES) {
      const stats = modeStats[mode]
      if (!stats || !stats.currentTier?.tier) {
        continue
      }

      return {
        tier: stats.currentTier.tier ?? null,
        subTier: stats.currentTier.subTier ?? null,
        currentRankPoints: toNumber(stats.currentRankPoint),
        bestTier: stats.bestTier?.tier ?? null,
        bestSubTier: stats.bestTier?.subTier ?? null,
        bestRankPoints: toNumber(stats.bestRankPoint),
        kills: toNumber(stats.kills),
        damageDealt: toNumber(stats.damageDealt),
        roundsPlayed: toNumber(stats.roundsPlayed),
        wins: toNumber(stats.wins),
        assists: toNumber(stats.assists),
        revives: toNumber(stats.revives),
        gameMode: mode,
      }
    }

    return null
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    if (status === 404 || status === 422) {
      return null
    }
    throw error
  }
}

export async function fetchPlayerSeasonStats(
  playerId: string,
  shard: string = 'steam',
  seasonId: string,
  context?: PubgApiCallContext
): Promise<PubgPlayerSeasonStats> {
  ensurePubgApiKey()
  const response = await queuedPubgGet<PubgNormalSeasonResponse>(
    `/shards/${shard}/players/${playerId}/seasons/${seasonId}`,
    undefined,
    context
  )

  const gameModeStats = response.data.data?.attributes?.gameModeStats ?? {}
  const sourceStats =
    gameModeStats.squad ?? gameModeStats['squad-fpp'] ?? (Object.keys(gameModeStats).length > 0 ? aggregateGameModeStats(gameModeStats as Record<string, PubgGameModeStats>) : {})

  return {
    kills: toNumber((sourceStats as PubgGameModeStats).kills),
    damageDealt: toNumber((sourceStats as PubgGameModeStats).damageDealt),
    wins: toNumber((sourceStats as PubgGameModeStats).wins),
    losses: toNumber((sourceStats as PubgGameModeStats).losses),
    assists: toNumber((sourceStats as PubgGameModeStats).assists),
    revives: toNumber((sourceStats as PubgGameModeStats).revives),
    roundsPlayed: toNumber(
      ((sourceStats as PubgGameModeStats).wins ?? 0) + ((sourceStats as PubgGameModeStats).losses ?? 0)
    ),
  }
}

function deriveWeaponName(weaponId: string): string {
  return weaponId
    .replace(/^Item_Weapon_/i, '')
    .replace(/_C$/i, '')
    .replace(/_/g, ' ')
    .trim()
}

export async function fetchWeaponMastery(
  playerId: string,
  shard: string = 'steam',
  context?: PubgApiCallContext
): Promise<PubgWeaponMasteryEntry[]> {
  ensurePubgApiKey()

  try {
    const response = await queuedPubgGet<PubgWeaponMasteryResponse>(
      `/shards/${shard}/players/${playerId}/weapon_mastery`,
      undefined,
      context
    )

    const summary = response.data.data?.attributes?.weaponSummaries ?? {}

    return Object.entries(summary).map(([weaponId, data]) => {
      // OfficialStatsTotal is the active tracker post-patch 18.2; StatsTotal is frozen legacy data.
      // Merge field by field rather than picking one object wholesale, since a weapon can have
      // real post-18.2 activity (OfficialStatsTotal) while its legacy totals stayed frozen at zero, or vice versa.
      const official = data.OfficialStatsTotal
      const legacy = data.StatsTotal
      const competitive = data.CompetitiveStatsTotal
      return {
        weaponId,
        weaponName: deriveWeaponName(weaponId),
        kills: official?.Kills ?? legacy?.Kills ?? 0,
        headshots: official?.HeadShots ?? legacy?.HeadShots ?? 0,
        // Groggies = knockdowns; Defeats is a distinct (near-always zero) PUBG metric, not a knockout count.
        knockouts: official?.Groggies ?? legacy?.Groggies ?? 0,
        // The weapon_mastery endpoint has never exposed shot/hit counts — only DamagePlayer.
        shots: 0,
        hits: 0,
        damage: official?.DamagePlayer ?? legacy?.DamagePlayer ?? 0,
        // LongestKill only lives in OfficialStatsTotal/CompetitiveStatsTotal — never in legacy StatsTotal.
        longestKillDistance: official?.LongestKill ?? competitive?.LongestKill ?? 0,
        level: data.LevelCurrent ?? 0,
        xpTotal: data.XPTotal ?? 0,
        tier: data.TierCurrent ?? 0,
      }
    })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('404') || error.message.includes('422'))
    ) {
      return []
    }
    throw error
  }
}

async function fetchMatchResponse(matchId: string, shard: string, context?: PubgApiCallContext) {
  ensurePubgApiKey()
  const response = await queuedPubgGet<PubgMatchResponse>(
    `/shards/${shard}/matches/${matchId}`,
    undefined,
    context
  )
  const match = response.data.data
  const included = Array.isArray(response.data.included) ? response.data.included : []

  return {
    match,
    included,
  }
}

function resolveMatchDetails(
  match: NonNullable<PubgMatchResponse['data']>,
  included: PubgIncludedItem[],
  playerId: string
): ResolvedPubgMatch {
  const rosters = match.relationships?.rosters?.data

  if (!Array.isArray(rosters)) {
    throw new Error('Invalid match data from PUBG API')
  }

  let playerStats: ParticipantStats | undefined
  const resolvedRosters: ResolvedPubgMatch['rosters'] = []

  for (const rosterRef of rosters) {
    if (!rosterRef.id) {
      continue
    }

    const roster = included.find(
      (item) => item.id === rosterRef.id && item.type === 'roster'
    )
    const participants = roster?.relationships?.participants?.data

    if (!Array.isArray(participants)) {
      continue
    }

    resolvedRosters.push({
      id: rosterRef.id,
      participants: resolveRosterParticipants(included, participants),
    })

    for (const participantRef of participants) {
      if (!participantRef.id) {
        continue
      }

      const participant = included.find(
        (item) =>
          item.id === participantRef.id &&
          item.type === 'participant' &&
          item.attributes?.stats?.playerId === playerId
      )

      if (participant?.attributes?.stats) {
        playerStats = participant.attributes.stats
        break
      }
    }
  }

  if (!playerStats) {
    throw new Error('Player not found in match')
  }

  return {
    id: match.id,
    gameMode: match.attributes?.gameMode ?? 'unknown',
    mapName: match.attributes?.mapName ?? 'Unknown',
    createdAt: match.attributes?.createdAt ?? new Date().toISOString(),
    durationSeconds: match.attributes?.durationSeconds ?? match.attributes?.duration ?? 0,
    rosters: resolvedRosters,
    stats: {
      kills: playerStats.kills ?? 0,
      knockouts: playerStats.DBNOs ?? 0,
      assists: playerStats.assists ?? 0,
      damageDealt: playerStats.damageDealt ?? 0,
      headshotKills: playerStats.headshotKills ?? 0,
      revives: playerStats.revives ?? 0,
      position: playerStats.winPlace ?? 0,
    },
  }
}

export async function fetchMatchDetails(
  matchId: string,
  playerId: string,
  shard: string = 'steam',
  context?: PubgApiCallContext
): Promise<ResolvedPubgMatch> {
  const { match, included } = await fetchMatchResponse(matchId, shard, context)

  if (!match) {
    throw new Error('Invalid match data from PUBG API')
  }

  return resolveMatchDetails(match, included, playerId)
}

export async function fetchMatchDetailsWithTelemetryAsset(
  matchId: string,
  playerId: string,
  shard: string = 'steam',
  context?: PubgApiCallContext
): Promise<ResolvedPubgMatchWithTelemetry> {
  const { match, included } = await fetchMatchResponse(matchId, shard, context)

  if (!match) {
    throw new Error('Invalid match data from PUBG API')
  }

  const details = resolveMatchDetails(match, included, playerId)
  const telemetry = resolveTelemetryAssetFromIncluded(included)

  return {
    ...details,
    telemetryAssetUrl: telemetry.telemetryAssetUrl,
    telemetryGeneratedAt: telemetry.telemetryGeneratedAt,
  }
}
