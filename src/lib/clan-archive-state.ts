import type { Prisma } from '@prisma/client'

/**
 * États d'un clan vis-à-vis du suivi — docs/TODO/clan-archive.md §4.
 *
 * Module sans dépendance (ni Prisma client, ni API PUBG) : les routes et le cron qui n'ont
 * besoin que des constantes et des clauses l'importent sans tirer `clan-service`. Les
 * actions (archiver, réactiver) vivent dans `clan-archive.ts`.
 *
 * | État       | Condition                                  |
 * |------------|--------------------------------------------|
 * | actif      | `isActive = true`                          |
 * | en attente | `isActive = false` et `archivedAt` vide    |
 * | archivé    | `isActive = false` et `archivedAt` renseigné |
 */

export const CLAN_ARCHIVE_REASONS = {
  /** Le SuperUser a arrêté de suivre le clan. */
  unfollowed: 'unfollowed',
  /** La demande de création du clan a été refusée. */
  rejected: 'rejected',
} as const

/**
 * Posé sur les fiches désactivées par un arrêt de suivi, pour les distinguer de la purge du
 * parking (`ungrouped_inactive`) et d'un arrêt de suivi individuel (`archivedReason` vide).
 */
export const MEMBER_ARCHIVE_REASON_CLAN_UNFOLLOWED = 'clan_unfollowed'

export const CLAN_MEMBERS_DISPOSITIONS = ['ungrouped', 'deactivate'] as const
export type ClanMembersDisposition = (typeof CLAN_MEMBERS_DISPOSITIONS)[number]

export type ClanFollowState = 'active' | 'pending' | 'archived'

export function getClanFollowState(clan: { isActive: boolean; archivedAt: Date | string | null }): ClanFollowState {
  if (clan.isActive) return 'active'
  return clan.archivedAt ? 'archived' : 'pending'
}

/** Clan en attente de validation SuperUser : inactif, non système, non archivé. */
export const PENDING_CLAN_WHERE = {
  isActive: false,
  isSystem: false,
  archivedAt: null,
} satisfies Prisma.ClanWhereInput

export const ARCHIVED_CLAN_WHERE = {
  isActive: false,
  archivedAt: { not: null },
} satisfies Prisma.ClanWhereInput

export function formatClanLabel(clan: { name: string; tag: string }) {
  return clan.tag ? `[${clan.tag}] ${clan.name}` : clan.name
}

export type JoinTargetDecision = 'open' | 'reopen_rejected' | 'unfollowed'

/**
 * Ce que devient une demande `/join` visant un clan déjà connu du site.
 *
 * - Clan refusé : la demande le remet en attente de décision SuperUser. C'est ce que
 *   permettait la ré-adhésion d'un demandeur refusé tant que le refus laissait le clan dans
 *   la liste d'attente ; sans cette réouverture, la demande deviendrait invisible.
 * - Clan dont le suivi a été arrêté : refusée. Une demande de joueur ne défait pas une
 *   décision SuperUser ; la réactivation passe par le SuperUser.
 */
export function decideJoinTarget(clan: {
  archivedAt: Date | string | null
  archivedReason: string | null
}): JoinTargetDecision {
  if (!clan.archivedAt) return 'open'
  return clan.archivedReason === CLAN_ARCHIVE_REASONS.rejected ? 'reopen_rejected' : 'unfollowed'
}
