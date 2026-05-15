import axios from 'axios'

const PUBG_API_KEY = process.env.PUBG_API_KEY
const PUBG_BASE_URL = process.env.PUBG_BASE_URL || 'https://api.pubg.com'

if (!PUBG_API_KEY) {
  throw new Error('PUBG_API_KEY is missing')
}

export const pubgApi = axios.create({
  baseURL: PUBG_BASE_URL,
  headers: {
    Authorization: `Bearer ${PUBG_API_KEY}`,
    Accept: 'application/vnd.api+json',
  },
})

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
    relationships?: Record<
      string,
      {
        data?: MatchReference[]
      }
    >
  }
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

export async function searchPlayerByName(playerName: string, shard: string = 'steam') {
  try {
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
    return {
      playerName: player.attributes.name,
      accountId: player.id,
    }
  } catch (error) {
    console.error('Error searching player:', error)
    throw error
  }
}

export async function fetchRecentMatchIds(playerId: string, shard: string = 'steam') {
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

export async function fetchMatchDetails(
  matchId: string,
  playerId: string,
  shard: string = 'steam'
): Promise<ResolvedPubgMatch> {
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
