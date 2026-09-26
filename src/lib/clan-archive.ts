import { z } from 'zod'

import {
  CLAN_ARCHIVE_REASONS,
  CLAN_MEMBERS_DISPOSITIONS,
  MEMBER_ARCHIVE_REASON_CLAN_UNFOLLOWED,
  getClanFollowState,
  type ClanMembersDisposition,
} from '@/lib/clan-archive-state'
import {
  PLAYER_CLAN_CHANGE_SOURCES,
  PLAYER_CLAN_CHANGE_STATUSES,
  recordPlayerClanChange,
} from '@/lib/player-clan-change'
import { assignClanSubdomainSafely } from '@/lib/clan-subdomain-service'
import { prisma } from '@/lib/prisma'

/**
 * Arrêt de suivi d'un clan — docs/TODO/clan-archive.md.
 *
 * Un clan en attente de validation et un clan qu'on ne suit plus ont tous deux
 * `isActive = false` : seul `archivedAt` les distingue. Sans cette distinction, un clan
 * archivé réapparaissait dans « Clans en attente », où un clic sur « Valider » l'aurait
 * remis en service.
 *
 * On n'efface jamais un clan, même vide : `ClanEncounter`, `EncounteredPlayer`, `KillEvent`…
 * sont en `onDelete: Cascade` et partiraient avec lui.
 */

/**
 * Corps de `PATCH /api/settings/clans/[id]`. Une action ou un sort des membres inconnus
 * échouent à la validation (400) : aucun choix par défaut silencieux.
 */
export const ClanFollowActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('archive'),
    membersDisposition: z.enum(CLAN_MEMBERS_DISPOSITIONS).optional(),
  }),
  z.object({ action: z.literal('reactivate') }),
])

export type ClanFollowErrorCode =
  | 'clan_not_found'
  | 'system_clan'
  | 'clan_pending'
  | 'disposition_required'
  | 'state_changed'

export class ClanFollowError extends Error {
  constructor(
    readonly code: ClanFollowErrorCode,
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ClanFollowError'
  }
}

type ClanIdentity = { id: number; name: string; tag: string }


// ------------------------------------------------------------------ Lecture

/** Ce que la boîte de dialogue doit savoir avant de proposer l'arrêt de suivi. */
export async function getClanFollowSummary(clanId: number) {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: {
      id: true,
      name: true,
      tag: true,
      platformShard: true,
      isActive: true,
      isSystem: true,
      archivedAt: true,
      archivedReason: true,
    },
  })
  if (!clan) return null

  const activeMembers = await prisma.clanMember.count({ where: { clanId, isActive: true } })

  return {
    clan: {
      ...clan,
      archivedAt: clan.archivedAt?.toISOString() ?? null,
      state: getClanFollowState(clan),
    },
    activeMembers,
  }
}

// ------------------------------------------------------------------ Archivage

export type ArchiveClanResult = {
  outcome: 'archived' | 'already_archived'
  clan: ClanIdentity
  membersMoved: number
  membersDeactivated: number
}

/**
 * Arrête le suivi d'un clan actif.
 *
 * Un clan vide s'archive sans autre question. Un clan avec des membres actifs exige de
 * choisir leur sort : `ungrouped` (vers le clan technique de leur shard, mouvement journalisé
 * `manual_demotion`) ou `deactivate` (fiches désactivées, motif `clan_unfollowed`).
 *
 * Le miroir adversaire (`Player.opponentClanId`) n'est volontairement PAS resynchronisé : le
 * clan PUBG de ces joueurs n'a pas changé, seul le site a cessé de le suivre.
 */
