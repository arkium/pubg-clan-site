import type { AuthSessionContext } from '@/lib/auth-session'
import { notifyCoachBudgetIfNeeded, notifyCoachProviderErrorsIfNeeded } from '@/lib/coach/coach-alerts'
import { getCoachSettings, type CoachSettings } from '@/lib/coach/coach-config'
import { coachContextLabel, coachContextPromptBlock, coachSuggestions } from '@/lib/coach/coach-context'
import { resolveCoachContext } from '@/lib/coach/coach-context-service'
import { coachConversationTitle } from '@/lib/coach/coach-conversation-service'
import { coachCostMicroUsd } from '@/lib/coach/coach-cost'
import { COACH_MEMORY_TOOL_NAME, coachMemoryPromptBlock } from '@/lib/coach/coach-memory'
import { createCoachMemoryTool, listCoachMemories } from '@/lib/coach/coach-memory-service'
import { COACH_DEFAULT_MODEL_ID, getCoachModel } from '@/lib/coach/coach-models'
import { buildCoachSystemPrompt } from '@/lib/coach/coach-prompt'
import { CoachProviderError, type CoachHistoryMessage, type CoachModelProvider, type CoachToolCall } from '@/lib/coach/coach-provider'
import { createGeminiProvider } from '@/lib/coach/coach-provider-gemini'
import { checkCoachQuota, completeCoachUsage, parisMonthBounds, reserveCoachUsage, type CoachQuotaDecision } from '@/lib/coach/coach-quota'
import { coachRulesPromptBlock } from '@/lib/coach/coach-rules'
import { activeCoachRuleTexts } from '@/lib/coach/coach-rules-service'
import { createCoachTools, type CoachToolScope } from '@/lib/coach/coach-tools'
import { prisma } from '@/lib/prisma'

/**
 * Une question au Coach IA, de bout en bout (docs/TODO/chatbot-ia.md §7.2) : quota, fil, contexte vérifié,
 * réservation de l'usage, appel du modèle en flux, enregistrement — même interrompu — et facturation. La route ne
 * fait que la garde, la lecture du corps et le transport SSE ; tout ce qui se teste est ici.
 */

export type CoachChatRefusal =
  | { status: 400; error: 'invalid_body'; message: string }
  | { status: 404; error: 'conversation_not_found' }
  | { status: 429; error: 'too_fast' | 'hourly_limit' | 'monthly_budget' | 'global_budget'; retryAt: string | null }
  | { status: 503; error: 'coach_paused' }

export type CoachSseEvent =
  | { event: 'meta'; data: { conversationId: number; questionId: number; context: { label: string | null; suggestions: string[] } } }
  | { event: 'tool'; data: { name: string; label: string } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { messageId: number | null; unverified: boolean; remainingHour: number | null; monthPercent: number | null; finishReason: string | null } }
  | { event: 'error'; data: { code: string; message: string } }

export type CoachChatBody = { conversationId: number | null; contextPath: string | null; message: string }

/** En-têtes du flux : pas de mise en tampon par Nginx (`X-Accel-Buffering`), pas de compression (`no-transform`). */
export const COACH_SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
} as const

export function encodeCoachSseEvent(event: CoachSseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
}

/** Libellés des outils pour la ligne « Je consulte… » du tiroir. */
export const COACH_TOOL_LABELS: Record<string, string> = {
  getRecentMatches: 'Je consulte tes parties…',
  getMatchDebrief: 'Je relis le match…',
  getWeaponStats: 'Je regarde tes armes…',
  getOpponentRecord: 'Je cherche les rencontres du clan…',
  getDropZones: 'Je compte les largages du clan…',
  getClanLeaderboard: 'Je lis le classement du clan…',
  getLeagueStanding: 'Je consulte la Ligue des clans…',
  getTournaments: 'Je cherche les tournois…',
  getTournamentResults: 'Je lis le classement du tournoi…',
  getItemUsage: 'Je regarde tes objets consommés…',
  getMapPerformance: 'Je compare les cartes du clan…',
  getPlaySchedule: 'Je regarde quand tu joues…',
  getPlayerBenchmark: 'Je te situe parmi les joueurs du site…',
  getCareerStats: 'Je lis ta carrière PUBG…',
  getClanPlaystyle: 'Je regarde le style de jeu du clan…',
  [COACH_MEMORY_TOOL_NAME]: 'Je note ce que tu me dis…',
}

