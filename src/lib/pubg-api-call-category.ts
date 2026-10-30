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
  player_detail: 'Détail joueur',
  weapon_mastery: 'Maîtrise des armes',
  season_lifetime: 'Stats à vie',
  season_ranked: 'Stats ranked',
  season_normal: 'Stats saison',
  seasons_list: 'Liste des saisons',
  clan_members: 'Membres du clan',
  clan_lookup: 'Clan',
  match_detail: 'Détail du match',
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

/**
 * Échec d'un appel PUBG, classé par ce qu'il faut en faire (docs/TODO/fraicheur-des-parties.md, lot 6). Sur 14 jours
 * (2026-10-30), 378 des 391 échecs étaient des 404 — partie pas encore publiée, joueur ou clan introuvable —, 13 des 5xx
 * ou des appels sans réponse, aucun 401, 403 ni 422.
 */
export type PubgApiFailureClass = 'expected' | 'transient' | 'rateLimited' | 'action'

/** Du plus grave au moins grave : ordre d'affichage des échecs regroupés. */
export const PUBG_API_FAILURE_CLASSES: PubgApiFailureClass[] = ['action', 'transient', 'rateLimited', 'expected']

export function classifyPubgApiFailure(statusCode: number | null | undefined): PubgApiFailureClass {
  if (statusCode === 429) return 'rateLimited'
  if (statusCode === 404) return 'expected'
  if (!statusCode || statusCode >= 500) return 'transient'
  return 'action'
}

export const PUBG_API_FAILURE_LABELS: Record<PubgApiFailureClass, { label: string; hint: string }> = {
  expected: {
    label: 'Attendu',
    hint: 'Absent chez PUBG : partie pas encore publiée (reprise au tour suivant), joueur ou clan introuvable.',
  },
  transient: {
    label: 'Passager',
    hint: 'Incident chez PUBG ou coupure réseau (5xx, pas de réponse) : la partie est retentée.',
  },
  rateLimited: { label: 'Limite de débit', hint: 'Réponse 429 : la clé a dépassé sa limite d’appels par minute.' },
  action: {
    label: 'À traiter',
    hint: 'Clé refusée ou appel mal formé (401, 403, 400, 422…) : rien ne se répare seul.',
  },
}

/**
 * Priorité dans la file PUBG d'après l'origine d'un appel (`PubgApiCallLog.source`), pour lire le quota par priorité
 * sans colonne de plus (docs/TODO/fraicheur-des-parties.md, lot 2). Doit dire la même chose que les appels eux-mêmes
 * (`priority` de leur contexte) : `pubg-api-call-category.test.ts` le contrôle sur le code. Une origine absente est
 * « normale » (pages, actions manuelles, `pubg-lib` pour un appel sans origine).
 */
export const PUBG_API_SOURCE_PRIORITIES: Readonly<Record<string, 'high' | 'low'>> = {
  'clan-match-sync': 'high',
  'tournament-sync': 'high',
  'clan-lifetime-sync': 'low',
  'season-stats-sync': 'low',
  'weapon-mastery-sync': 'low',
  'encountered-player-resolution-cron': 'low',
  'kill-feed-name-resolution-cron': 'low',
  'clan-lifecycle-cron': 'low',
}

export type PubgApiSourcePriority = 'high' | 'normal' | 'low'

export function pubgApiPriorityOfSource(source: string): PubgApiSourcePriority {
  return PUBG_API_SOURCE_PRIORITIES[source] ?? 'normal'
}

/** Échecs passagers à partir desquels une tranche (ou un jour) passe au rouge. */
export const TRANSIENT_FAILURES_ALERT = 3

export type PubgApiFailureCounts = { expected: number; transient: number; rateLimited: number; action: number }

export function emptyPubgApiFailureCounts(): PubgApiFailureCounts {
  return { expected: 0, transient: 0, rateLimited: 0, action: 0 }
}

/**
 * Ton d'une tranche ou d'un jour de la page API PUBG. Un seul échec « à traiter » ou une série d'échecs passagers la
 * rougit ; les 429 l'orangent ; les 404 attendus ne colorent rien — avant le 2026-10-30, un seul 404 sur 350 appels
 * suffisait à rougir une tranche.
 */
export function pubgApiSlotTone(point: Pick<PubgApiFailureCounts, 'action' | 'transient' | 'rateLimited'>): 'pos' | 'warn' | 'neg' {
  if (point.action > 0 || point.transient >= TRANSIENT_FAILURES_ALERT) return 'neg'
  if (point.rateLimited > 0) return 'warn'
  return 'pos'
}
