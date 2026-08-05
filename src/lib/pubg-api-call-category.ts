export type PubgApiCallCategory =
  | 'player_search'
  | 'player_detail'
  | 'weapon_mastery'
  | 'season_lifetime'
  | 'season_ranked'
  | 'season_normal'
  | 'seasons_list'
  | 'clan_members'
  | 'clan_lookup'
  | 'match_detail'
  | 'other'

export const PUBG_API_CALL_CATEGORIES: PubgApiCallCategory[] = [
  'player_search',
  'player_detail',
  'weapon_mastery',
  'season_lifetime',
  'season_ranked',
  'season_normal',
  'seasons_list',
  'clan_members',
  'clan_lookup',
  'match_detail',
  'other',
]

export const PUBG_API_CALL_CATEGORY_LABELS: Record<PubgApiCallCategory, string> = {
  player_search: 'Recherche joueur',
  player_detail: 'Detail joueur',
  weapon_mastery: 'Maitrise armes',
  season_lifetime: 'Stats lifetime',
  season_ranked: 'Stats ranked',
  season_normal: 'Stats saison',
  seasons_list: 'Liste des saisons',
  clan_members: 'Membres du clan',
  clan_lookup: 'Clan',
  match_detail: 'Detail match',
  other: 'Autre',
}

/**
 * Toutes les requetes PUBG passent par `queuedPubgGet` (src/lib/pubg.ts) avec `source`
 * toujours egal a 'pubg-lib' et `endpoint` toujours egal au chemin REST brut
 * (ex: /shards/steam/players/{id}/weapon_mastery). La categorisation se fait donc sur
 * la forme du chemin, pas sur `source` qui n'apporte aucune information distinctive ici.
 */
export function categorizePubgApiCall(source: string, endpoint: string): PubgApiCallCategory {
  const path = endpoint.split('?')[0] ?? ''
  const afterShard = path.replace(/^\/shards\/[^/]+/i, '')

  if (/^\/players\/[^/]+\/weapon_mastery\/?$/i.test(afterShard)) {
    return 'weapon_mastery'
  }

  if (/^\/players\/[^/]+\/seasons\/lifetime\/?$/i.test(afterShard)) {
    return 'season_lifetime'
  }

  if (/^\/players\/[^/]+\/seasons\/[^/]+\/ranked\/?$/i.test(afterShard)) {
    return 'season_ranked'
  }

  if (/^\/players\/[^/]+\/seasons\/[^/]+\/?$/i.test(afterShard)) {
    return 'season_normal'
  }

  if (/^\/players\/[^/]+\/?$/i.test(afterShard)) {
    return 'player_detail'
  }

  if (/^\/players\/?$/i.test(afterShard)) {
    return 'player_search'
  }

  if (/^\/seasons\/?$/i.test(afterShard)) {
    return 'seasons_list'
  }

  if (/^\/clans\/[^/]+\/members\/?$/i.test(afterShard)) {
    return 'clan_members'
  }

  if (/^\/clans(\/[^/]+)?\/?$/i.test(afterShard)) {
    return 'clan_lookup'
  }

  if (/^\/matches\/[^/]+\/?$/i.test(afterShard)) {
    return 'match_detail'
  }

  return 'other'
}