/**
 * Blocs du prompt ouverts par les interrupteurs (lots 10 et 11) : vides quand ils sont fermés — le prompt est alors
 * exactement celui d'avant. Une base injoignable rend des blocs vides : la réponse part sans eux, jamais en erreur.
 */
export async function loadCoachPromptBlocks(settings: Pick<CoachSettings, 'rulesEnabled' | 'memoryEnabled'>, userId: number, now: Date): Promise<{ rulesBlock: string; memoryBlock: string }> {
  const [rulesBlock, memoryBlock] = await Promise.all([
    settings.rulesEnabled ? activeCoachRuleTexts(now.getTime()).then(coachRulesPromptBlock) : Promise.resolve(''),
    settings.memoryEnabled
      ? listCoachMemories(userId, now)
          .then(coachMemoryPromptBlock)
          .catch((error: unknown) => {
            console.error('[coach] Mémoire illisible, réponse sans elle :', error)
            return coachMemoryPromptBlock([])
          })
      : Promise.resolve(''),
  ])
  return { rulesBlock, memoryBlock }
}

/** Lecture stricte du corps d'une question : rien d'autre n'entre. */
export function parseCoachChatBody(body: unknown, maxInputChars: number): CoachChatBody | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Corps JSON attendu.' }
  const { conversationId, contextPath, message } = body as Record<string, unknown>
  if (typeof message !== 'string' || message.trim().length === 0) return { error: 'Pose une question.' }
  if (message.length > maxInputChars) return { error: `La question dépasse ${maxInputChars} caractères.` }
  if (conversationId !== undefined && conversationId !== null && !(Number.isInteger(conversationId) && (conversationId as number) > 0)) {
    return { error: 'Identifiant de fil invalide.' }
  }
  if (contextPath !== undefined && contextPath !== null && (typeof contextPath !== 'string' || contextPath.length > 512)) {
    return { error: 'Contexte de page invalide.' }
  }
  return {
    conversationId: typeof conversationId === 'number' ? conversationId : null,
    contextPath: typeof contextPath === 'string' ? contextPath : null,
    message: message.trim(),
  }
}

/** Chiffres dans la réponse sans aucun appel d'outil : le modèle a parlé de mémoire (§6, essai du lot 0). */
export function isUnverifiedAnswer(text: string, toolCalls: readonly CoachToolCall[]): boolean {
  return toolCalls.length === 0 && /\d/.test(text)
}

function quotaRefusal(decision: CoachQuotaDecision): CoachChatRefusal | null {
  if (decision.allowed) return null
  if (decision.reason === 'coach_paused') return { status: 503, error: 'coach_paused' }
  return { status: 429, error: decision.reason, retryAt: decision.retryAt ? decision.retryAt.toISOString() : null }
}

export type CoachChatScope = CoachToolScope & { playerName: string; clanTag: string; clanName: string }

/** Membre actif de la session dans ce clan ; le SuperUser sans membre interroge le clan « de l'extérieur ». */
export async function loadCoachChatScope(session: AuthSessionContext, clanId: number): Promise<CoachChatScope> {
  const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { tag: true, name: true } })
  const member = session.activeMemberId
    ? await prisma.clanMember.findFirst({ where: { id: session.activeMemberId, clanId }, select: { id: true, displayName: true } })
    : null
  const playerName = member?.displayName ?? (session.isSuperUser ? 'SuperUser' : 'Joueur')
  return {
    clanId,
    memberId: member?.id ?? 0,
    memberName: playerName,
    playerName,
    clanTag: clan?.tag ?? '?',
    clanName: clan?.name ?? 'clan',
  }
}

export type CoachChatRunInput = {
  session: AuthSessionContext
  scope: CoachChatScope
  body: CoachChatBody
  signal: AbortSignal
  emit: (event: CoachSseEvent) => void
  now?: Date
  settings?: CoachSettings
  provider?: CoachModelProvider
}

