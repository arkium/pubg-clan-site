import axios from 'axios'

const PUBG_API_KEY = process.env.PUBG_API_KEY
const PUBG_BASE_URL = process.env.PUBG_BASE_URL || 'https://api.pubg.com'

export const pubgApi = axios.create({
  baseURL: PUBG_BASE_URL,
  headers: {
    Authorization: `Bearer ${PUBG_API_KEY}`,
    Accept: 'application/vnd.api+json',
  },
})

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
  playerId?: string
  kills?: number
  DBNOs?: number
  assists?: number
  damageDealt?: number
  headshotKills?: number
  revives?: number
  winPlace?: number
}

type PubgIncludedItem = {
  id?: string
  type?: string
  attributes?: {
    stats?: ParticipantStats
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

export async function searchPlayerByName(playerName: string, shard: string = 'steam') {
  try {
    ensurePubgApiKey()
    const response = await pubgApi.get<PubgPlayerSearchResponse>(`/shards/${shard}/players`, {
      params: {
        'filter[playerNames]': playerName,
      },
    })

    const players = response.data.data
    if (!players || players.length === 0) {
      return null
    }

    const player = players[0]
    const resolvedPlayerName = player.attributes?.name

    if (!player.id || !resolvedPlayerName) {
      return null
    }

    return {
      playerName: resolvedPlayerName,
      accountId: player.id,
    }
  } catch (error) {
    console.error('Error searching player:', error)
    throw error
  }
}

export async function fetchRecentMatchIds(playerId: string, shard: string = 'steam') {
  ensurePubgApiKey()
  const response = await pubgApi.get<PubgLifetimeMatchesResponse>(
    `/shards/${shard}/players/${playerId}/seasons/lifetime`
  )
  const relationships = response.data.data?.relationships ?? {}
  const matchIds: string[] = []

  Object.values(relationships).forEach((modeMatches) => {
    modeMatches.data?.forEach((match) => {
      if (match.id && !matchIds.includes(match.id)) {
        matchIds.push(match.id)
      }
    })
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

export async function fetchLifetimeStats(
  playerId: string,
  shard: string = 'steam'
): Promise<PubgLifetimeStats> {
  ensurePubgApiKey()
  const response = await pubgApi.get<PubgLifetimeMatchesResponse>(
    `/shards/${shard}/players/${playerId}/seasons/lifetime`
  )
  const gameModeStats = response.data.data?.attributes?.gameModeStats ?? {}
  const sourceStats =
    gameModeStats.all ?? (Object.keys(gameModeStats).length > 0 ? aggregateGameModeStats(gameModeStats) : {})

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

export async function fetchMatchDetails(
  matchId: string,
  playerId: string,
  shard: string = 'steam'
): Promise<ResolvedPubgMatch> {
  ensurePubgApiKey()
  const response = await pubgApi.get<PubgMatchResponse>(`/shards/${shard}/matches/${matchId}`)
  const match = response.data.data
  const included = Array.isArray(response.data.included) ? response.data.included : []
  const rosters = match?.relationships?.rosters?.data

  if (!match || !Array.isArray(rosters)) {
    throw new Error('Invalid match data from PUBG API')
  }

  let playerStats: ParticipantStats | undefined

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

    if (playerStats) {
      break
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
