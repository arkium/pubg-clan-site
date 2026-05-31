import {
  fetchLifetimeStats,
  fetchMatchDetails,
  fetchPlayerClan,
  fetchPubgClanById,
  fetchRecentMatchIds,
  searchPlayerByName,
  type PubgClan,
  type PubgLifetimeStats,
  type ResolvedPubgMatch,
} from '@/lib/pubg'

export const PUBG_SHARDS = [
  'kakao',
  'psn',
  'steam',
  'tournament',
  'xbox',
  'pc-as',
  'pc-eu',
  'pc-jp',
  'pc-kakao',
  'pc-krjp',
  'pc-na',
  'pc-oc',
  'pc-ru',
  'pc-sa',
  'pc-sea',
  'pc-tournament',
  'psn-as',
  'psn-eu',
  'psn-na',
  'psn-oc',
  'xbox-as',
  'xbox-eu',
  'xbox-na',
  'xbox-oc',
  'xbox-sa',
] as const

export type PubgShard = (typeof PUBG_SHARDS)[number]

function normalizeShard(shard: string): string {
  const normalized = shard.trim().toLowerCase()
  return normalized.length > 0 ? normalized : 'steam'
}

function isKnownShard(shard: string): shard is PubgShard {
  return (PUBG_SHARDS as readonly string[]).includes(shard)
}

function resolveShard(shard: string | undefined, fallback: PubgShard): PubgShard {
  if (!shard) {
    return fallback
  }

  const normalized = normalizeShard(shard)
  if (isKnownShard(normalized)) {
    return normalized
  }

  return fallback
}

export type PubgPlayerLookup = {
  playerName: string
  accountId: string
} | null

export class PubgDomainClient {
  private readonly defaultShard: PubgShard

  constructor(defaultShard: PubgShard = 'steam') {
    this.defaultShard = defaultShard
  }

  get shard(): PubgShard {
    return this.defaultShard
  }

  async searchPlayerByName(playerName: string, shard?: string): Promise<PubgPlayerLookup> {
    return searchPlayerByName(playerName, resolveShard(shard, this.defaultShard))
  }

  async fetchPubgClanById(clanId: string, shard?: string): Promise<PubgClan | null> {
    return fetchPubgClanById(clanId, resolveShard(shard, this.defaultShard))
  }

  async fetchPlayerClan(playerId: string, shard?: string): Promise<PubgClan | null> {
    return fetchPlayerClan(playerId, resolveShard(shard, this.defaultShard))
  }

  async fetchRecentMatchIds(playerId: string, shard?: string): Promise<string[]> {
    return fetchRecentMatchIds(playerId, resolveShard(shard, this.defaultShard))
  }

  async fetchLifetimeStats(playerId: string, shard?: string): Promise<PubgLifetimeStats> {
    return fetchLifetimeStats(playerId, resolveShard(shard, this.defaultShard))
  }

  async fetchMatchDetails(matchId: string, playerId: string, shard?: string): Promise<ResolvedPubgMatch> {
    return fetchMatchDetails(matchId, playerId, resolveShard(shard, this.defaultShard))
  }
}

export function createPubgDomainClient(defaultShard: PubgShard = 'steam') {
  return new PubgDomainClient(defaultShard)
}

export const pubgDomainClient = createPubgDomainClient()