/**
 * Prépare la question : quota, fil, contexte. Renvoie un refus HTTP (avant tout flux) ou ce qu'il faut pour répondre.
 */
export async function prepareCoachChat(input: Omit<CoachChatRunInput, 'emit' | 'signal' | 'provider'>) {
  const now = input.now ?? new Date()
  const settings = input.settings ?? (await getCoachSettings())
  const decision = await checkCoachQuota({ userId: input.session.userId, isSuperUser: input.session.isSuperUser, now, settings })
  const refusal = quotaRefusal(decision)
  if (refusal) return { refusal }

  const context = await resolveCoachContext(input.body.contextPath, input.scope)
  let conversationId = input.body.conversationId
  if (conversationId !== null) {
    const owned = await prisma.coachConversation.findFirst({ where: { id: conversationId, userId: input.session.userId }, select: { id: true } })
    if (!owned) return { refusal: { status: 404, error: 'conversation_not_found' } as CoachChatRefusal }
  } else {
    const created = await prisma.coachConversation.create({
      data: {
        userId: input.session.userId,
        memberId: input.scope.memberId > 0 ? input.scope.memberId : null,
        clanId: input.scope.clanId,
        title: coachConversationTitle(input.body.message),
        contextLabel: coachContextLabel(context),
      },
      select: { id: true },
    })
    conversationId = created.id
  }
  return { refusal: null, settings, decision, context, conversationId, now }
}

type Prepared = Exclude<Awaited<ReturnType<typeof prepareCoachChat>>, { refusal: CoachChatRefusal }>

