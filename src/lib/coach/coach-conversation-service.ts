import { prisma } from '@/lib/prisma'

/**
 * Fils du Coach IA (docs/TODO/chatbot-ia.md §7.1) : **données personnelles** — seul le compte propriétaire (et le
 * SuperUser en lecture) y accède ; un membre du même clan n'y voit rien. Les routes passent toujours par ces fonctions,
 * qui portent la condition de propriété dans la requête.
 */

export const COACH_CONVERSATION_TITLE_MAX = 120
export const COACH_CONVERSATIONS_LIST_MAX = 50
export const COACH_FEEDBACK_NOTE_MAX = 280

export type CoachReader = { userId: number; isSuperUser: boolean }

/** Titre d'un fil à partir de sa première question : une ligne, espaces repliés, 120 caractères au plus. */
export function coachConversationTitle(firstQuestion: string): string {
  const collapsed = firstQuestion.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= COACH_CONVERSATION_TITLE_MAX) return collapsed || 'Nouveau fil'
  return `${collapsed.slice(0, COACH_CONVERSATION_TITLE_MAX - 1).trimEnd()}…`
}

export type CoachConversationSummary = {
  id: number
  title: string
  contextLabel: string | null
  clanId: number | null
  createdAt: string
  updatedAt: string
}

export async function listCoachConversations(userId: number): Promise<CoachConversationSummary[]> {
  const rows = await prisma.coachConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: COACH_CONVERSATIONS_LIST_MAX,
    select: { id: true, title: true, contextLabel: true, clanId: true, createdAt: true, updatedAt: true },
  })
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))
}

export type CoachMessageView = {
  id: number
  role: 'user' | 'assistant'
  content: string
  /** Noms des outils appelés pour cette réponse (le détail reste en base, pour l'audit). */
  tools: string[]
  unverified: boolean
  feedbackScore: number | null
  createdAt: string
}

export type CoachConversationView = CoachConversationSummary & { messages: CoachMessageView[] }

function ownerWhere(id: number, reader: CoachReader) {
  return reader.isSuperUser ? { id } : { id, userId: reader.userId }
}

function toolNames(toolCalls: unknown): string[] {
  if (!Array.isArray(toolCalls)) return []
  return toolCalls
    .map((call) => (call && typeof call === 'object' && typeof (call as { name?: unknown }).name === 'string' ? (call as { name: string }).name : null))
    .filter((name): name is string => name !== null)
}

export async function getCoachConversation(id: number, reader: CoachReader): Promise<CoachConversationView | null> {
  const row = await prisma.coachConversation.findFirst({
    where: ownerWhere(id, reader),
    select: {
      id: true,
      title: true,
      contextLabel: true,
      clanId: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, toolCalls: true, unverified: true, feedbackScore: true, createdAt: true },
      },
    },
  })
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    contextLabel: row.contextLabel,
    clanId: row.clanId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messages: row.messages.map((message) => ({
      id: message.id,
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
      tools: toolNames(message.toolCalls),
      unverified: message.unverified,
      feedbackScore: message.feedbackScore,
      createdAt: message.createdAt.toISOString(),
    })),
  }
}

/** Renomme un fil du compte ; `false` si le fil n'est pas à lui. */
export async function renameCoachConversation(id: number, userId: number, title: string): Promise<boolean> {
  const result = await prisma.coachConversation.updateMany({ where: { id, userId }, data: { title: coachConversationTitle(title) } })
  return result.count > 0
}

/** Supprime un fil du compte (messages en cascade ; les lignes d'usage restent) ; `false` si le fil n'est pas à lui. */
export async function deleteCoachConversation(id: number, userId: number): Promise<boolean> {
  const result = await prisma.coachConversation.deleteMany({ where: { id, userId } })
  return result.count > 0
}

/** Vote Utile (+1) / Inexact (-1) ou retrait (null) sur une réponse du compte, avec précision facultative. */
export async function setCoachMessageFeedback(
  messageId: number,
  userId: number,
  score: 1 | -1 | null,
  note: string | null
): Promise<boolean> {
  const result = await prisma.coachMessage.updateMany({
    where: { id: messageId, role: 'assistant', conversation: { userId } },
    data: { feedbackScore: score, feedbackNote: score === -1 && note ? note.slice(0, COACH_FEEDBACK_NOTE_MAX) : null, reviewedAt: null },
  })
  return result.count > 0
}