export async function archiveClan(
  clanId: number,
  membersDisposition: ClanMembersDisposition | undefined,
  context: { triggeredByUserId: number | null; now?: Date }
): Promise<ArchiveClanResult> {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { id: true, name: true, tag: true, pubgClanId: true, isActive: true, isSystem: true, archivedAt: true },
  })

  if (!clan) throw new ClanFollowError('clan_not_found', 404, 'Clan introuvable.')
  const identity: ClanIdentity = { id: clan.id, name: clan.name, tag: clan.tag }

  if (clan.isSystem) {
    throw new ClanFollowError('system_clan', 400, 'Le clan technique du site ne peut pas être archivé.')
  }
  // Idempotence : un double clic ou un second onglet ne réécrit rien.
  if (clan.archivedAt) {
    return { outcome: 'already_archived', clan: identity, membersMoved: 0, membersDeactivated: 0 }
  }
  if (!clan.isActive) {
    throw new ClanFollowError(
      'clan_pending',
      409,
      'Ce clan est en attente de validation : refusez sa demande depuis le cycle de vie des clans.'
    )
  }

  const members = await prisma.clanMember.findMany({
    where: { clanId, isActive: true },
    select: { id: true, pubgAccountId: true, platformShard: true },
    orderBy: { id: 'asc' },
  })

  if (members.length > 0 && !membersDisposition) {
    throw new ClanFollowError(
      'disposition_required',
      400,
      `Ce clan compte ${members.length} membre(s) actif(s) : choisissez de les déplacer vers le parking ou de les désactiver.`
    )
  }

  // Résolu AVANT la transaction : getOrCreateUngroupedClan passe par le client global, pas
  // par celui de la transaction. Import à la demande : `clan-service` tire l'API PUBG et le
  // calcul des statistiques, inutiles aux autres fonctions de ce module (comme la route
  // `track`, qui l'importe de la même façon).
  const ungroupedByShard = new Map<string, { id: number; tag: string }>()
  if (members.length > 0 && membersDisposition === 'ungrouped') {
    const { getOrCreateUngroupedClan } = await import('@/lib/clan-service')
    for (const shard of new Set(members.map((member) => member.platformShard))) {
      const ungrouped = await getOrCreateUngroupedClan(shard)
      ungroupedByShard.set(shard, { id: ungrouped.id, tag: ungrouped.tag })
    }
  }

  const now = context.now ?? new Date()

  await prisma.$transaction(
    async (tx) => {
      // L'état du clan, le sort des membres et le journal forment un seul fait.
      const { count } = await tx.clan.updateMany({
        where: { id: clanId, isActive: true, archivedAt: null },
        data: { isActive: false, archivedAt: now, archivedReason: CLAN_ARCHIVE_REASONS.unfollowed },
      })
      if (count === 0) {
        throw new ClanFollowError('state_changed', 409, 'L’état du clan a changé pendant l’opération : rechargez la page.')
      }

      if (members.length === 0) return

      if (membersDisposition === 'deactivate') {
        await tx.clanMember.updateMany({
          where: { id: { in: members.map((member) => member.id) } },
          data: { isActive: false, archivedAt: now, archivedReason: MEMBER_ARCHIVE_REASON_CLAN_UNFOLLOWED },
        })
        return
      }

      for (const [shard, ungrouped] of ungroupedByShard) {
        await tx.clanMember.updateMany({
          where: { id: { in: members.filter((member) => member.platformShard === shard).map((member) => member.id) } },
          data: { clanId: ungrouped.id },
        })
      }

      for (const member of members) {
        const ungrouped = ungroupedByShard.get(member.platformShard)
        if (!ungrouped) continue
        await recordPlayerClanChange(tx, {
          clanMemberId: member.id,
          pubgAccountId: member.pubgAccountId,
          platformShard: member.platformShard,
          previousClanId: clan.id,
          previousPubgClanId: clan.pubgClanId,
          previousPubgClanTag: clan.tag,
          newClanId: ungrouped.id,
          newPubgClanTag: ungrouped.tag,
          source: PLAYER_CLAN_CHANGE_SOURCES.manualDemotion,
          status: PLAYER_CLAN_CHANGE_STATUSES.applied,
          triggeredByUserId: context.triggeredByUserId,
        })
      }
    },
    // Une écriture de journal par membre : le délai par défaut (5 s) est court pour un gros
    // clan quand la base est distante.
    { timeout: 30_000 }
  )

  return {
    outcome: 'archived',
    clan: identity,
    membersMoved: membersDisposition === 'ungrouped' ? members.length : 0,
    membersDeactivated: membersDisposition === 'deactivate' ? members.length : 0,
  }
}

// ------------------------------------------------------------------ Réactivation

export type ReactivateClanResult = {
  outcome: 'reactivated' | 'already_active'
  clan: ClanIdentity
}

/**
 * Remet un clan archivé en service. Les anciens membres ne sont PAS réintégrés : ceux du
 * parking le seront par le cycle de vie s'ils sont toujours dans le clan PUBG, les fiches
 * désactivées se réactivent à la main depuis l'annuaire des joueurs.
 */
export async function reactivateClan(clanId: number): Promise<ReactivateClanResult> {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { id: true, name: true, tag: true, isActive: true, archivedAt: true },
  })

  if (!clan) throw new ClanFollowError('clan_not_found', 404, 'Clan introuvable.')
  const identity: ClanIdentity = { id: clan.id, name: clan.name, tag: clan.tag }

  if (clan.isActive) return { outcome: 'already_active', clan: identity }
  if (!clan.archivedAt) {
    throw new ClanFollowError(
      'clan_pending',
      409,
      'Ce clan est en attente de validation : validez-le depuis le cycle de vie des clans.'
    )
  }

  const { count } = await prisma.clan.updateMany({
    where: { id: clanId, isActive: false, archivedAt: { not: null } },
    data: { isActive: true, archivedAt: null, archivedReason: null },
  })
  if (count === 0) {
    throw new ClanFollowError('state_changed', 409, 'L’état du clan a changé pendant l’opération : rechargez la page.')
  }

  // Le sous-domaine conservé pendant l'arrêt de suivi redevient actif ; un clan qui n'en avait pas en reçoit un.
  await assignClanSubdomainSafely(clanId, 'réactivation')
  return { outcome: 'reactivated', clan: identity }
}

// ------------------------------------------------------------------ Demandes /join

/** Renvoie `true` si le clan était bien refusé et repasse en attente. */
export async function reopenRejectedClan(clanId: number) {
  const { count } = await prisma.clan.updateMany({
    where: { id: clanId, isActive: false, archivedReason: CLAN_ARCHIVE_REASONS.rejected },
    data: { archivedAt: null, archivedReason: null },
  })
  return count > 0
}