/** Répond en flux : à appeler une fois la réponse HTTP ouverte. N'échoue jamais vers l'appelant : tout part en `error`. */
export async function runCoachChat(input: CoachChatRunInput, prepared: Prepared): Promise<void> {
  const { session, scope, body, emit, signal } = input
  const { settings, decision, context, conversationId, now } = prepared
  const model = getCoachModel(settings.model) ?? getCoachModel(COACH_DEFAULT_MODEL_ID)!
  const contextPath = context.kind === 'none' ? null : body.contextPath

  const [usageId, question] = await Promise.all([
    reserveCoachUsage({ userId: session.userId, clanId: scope.clanId, conversationId, model: model.id }),
    prisma.coachMessage.create({ data: { conversationId, role: 'user', content: body.message, contextPath }, select: { id: true } }),
  ])
  emit({ event: 'meta', data: { conversationId, questionId: question.id, context: { label: coachContextLabel(context), suggestions: coachSuggestions(context) } } })

  const [history, blocks] = await Promise.all([loadHistory(conversationId, question.id, settings.historyMessages), loadCoachPromptBlocks(settings, session.userId, now)])
  const tools = createCoachTools(scope)
  // Mémoire personnelle (lot 11) : outil lié au compte et à la question ; les résultats des autres outils de cette
  // réponse sont gardés pour vérifier une mesure de départ. Rien de tout cela quand l'interrupteur est fermé.
  const toolResults: unknown[] = []
  const memoryTool = settings.memoryEnabled
    ? createCoachMemoryTool({ userId: session.userId, memberId: scope.memberId > 0 ? scope.memberId : null, clanId: scope.clanId, message: body.message, toolResults: () => toolResults, now })
    : null
  const runTool = async (call: CoachToolCall) => {
    if (memoryTool && call.name === memoryTool.declaration.name) return memoryTool.run(call)
    const result = await tools.run(call)
    toolResults.push(result)
    return result
  }
  const provider = input.provider ?? createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY ?? '' })
  let partialText = ''

  try {
    const answer = await provider.streamAnswer({
      model,
      system: buildCoachSystemPrompt({
        playerName: scope.playerName,
        clanTag: scope.clanTag,
        clanName: scope.clanName,
        contextBlock: coachContextPromptBlock(context),
        rulesBlock: blocks.rulesBlock,
        memoryBlock: blocks.memoryBlock,
        today: now,
      }),
      history,
      question: body.message,
      tools: memoryTool ? [...tools.declarations, memoryTool.declaration] : tools.declarations,
      runTool,
      maxToolRounds: settings.maxToolRounds,
      signal,
      onDelta: (text) => {
        partialText += text
        emit({ event: 'delta', data: { text } })
      },
      onToolCall: (call) => emit({ event: 'tool', data: { name: call.name, label: COACH_TOOL_LABELS[call.name] ?? 'Je consulte les données…' } }),
    })
    const unverified = isUnverifiedAnswer(answer.text, answer.toolCalls)
    const costMicroUsd = coachCostMicroUsd(model, answer.tokensIn, answer.tokensOut, now)
    const saved = await saveAnswer(conversationId, answer.text, answer.toolCalls, unverified)
    await completeCoachUsage(usageId, { status: 'ok', tokensIn: answer.tokensIn, tokensOut: answer.tokensOut, costMicroUsd })
    // Alerte du plafond global (80 %, atteint) après coup, sans retenir la réponse : `notify…` ne lève jamais.
    void notifyCoachBudgetIfNeeded({
      globalSpentMicroUsd: decision.state.globalSpentMicroUsd + costMicroUsd,
      globalBudgetMicroUsd: decision.state.globalBudgetMicroUsd,
      periodStart: parisMonthBounds(now).start,
      periodEnd: decision.state.periodEnd,
      usdEurRate: settings.usdEurRate,
    })
    emit({
      event: 'done',
      data: {
        messageId: saved,
        unverified,
        remainingHour: decision.state.remainingHour === null ? null : Math.max(0, decision.state.remainingHour - 1),
        monthPercent: decision.state.monthBudgetMicroUsd === null ? null : Math.round(((decision.state.monthSpentMicroUsd + costMicroUsd) / Math.max(1, decision.state.monthBudgetMicroUsd)) * 100),
        finishReason: answer.finishReason,
      },
    })
  } catch (error) {
    const code = error instanceof CoachProviderError ? error.code : 'internal'
    if (code !== 'aborted') console.error('[coach/chat] Réponse en échec :', error)
    const aborted = code === 'aborted'
    // Interrompu : ce qui a été dit reste dans le fil et la question compte ; en erreur, elle ne compte pas.
    const saved = aborted && partialText.trim() ? await saveAnswer(conversationId, partialText, [], false).catch(() => null) : null
    await completeCoachUsage(usageId, { status: aborted ? 'aborted' : 'error', tokensIn: 0, tokensOut: 0, costMicroUsd: 0 }).catch(() => undefined)
    if (!aborted) void notifyCoachProviderErrorsIfNeeded(now, error instanceof Error ? `${code} — ${error.message}` : code)
    emit({ event: 'error', data: { code, message: errorMessage(code) } })
    if (saved !== null) emit({ event: 'done', data: { messageId: saved, unverified: false, remainingHour: null, monthPercent: null, finishReason: 'ABORTED' } })
  }
}

async function loadHistory(conversationId: number, beforeMessageId: number, limit: number): Promise<CoachHistoryMessage[]> {
  if (limit <= 0) return []
  const rows = await prisma.coachMessage.findMany({
    where: { conversationId, id: { lt: beforeMessageId } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { role: true, content: true },
  })
  return rows.reverse().map((row) => ({ role: row.role === 'assistant' ? 'assistant' : 'user', content: row.content }))
}

async function saveAnswer(conversationId: number, content: string, toolCalls: readonly CoachToolCall[], unverified: boolean): Promise<number> {
  const [message] = await prisma.$transaction([
    prisma.coachMessage.create({
      data: { conversationId, role: 'assistant', content, toolCalls: toolCalls.length > 0 ? JSON.parse(JSON.stringify(toolCalls)) : undefined, unverified },
      select: { id: true },
    }),
    prisma.coachConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ])
  return message.id
}

function errorMessage(code: string): string {
  switch (code) {
    case 'aborted':
      return 'Réponse interrompue.'
    case 'rate_limited':
      return 'Le modèle est saturé pour le moment. Réessaie dans un instant.'
    case 'timeout':
      return 'Le modèle met trop de temps à répondre. Réessaie dans un instant.'
    case 'unauthorized':
      return 'Le Coach IA est mal configuré : préviens un administrateur.'
    default:
      return 'Le Coach IA n’a pas pu répondre. Ta question n’est pas décomptée.'
  }
}
