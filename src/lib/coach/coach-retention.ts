import { prisma } from '@/lib/prisma'

/**
 * Conservation de l'historique du Coach IA (docs/TODO/chatbot-ia.md §4.3), appliquée par la maintenance de 01:15
 * (`runDbMaintenance`, `src/lib/cron-jobs.ts`) : un fil inactif depuis 12 mois est supprimé avec ses messages (cascade
 * en base) ; les lignes d'usage vivent un mois de plus, pour comparer un mois au même mois de l'année précédente.
 */

export const COACH_CONVERSATION_RETENTION_DAYS = 365
export const COACH_USAGE_RETENTION_DAYS = 395

const DAY_MS = 24 * 60 * 60 * 1000

export type CoachPurgeResult = { conversations: number; usages: number }

export async function purgeExpiredCoachHistory(now: Date = new Date()): Promise<CoachPurgeResult> {
  const conversationsBefore = new Date(now.getTime() - COACH_CONVERSATION_RETENTION_DAYS * DAY_MS)
  const usagesBefore = new Date(now.getTime() - COACH_USAGE_RETENTION_DAYS * DAY_MS)
  const conversations = await prisma.coachConversation.deleteMany({ where: { updatedAt: { lt: conversationsBefore } } })
  const usages = await prisma.coachUsage.deleteMany({ where: { createdAt: { lt: usagesBefore } } })
  return { conversations: conversations.count, usages: usages.count }
}

export type CoachPlayerPurgeResult = CoachPurgeResult & {
  /** Comptes liés au pseudo (par `MemberIdentity`) et fiches de membre à ce pseudo. */
  userIds: number[]
  memberIds: number[]
}

/**
 * Demande « Purger mon historique » (docs/features/pages-legales.md §3, docs/TODO/chatbot-ia.md §4.3) : fils, messages
 * (cascade) et lignes d'usage du Coach IA de tous les comptes liés à ce pseudo PUBG, plus les fils rattachés à ses
 * fiches de membre. Sans `apply`, compte seulement — c'est la simulation de `scripts/purge-coach-history.ts`.
 */
export async function purgeCoachHistoryForPubgName(pubgName: string, options: { apply: boolean }): Promise<CoachPlayerPurgeResult> {
  const members = await prisma.clanMember.findMany({
    where: { pubgPlayerName: pubgName.trim() },
    select: { id: true, identities: { select: { userId: true } } },
  })
  const memberIds = members.map((member) => member.id)
  const userIds = [...new Set(members.flatMap((member) => member.identities.map((identity) => identity.userId)))]
  if (memberIds.length === 0 && userIds.length === 0) return { conversations: 0, usages: 0, userIds, memberIds }

  const conversationsWhere = { OR: [{ userId: { in: userIds } }, { memberId: { in: memberIds } }] }
  const usagesWhere = { userId: { in: userIds } }
  if (!options.apply) {
    const [conversations, usages] = await Promise.all([
      prisma.coachConversation.count({ where: conversationsWhere }),
      prisma.coachUsage.count({ where: usagesWhere }),
    ])
    return { conversations, usages, userIds, memberIds }
  }
  const conversations = await prisma.coachConversation.deleteMany({ where: conversationsWhere })
  const usages = await prisma.coachUsage.deleteMany({ where: usagesWhere })
  return { conversations: conversations.count, usages: usages.count, userIds, memberIds }
}
