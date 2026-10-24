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
