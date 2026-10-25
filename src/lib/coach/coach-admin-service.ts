import 'server-only'

import {
  buildCoachUsageReport,
  coachToolNames,
  groupCoachQuestions,
  questionBefore,
  type CoachAdminState,
  type CoachModelTestResult,
  type CoachQuestionsReport,
  type CoachUsageReport,
} from '@/lib/coach/coach-admin-report'
import { COACH_SETTING_BOUNDS, COACH_SETTING_DEFAULTS, getCoachSettings, hasCoachApiKey } from '@/lib/coach/coach-config'
import { coachCostMicroUsd, microUsdToEur } from '@/lib/coach/coach-cost'
import { getCoachModel } from '@/lib/coach/coach-models'
import { CoachProviderError, type CoachModelProvider } from '@/lib/coach/coach-provider'
import { createGeminiProvider } from '@/lib/coach/coach-provider-gemini'
import { completeCoachUsage, parisMonthBounds, reserveCoachUsage } from '@/lib/coach/coach-quota'
import { prisma } from '@/lib/prisma'

/**
 * Page SuperUser `/settings/coach` (docs/TODO/chatbot-ia.md §9) : état des réglages, rapport de consommation du mois,
 * questions à relire, test d'un modèle. Lectures Prisma ici, construction pure dans `coach-admin-report.ts`.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export async function getCoachAdminState(): Promise<CoachAdminState> {
  return { settings: await getCoachSettings(), apiKeyPresent: hasCoachApiKey(), defaults: COACH_SETTING_DEFAULTS, bounds: COACH_SETTING_BOUNDS }
}

export async function readCoachUsageReport(now: Date = new Date()): Promise<CoachUsageReport> {
  const settings = await getCoachSettings()
  const period = parisMonthBounds(now)
  const [rows, errorsLast24h] = await Promise.all([
    prisma.coachUsage.findMany({
      where: { createdAt: { gte: period.start, lt: period.end } },
      select: { userId: true, model: true, status: true, tokensIn: true, tokensOut: true, costMicroUsd: true, createdAt: true },
    }),
    prisma.coachUsage.count({ where: { status: 'error', createdAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
  ])
  const userIds = [...new Set(rows.map((row) => row.userId))]
  const accounts =
    userIds.length > 0
      ? await prisma.userAccount.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            email: true,
            displayName: true,
            identities: { select: { member: { select: { pubgPlayerName: true } } }, orderBy: { isPrimary: 'desc' }, take: 1 },
          },
        })
      : []
  const accountLabels = new Map(accounts.map((account) => [account.id, account.identities[0]?.member.pubgPlayerName ?? account.displayName ?? account.email]))
  return buildCoachUsageReport({ rows, settings, period, accountLabels, errorsLast24h })
}

/** Fenêtre des questions fréquentes et des votes. */
export const COACH_QUESTIONS_DAYS = 30
/** Votes « Inexact » affichés à la fois ; les plus récents d'abord. */
export const COACH_INACCURATE_LIMIT = 50

export async function readCoachQuestionsReport(now: Date = new Date()): Promise<CoachQuestionsReport> {
  const since = new Date(now.getTime() - COACH_QUESTIONS_DAYS * DAY_MS)
  const [userMessages, helpful, inaccurate, pendingReview, answers] = await Promise.all([
    prisma.coachMessage.findMany({ where: { role: 'user', createdAt: { gte: since } }, select: { content: true }, orderBy: { createdAt: 'desc' }, take: 5000 }),
    prisma.coachMessage.count({ where: { feedbackScore: 1, createdAt: { gte: since } } }),
    prisma.coachMessage.count({ where: { feedbackScore: -1, createdAt: { gte: since } } }),
    prisma.coachMessage.count({ where: { feedbackScore: -1, reviewedAt: null } }),
    prisma.coachMessage.findMany({
      where: { feedbackScore: -1, reviewedAt: null },
      orderBy: { createdAt: 'desc' },
      take: COACH_INACCURATE_LIMIT,
      select: {
        id: true,
        conversationId: true,
        content: true,
        toolCalls: true,
        feedbackNote: true,
        unverified: true,
        createdAt: true,
        conversation: { select: { contextLabel: true, clan: { select: { tag: true } } } },
      },
    }),
  ])
  const conversationIds = [...new Set(answers.map((answer) => answer.conversationId))]
  const questions =
    conversationIds.length > 0
      ? await prisma.coachMessage.findMany({ where: { conversationId: { in: conversationIds }, role: 'user' }, select: { id: true, conversationId: true, content: true } })
      : []
  return {
    days: COACH_QUESTIONS_DAYS,
    frequent: groupCoachQuestions(userMessages),
    votes: { helpful, inaccurate, pendingReview },
    inaccurate: answers.map((answer) => ({
      messageId: answer.id,
      conversationId: answer.conversationId,
      createdAt: answer.createdAt.toISOString(),
      clanTag: answer.conversation.clan?.tag ?? null,
      contextLabel: answer.conversation.contextLabel,
      question: questionBefore(answer, questions),
      note: answer.feedbackNote,
      answer: answer.content,
      tools: coachToolNames(answer.toolCalls),
      unverified: answer.unverified,
    })),
  }
}

