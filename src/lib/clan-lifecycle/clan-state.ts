import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'
import { pubgApi, type PubgApiCallContext } from '@/lib/pubg'

/**
 * Résolution à TROIS états du clan PUBG d'un joueur — garde-fou A de la section
 * « Sûreté d'exécution » (docs/TODO/todo.md, P2).
 *
 * `fetchPlayerClan` renvoie `null` aussi bien quand le joueur n'a pas de clan que
 * quand le champ manque de la réponse : les deux cas sont indistinguables, et le cron
 * du chantier 1 les traiterait pareil — en basculant le joueur vers `Ungrouped`.
 * Ici on sépare explicitement :
 *
 *   - `has_clan` : un identifiant de clan exploitable
 *   - `no_clan`  : l'API dit explicitement « pas de clan » (`""` ou `null`)
 *   - `unknown`  : on ne sait pas — champ absent, compte absent de la réponse, erreur
 *                  réseau. **Ne déclenche jamais d'action.**
 *
 * Mesuré le 2026-09-20 sur l'API réelle : un joueur sans clan renvoie la chaîne vide,
 * jamais un champ absent. `unknown` couvre donc surtout les réponses tronquées, les
 * comptes invalides et les pannes.
 */

/** Plafond dur mesuré le 2026-09-20 : au-delà, l'API renvoie 200 OK avec 10 joueurs. */
export const PLAYER_IDS_BATCH_LIMIT = 10

export type ClanIdState =
  | { kind: 'has_clan'; clanId: string }
  | { kind: 'no_clan' }
  | { kind: 'unknown'; reason: UnknownReason }

export type UnknownReason =
  | 'field_absent'
  | 'missing_from_response'
  | 'unexpected_type'
  | 'request_failed'

const CLAN_ID_KEYS = ['clanId', 'clanID', 'clan_id'] as const

/**
 * Lit l'état du clan depuis les attributs bruts d'un joueur.
 * Exportée pour être testable sans appel réseau.
 */
export function readClanIdState(attributes: Record<string, unknown> | undefined): ClanIdState {
  if (!attributes) {
    return { kind: 'unknown', reason: 'field_absent' }
  }

  for (const key of CLAN_ID_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(attributes, key)) {
      continue
    }

    const raw = attributes[key]

    // `null` et chaîne vide sont les deux façons dont l'API dit « pas de clan ».
    if (raw === null || raw === '') {
      return { kind: 'no_clan' }
    }

    if (typeof raw !== 'string') {
      return { kind: 'unknown', reason: 'unexpected_type' }
    }

    const trimmed = raw.trim()
    return trimmed.length > 0 ? { kind: 'has_clan', clanId: trimmed } : { kind: 'no_clan' }
  }

  // Aucune des clés connues n'est présente : on ne conclut pas.
  return { kind: 'unknown', reason: 'field_absent' }
}

type PlayersResponse = {
  data?: Array<{ id?: string; attributes?: Record<string, unknown> }>
}

/**
 * Interroge un lot de comptes et renvoie l'état de chacun.
 *
 * Deux protections, toutes deux issues de mesures du 2026-09-20 :
 *   - le lot est **plafonné à 10** ; au-delà l'API tronque sans erreur, et les comptes
 *     tombés seraient lus comme « sans clan » ;
 *   - tout compte demandé mais **absent de la réponse** devient `unknown`, jamais
 *     `no_clan` — c'est ce qui arrive à un `playerId` invalide, silencieusement omis.
 */
export async function fetchPlayersClanStates(
  accountIds: string[],
  shard: string,
  context?: PubgApiCallContext
): Promise<Map<string, ClanIdState>> {
  if (accountIds.length > PLAYER_IDS_BATCH_LIMIT) {
    throw new Error(
      `Lot de ${accountIds.length} comptes : l'API PUBG tronque silencieusement au-delà de ${PLAYER_IDS_BATCH_LIMIT}. Découper en amont.`
    )
  }

  const states = new Map<string, ClanIdState>()
  if (accountIds.length === 0) {
    return states
  }

  const url = `/shards/${shard}/players`

  try {
    const response = await enqueuePubgApiRequestWithMetadata(
      () =>
        pubgApi.get<PlayersResponse>(url, {
          params: { 'filter[playerIds]': accountIds.join(',') },
        }),
      {
        source: context?.source ?? 'clan-lifecycle',
        method: 'GET',
        endpoint: url,
        shard,
        clanId: context?.clanId ?? null,
        memberId: context?.memberId ?? null,
      }
    )

    const byId = new Map<string, Record<string, unknown> | undefined>()
    for (const player of response.data.data ?? []) {
      if (player.id) {
        byId.set(player.id, player.attributes)
      }
    }

    for (const accountId of accountIds) {
      states.set(
        accountId,
        byId.has(accountId)
          ? readClanIdState(byId.get(accountId))
          : { kind: 'unknown', reason: 'missing_from_response' }
      )
    }
  } catch {
    // Une panne réseau ne dit rien sur l'appartenance : tout le lot reste inconnu.
    for (const accountId of accountIds) {
      states.set(accountId, { kind: 'unknown', reason: 'request_failed' })
    }
  }

  return states
}

/** Découpe une liste de comptes en lots respectant le plafond de l'API. */
export function chunkAccountIds(accountIds: string[], size = PLAYER_IDS_BATCH_LIMIT) {
  if (size < 1) {
    throw new Error('La taille de lot doit être au moins 1')
  }

  const chunks: string[][] = []
  for (let index = 0; index < accountIds.length; index += size) {
    chunks.push(accountIds.slice(index, index + size))
  }
  return chunks
}

/** Clé de comparaison stable d'un état — deux états égaux produisent la même clé. */
export function clanStateKey(state: ClanIdState) {
  switch (state.kind) {
    case 'has_clan':
      return `has_clan:${state.clanId}`
    case 'no_clan':
      return 'no_clan'
    default:
      return `unknown:${state.reason}`
  }
}
