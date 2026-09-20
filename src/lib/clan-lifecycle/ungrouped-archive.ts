import { prisma } from '@/lib/prisma'
import { getUngroupedArchiveAfterDays } from '@/lib/clan-lifecycle/config'

/**
 * Purge du clan technique — chantier 5.
 *
 * Le parking ne se vide jamais tout seul : depuis que l'arrêt de suivi est réservé
 * au SuperUser et que le cron y bascule automatiquement, tout joueur qui quitte un
 * clan y atterrit et **y reste synchronisé**. Chaque membre du parking coûte un
 * appel PUBG par jour, plus sa synchronisation de matchs.
 *
 * D'où l'archivage : au-delà d'un seuil d'inactivité, un membre du parking devient
 * candidat. Le cron **marque**, le SuperUser **décide** — sauf si l'archivage
 * automatique est explicitement activé.
 */

export const ARCHIVE_REASON_UNGROUPED_INACTIVE = 'ungrouped_inactive'

export type ArchiveCandidate = {
  memberId: number
  displayName: string
  pubgPlayerName: string
  platformShard: string
  lastMatchAt: Date | null
  inactiveDays: number | null
  /** Date à laquelle le membre est (ou sera) éligible à l'archivage. */
  eligibleAt: Date | null
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Effectif du parking, trié du plus inactif au plus récent.
 *
 * `eligibleAt` est calculé ici plutôt qu'en base pour que l'UI puisse rejouer le
 * calcul avec un autre seuil et montrer qui basculerait, **avant** d'enregistrer.
 */
export async function listUngroupedMembers(options: { thresholdDays?: number } = {}) {
  const thresholdDays = options.thresholdDays ?? (await getUngroupedArchiveAfterDays())
  const now = new Date()

  const members = await prisma.clanMember.findMany({
    where: {
      isActive: true,
      joinStatus: 'active',
      clan: { is: { isSystem: true } },
    },
    select: {
      id: true,
      displayName: true,
      pubgPlayerName: true,
      platformShard: true,
      lastMatchAt: true,
    },
    orderBy: [{ lastMatchAt: 'asc' }, { id: 'asc' }],
  })

  const candidates: ArchiveCandidate[] = members.map((member) => {
    const inactiveDays = member.lastMatchAt ? daysBetween(member.lastMatchAt, now) : null
    const eligibleAt = member.lastMatchAt
      ? new Date(member.lastMatchAt.getTime() + thresholdDays * 86_400_000)
      : null

    return {
      memberId: member.id,
      displayName: member.displayName,
      pubgPlayerName: member.pubgPlayerName,
      platformShard: member.platformShard,
      lastMatchAt: member.lastMatchAt,
      inactiveDays,
      eligibleAt,
    }
  })

  return { thresholdDays, members: candidates, now }
}

/**
 * Candidats à l'archivage : inactifs au-delà du seuil.
 *
 * Un membre **sans aucun match connu** est inclus : il n'a jamais joué depuis qu'il
 * est suivi, c'est le cas le plus coûteux et le moins utile à garder actif.
 */
export function selectArchiveCandidates(
  members: ArchiveCandidate[],
  thresholdDays: number
): ArchiveCandidate[] {
  return members.filter(
    (member) => member.inactiveDays === null || member.inactiveDays >= thresholdDays
  )
}

export async function listArchiveCandidates(options: { thresholdDays?: number } = {}) {
  const { thresholdDays, members } = await listUngroupedMembers(options)
  return { thresholdDays, candidates: selectArchiveCandidates(members, thresholdDays) }
}

/**
 * Archive des membres du parking.
 *
 * `isActive: false` coupe la synchronisation de matchs **et** l'appel de promotion
 * quotidien — c'est tout le mécanisme de maîtrise du coût API. `archivedReason`
 * distingue cette purge d'un arrêt de suivi ordinaire, qui pose le même `isActive`.
 *
 * Idempotent : un membre déjà archivé n'est pas recompté.
 */
export async function archiveMembers(memberIds: number[], triggeredByUserId?: number | null) {
  if (memberIds.length === 0) {
    return { archived: 0 }
  }

  // On ne touche qu'aux membres reellement dans un clan systeme : un identifiant
  // errant ne doit pas permettre d'archiver un membre d'un clan suivi.
  const eligible = await prisma.clanMember.findMany({
    where: {
      id: { in: memberIds },
      isActive: true,
      clan: { is: { isSystem: true } },
    },
    select: { id: true },
  })

  if (eligible.length === 0) {
    return { archived: 0 }
  }

  const result = await prisma.clanMember.updateMany({
    where: { id: { in: eligible.map((m) => m.id) } },
    data: {
      isActive: false,
      archivedAt: new Date(),
      archivedReason: ARCHIVE_REASON_UNGROUPED_INACTIVE,
    },
  })

  console.info(
    `[ClanLifecycle] ${result.count} membre(s) du parking archive(s)` +
      (triggeredByUserId ? ` par l'utilisateur ${triggeredByUserId}` : ' automatiquement')
  )

  return { archived: result.count }
}

/**
 * Réactive un membre archivé : il repart du parking, actif et suivi.
 * Ne réactive que ce que l'archivage a désactivé — un arrêt de suivi ordinaire
 * (sans `archivedReason`) n'est pas concerné.
 */
export async function reactivateArchivedMember(memberId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { id: true, isActive: true, archivedReason: true },
  })

  if (!member || member.isActive || member.archivedReason === null) {
    return { reactivated: false }
  }

  await prisma.clanMember.update({
    where: { id: memberId },
    data: { isActive: true, archivedAt: null, archivedReason: null },
  })

  return { reactivated: true }
}
