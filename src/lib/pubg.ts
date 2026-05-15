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

export async function searchPlayerByName(playerName: string, shard: string = 'steam') {
  try {
    const response = await pubgApi.get(`/shards/${shard}/players`, {
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
