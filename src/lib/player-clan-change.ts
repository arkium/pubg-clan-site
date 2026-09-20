import type { Prisma } from '@prisma/client'

/**
 * Journal des changements de clan d'un joueur — cycle de vie du clan d'un joueur
 * (docs/TODO/todo.md, section P2).
 *
 * Toute écriture passe par ici pour que les valeurs de `source` et `status` restent
 * cohérentes entre le cron de synchronisation, la promotion depuis le clan système
 * et les bascules manuelles.
 */

export const PLAYER_CLAN_CHANGE_SOURCES = {
  /** Cron quotidien : écart constaté, aucun mouvement appliqué. */
  playerSync: 'player_sync',
  /** Cron quotidien : bascule automatique vers le clan système. */
  autoDemotion: 'auto_demotion',
  /** Cron quotidien : transfert automatique entre deux clans suivis. */
  autoTransfer: 'auto_transfer',
  /** Sortie du clan système vers un clan suivi (chantier 2, cas A). */
  ungroupedPromotion: 'ungrouped_promotion',
  /** Passe hebdomadaire sur les coéquipiers fréquents — hors membres suivis. */
  playerRefresh: 'player_refresh',
  /** Bascule manuelle vers le clan système par un Owner (chantier 3). */
  manualDemotion: 'manual_demotion',
  /**
   * Transfert manuel d'un clan suivi vers un autre, par un SuperUser.
   * Valeur absente du plan initial : elle manquait pour tracer l'action de
   * transfert qui existait déjà avant ces chantiers.
   */
  manualTransfer: 'manual_transfer',
  /** Annulation d'un mouvement précédent depuis le journal. */
  manualRevert: 'manual_revert',
} as const

export type PlayerClanChangeSource =
  (typeof PLAYER_CLAN_CHANGE_SOURCES)[keyof typeof PLAYER_CLAN_CHANGE_SOURCES]

export const PLAYER_CLAN_CHANGE_STATUSES = {
  /** Mode observation : l'événement est écrit, rien n'est appliqué. */
  observed: 'observed',
  /** En attente d'une décision humaine (création de clan à valider). */
  pending: 'pending',
  /** Mouvement réellement appliqué. */
  applied: 'applied',
  /** Écarté par le SuperUser. */
  ignored: 'ignored',
  /** Mouvement annulé depuis le journal. */
  reverted: 'reverted',
} as const

export type PlayerClanChangeStatus =
  (typeof PLAYER_CLAN_CHANGE_STATUSES)[keyof typeof PLAYER_CLAN_CHANGE_STATUSES]

export type RecordPlayerClanChangeInput = {
  clanMemberId?: number | null
  pubgAccountId?: string | null
  platformShard: string
  previousClanId?: number | null
  newClanId?: number | null
  previousPubgClanId?: string | null
  previousPubgClanTag?: string | null
  newPubgClanId?: string | null
  newPubgClanTag?: string | null
  source: PlayerClanChangeSource
  status?: PlayerClanChangeStatus
  runId?: string | null
  triggeredByUserId?: number | null
}

/**
 * Écrit une ligne de journal.
 *
 * `client` accepte aussi bien `prisma` qu'un client de transaction : le mouvement du
 * membre et son événement doivent être écrits dans la même transaction, sinon on
 * obtient soit un mouvement sans trace, soit une trace sans mouvement
 * (« Sûreté d'exécution » C dans le todo).
 */
export async function recordPlayerClanChange(
  client: Prisma.TransactionClient,
  input: RecordPlayerClanChangeInput
) {
  const status = input.status ?? PLAYER_CLAN_CHANGE_STATUSES.applied

  return client.playerClanChange.create({
    data: {
      clanMemberId: input.clanMemberId ?? null,
      pubgAccountId: input.pubgAccountId ?? null,
      platformShard: input.platformShard,
      previousClanId: input.previousClanId ?? null,
      newClanId: input.newClanId ?? null,
      previousPubgClanId: input.previousPubgClanId ?? null,
      previousPubgClanTag: input.previousPubgClanTag ?? null,
      newPubgClanId: input.newPubgClanId ?? null,
      newPubgClanTag: input.newPubgClanTag ?? null,
      source: input.source,
      status,
      runId: input.runId ?? null,
      triggeredByUserId: input.triggeredByUserId ?? null,
      // Un statut `observed` ou `pending` n'a rien appliqué : pas de date d'application.
      appliedAt: status === PLAYER_CLAN_CHANGE_STATUSES.applied ? new Date() : null,
    },
  })
}