/** Marque un vote « Inexact » comme relu ; faux si le message n'est pas un vote « Inexact » en attente. */
export async function markCoachMessageReviewed(id: number, now: Date = new Date()): Promise<boolean> {
  const result = await prisma.coachMessage.updateMany({ where: { id, feedbackScore: -1, reviewedAt: null }, data: { reviewedAt: now } })
  return result.count > 0
}

/**
 * Précision d'un vote « Inexact » réécrite par le SuperUser (2026-10-25) : la note du joueur est souvent vague
 * (« la réponse n'est pas juste ») et la relecture la complète en une phrase. Remplace le texte en place (journalisé
 * par la route) ; vide = retirée. Faux si le message n'est pas un vote « Inexact ».
 */
export async function updateCoachFeedbackNote(id: number, note: string | null): Promise<boolean> {
  const result = await prisma.coachMessage.updateMany({ where: { id, feedbackScore: -1 }, data: { feedbackNote: note } })
  return result.count > 0
}

const TEST_TOOL = { name: 'getTestCode', description: 'Renvoie le code de test du jour. À appeler avant de répondre.', parameters: { type: 'object', properties: {} } }
const TEST_SYSTEM =
  'Tu es un assistant de test. Pour répondre, appelle d’abord l’outil getTestCode, puis réponds uniquement par le code qu’il te renvoie, sans autre texte. Sans l’outil, tu ne connais pas ce code.'
const TEST_QUESTION = 'Quel est le code de test ?'
const TEST_TIMEOUT_MS = 30_000

/**
 * Bouton « Tester » d'une tuile de modèle : une question minuscule avec un outil, pour vérifier l'accès, la durée et
 * l'appel d'outil. L'appel est facturé et compté comme une question du SuperUser (plafond global compris).
 */
export async function testCoachModel(input: { modelId: string; userId: number; now?: Date; provider?: CoachModelProvider }): Promise<CoachModelTestResult> {
  const now = input.now ?? new Date()
  const model = getCoachModel(input.modelId)
  if (!model) return { ok: false, model: input.modelId, durationMs: 0, code: 'unknown_model', message: 'Modèle inconnu du catalogue.' }
  if (!hasCoachApiKey()) return { ok: false, model: model.id, durationMs: 0, code: 'no_api_key', message: 'GEMINI_API_KEY absente du .env du serveur.' }

  const settings = await getCoachSettings()
  const code = String(1000 + Math.floor(Math.random() * 9000))
  const provider = input.provider ?? createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY ?? '' })
  const usageId = await reserveCoachUsage({ userId: input.userId, clanId: null, conversationId: null, model: model.id })
  const startedAt = Date.now()
  try {
    const answer = await provider.streamAnswer({
      model,
      system: TEST_SYSTEM,
      history: [],
      question: TEST_QUESTION,
      tools: [TEST_TOOL],
      runTool: async () => ({ code }),
      maxToolRounds: 2,
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
    const durationMs = Date.now() - startedAt
    const costMicroUsd = coachCostMicroUsd(model, answer.tokensIn, answer.tokensOut, now)
    await completeCoachUsage(usageId, { status: 'ok', tokensIn: answer.tokensIn, tokensOut: answer.tokensOut, costMicroUsd })
    const toolCalled = answer.toolCalls.some((call) => call.name === TEST_TOOL.name)
    return {
      ok: true,
      model: model.id,
      durationMs,
      toolCalled,
      codeReturned: answer.text.includes(code),
      invented: !toolCalled && /\d{3,}/.test(answer.text),
      tokensIn: answer.tokensIn,
      tokensOut: answer.tokensOut,
      costEur: microUsdToEur(costMicroUsd, settings.usdEurRate),
      answer: answer.text.trim().slice(0, 200),
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    await completeCoachUsage(usageId, { status: 'error', tokensIn: 0, tokensOut: 0, costMicroUsd: 0 }).catch(() => undefined)
    if (error instanceof CoachProviderError) {
      return { ok: false, model: model.id, durationMs, code: error.code, message: error.status ? `${error.status} — ${error.message}` : error.message }
    }
    return { ok: false, model: model.id, durationMs, code: 'internal', message: error instanceof Error ? error.message : 'Erreur inconnue' }
  }
}
