import type { Request } from '@playwright/test'

import type { ApiMock } from './api'
import { CLAN_ID } from './data'
import { mockMemberSession } from './session'

/**
 * Coach IA (e2e/coach.spec.ts, docs/features/coach-ia.md) : session d'un membre, quota, fils, flux SSE figé d'une
 * réponse, vote. Rien n'atteint la base ni le modèle : le corps `text/event-stream` est servi d'un bloc par
 * `ApiMock` (`contentType`), le lecteur de flux du tiroir le découpe comme un vrai flux.
 */

export const COACH_CONVERSATION_ID = 42
export const COACH_ANSWER_MESSAGE_ID = 101
export const COACH_QUESTION = 'Pourquoi on s’est fait sortir ?'
export const COACH_CONTEXT_LABEL = 'Erangel · 22 oct. 21:47 · Top 3'

export const COACH_ANSWER = [
  '**Phase 5 · 18:42**',
  '',
  '- **Isolement :** Joueur Alpha à **145 m** du reste de l’escouade.',
  '- **Dégâts subis :** **420** en 6 s, sans couverture.',
  '',
  '💡 Recommandation : reste à moins de 50 m de ton escouade en phase 5.',
].join('\n')

export type CoachQuotaFixture = {
  authenticated: true
  allowed: boolean
  reason: string | null
  retryAt: string | null
  unlimited: boolean
  remainingHour: number | null
  hourlyLimit: number
  monthPercent: number | null
  globalPercent: number
  periodEnd: string
  /** Mémoire personnelle ouverte (lot 11) : le panneau montre « Ce que le Coach sait de toi ». */
  memoryEnabled: boolean
}

export function coachQuota(overrides: Partial<CoachQuotaFixture> = {}): CoachQuotaFixture {
  return {
    authenticated: true,
    allowed: true,
    reason: null,
    retryAt: null,
    unlimited: false,
    remainingHour: 14,
    hourlyLimit: 20,
    monthPercent: 12,
    globalPercent: 15,
    periodEnd: '2026-10-31T23:00:00.000Z',
    memoryEnabled: false,
    ...overrides,
  }
}

export type CoachMemoryFixture = { id: number; key: 'goal' | 'role' | 'preference' | 'avoid' | 'note'; text: string; baseline: { metric: string; weapon?: string; value: number; at: string } | null; updatedAt: string; expiresAt: string }

/** Deux lignes de « Ce que le Coach sait de toi » : un objectif chiffré avec sa mesure de départ, une préférence. */
export const COACH_MEMORIES: CoachMemoryFixture[] = [
  { id: 1, key: 'goal', text: '30 % de headshots au Kar98k', baseline: { metric: 'headshotRate', weapon: 'Kar98k', value: 22, at: '2026-10-24T20:00:00.000Z' }, updatedAt: '2026-10-24T20:00:00.000Z', expiresAt: '2027-01-22T20:00:00.000Z' },
  { id: 2, key: 'preference', text: 'je joue surtout le soir en squad', baseline: null, updatedAt: '2026-10-20T20:00:00.000Z', expiresAt: '2027-01-18T20:00:00.000Z' },
]

/** Corps d'un flux SSE, tel que le serveur l'écrit (`encodeCoachSseEvent`). */
export function coachSse(events: Array<{ event: string; data: unknown }>) {
  return events.map((entry) => `event: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`).join('')
}

/** Une réponse complète : contexte, outil consulté, texte en deux morceaux, fin avec le quota ajusté. */
export function coachAnswerEvents(contextLabel: string | null) {
  return [
    { event: 'meta', data: { conversationId: COACH_CONVERSATION_ID, questionId: 100, context: { label: contextLabel, suggestions: ['Qui a fait les ouvertures ?', 'Quelles armes nous ont fait mal ?', 'Où atterrir sur cette carte ?'] } } },
    { event: 'tool', data: { name: 'getMatchDebrief', label: 'Je relis le match…' } },
    { event: 'delta', data: { text: COACH_ANSWER.slice(0, 40) } },
    { event: 'delta', data: { text: COACH_ANSWER.slice(40) } },
    { event: 'done', data: { messageId: COACH_ANSWER_MESSAGE_ID, unverified: false, remainingHour: 13, monthPercent: 12, finishReason: 'STOP' } },
  ]
}

export type CoachCalls = {
  chats: Array<{ conversationId: number | null; contextPath: string | null; message: string }>
  feedback: Array<Record<string, unknown>>
  /** Lignes de mémoire effacées une à une, et nombre de « Tout oublier ». */
  forgotten: number[]
  forgotAll: number
}

const conversation = () => ({
  id: COACH_CONVERSATION_ID,
  title: COACH_QUESTION,
  contextLabel: COACH_CONTEXT_LABEL,
  clanId: CLAN_ID,
  createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
})

/**
 * Session d'un membre du clan et toutes les API du Coach ; les corps envoyés sont gardés pour vérification. `memory` :
 * mémoire personnelle ouverte (lot 11) avec ces lignes ; absente, l'interrupteur est fermé et le panneau n'en montre rien.
 */
export function mockCoachMember(api: ApiMock, options: { superUser?: boolean; quota?: Partial<CoachQuotaFixture>; contextLabel?: string | null; memory?: CoachMemoryFixture[] } = {}): CoachCalls {
  mockMemberSession(api, { superUser: options.superUser })
  const calls: CoachCalls = { chats: [], feedback: [], forgotten: [], forgotAll: 0 }
  const summary = conversation()
  let memories = [...(options.memory ?? [])]
  api
    .on('GET', '/api/coach/quota', { body: coachQuota({ memoryEnabled: options.memory !== undefined, ...options.quota }) })
    .on('GET', '/api/coach/memory', () => ({ body: { authenticated: true, enabled: options.memory !== undefined, memories, max: 8, retentionDays: 90 } }))
    .on('DELETE', '/api/coach/memory', () => {
      calls.forgotAll += 1
      memories = []
      return { body: { ok: true, deleted: memories.length } }
    })
  for (const memory of options.memory ?? []) {
    api.on('DELETE', `/api/coach/memory/${memory.id}`, () => {
      calls.forgotten.push(memory.id)
      memories = memories.filter((entry) => entry.id !== memory.id)
      return { body: { ok: true } }
    })
  }
  api
    .on('GET', '/api/coach/conversations', { body: { authenticated: true, conversations: [summary] } })
    .on('GET', `/api/coach/conversations/${COACH_CONVERSATION_ID}`, {
      body: {
        ...summary,
        messages: [
          { id: 100, role: 'user', content: COACH_QUESTION, tools: [], unverified: false, feedbackScore: null, createdAt: summary.createdAt },
          { id: COACH_ANSWER_MESSAGE_ID, role: 'assistant', content: COACH_ANSWER, tools: ['getMatchDebrief'], unverified: false, feedbackScore: 1, createdAt: summary.updatedAt },
        ],
      },
    })
    .on('POST', `/api/clans/${CLAN_ID}/coach/chat`, (_url, request: Request) => {
      calls.chats.push(request.postDataJSON() as CoachCalls['chats'][number])
      return { body: coachSse(coachAnswerEvents(options.contextLabel ?? null)), contentType: 'text/event-stream' }
    })
    .on('POST', `/api/coach/messages/${COACH_ANSWER_MESSAGE_ID}/feedback`, (_url, request: Request) => {
      calls.feedback.push(request.postDataJSON() as Record<string, unknown>)
      return { body: { ok: true } }
    })
  return calls
}

const COACH_SETTINGS = {
  enabled: true,
  rulesEnabled: false,
  memoryEnabled: false,
  model: 'gemini-3.5-flash-lite',
  budgetPerAccountEur: 2,
  globalBudgetEur: 50,
  usdEurRate: 0.86,
  hourlyLimit: 20,
  minIntervalSeconds: 4,
  maxInputChars: 400,
  historyMessages: 10,
  maxToolRounds: 4,
}
const COACH_BOUNDS = {
  budgetPerAccountEur: { min: 0, max: 100, decimals: 2 },
  globalBudgetEur: { min: 0, max: 1000, decimals: 2 },
  usdEurRate: { min: 0.5, max: 2, decimals: 4 },
  hourlyLimit: { min: 1, max: 200, decimals: 0 },
  minIntervalSeconds: { min: 0, max: 60, decimals: 0 },
  maxInputChars: { min: 50, max: 2000, decimals: 0 },
  historyMessages: { min: 0, max: 50, decimals: 0 },
  maxToolRounds: { min: 1, max: 8, decimals: 0 },
}

export type CoachRuleFixture = { id: number; text: string; enabled: boolean; fromMessageId: number | null; createdAt: string; updatedAt: string; tokens: number }
export type CoachRuleWrite = { method: 'POST' | 'PATCH' | 'DELETE'; id?: number; body?: Record<string, unknown> }

const estimateTokens = (text: string) => Math.ceil(text.trim().length / 4)

/** Page SuperUser /settings/coach : réglages, test de modèle, consommation, questions et règles apprises figés. */
export function mockCoachAdmin(api: ApiMock) {
  mockMemberSession(api, { superUser: true })
  const saves: Array<Record<string, unknown>> = []
  const ruleWrites: CoachRuleWrite[] = []
  let settings = { ...COACH_SETTINGS }
  let rules: CoachRuleFixture[] = [{ id: 1, text: 'Un Top 10 n’est pas une victoire.', enabled: true, fromMessageId: null, createdAt: '2026-10-25T09:00:00.000Z', updatedAt: '2026-10-25T09:00:00.000Z', tokens: 9 }]
  const rulesReport = () => {
    const active = rules.filter((rule) => rule.enabled)
    return { enabled: settings.rulesEnabled, rules, activeCount: active.length, maxActive: 20, promptTokens: active.length === 0 ? 0 : estimateTokens(active.map((rule) => `- ${rule.text}`).join('\n')) + 30 }
  }
  api
    .on('GET', '/api/settings/coach/rules', () => ({ body: rulesReport() }))
    .on('POST', '/api/settings/coach/rules', (_url, request: Request) => {
      const body = request.postDataJSON() as { text: string; fromMessageId: number | null }
      ruleWrites.push({ method: 'POST', body })
      const rule: CoachRuleFixture = { id: rules.length + 1, text: body.text.trim(), enabled: true, fromMessageId: body.fromMessageId ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tokens: estimateTokens(body.text) }
      rules = [...rules, rule]
      return { status: 201, body: { rule } }
    })
  for (const id of [1, 2, 3]) {
    api
      .on('PATCH', `/api/settings/coach/rules/${id}`, (_url, request: Request) => {
        const body = request.postDataJSON() as Record<string, unknown>
        ruleWrites.push({ method: 'PATCH', id, body })
        rules = rules.map((rule) => (rule.id === id ? { ...rule, ...body, updatedAt: new Date().toISOString() } : rule))
        return { body: { rule: rules.find((rule) => rule.id === id) } }
      })
      .on('DELETE', `/api/settings/coach/rules/${id}`, () => {
        ruleWrites.push({ method: 'DELETE', id })
        rules = rules.filter((rule) => rule.id !== id)
        return { body: { ok: true } }
      })
  }
  api
    .on('GET', '/api/settings/coach', () => ({ body: { settings, apiKeyPresent: true, defaults: COACH_SETTINGS, bounds: COACH_BOUNDS } }))
    .on('PUT', '/api/settings/coach', (_url, request: Request) => {
      const patch = (request.postDataJSON() as { settings: Record<string, unknown> }).settings
      saves.push(patch)
      settings = { ...settings, ...patch } as typeof settings
      return { body: { settings, apiKeyPresent: true, defaults: COACH_SETTINGS, bounds: COACH_BOUNDS } }
    })
    .on('POST', '/api/settings/coach/test-model', {
      body: { ok: true, model: 'gemini-3.5-flash-lite', durationMs: 2200, toolCalled: true, codeReturned: true, invented: false, tokensIn: 120, tokensOut: 12, costEur: 0.0001, answer: '4242' },
    })
    .on('GET', '/api/settings/coach/usage', {
      body: {
        period: { start: '2026-09-30T22:00:00.000Z', end: '2026-10-31T23:00:00.000Z' },
        totals: { costEur: 7.4, questions: 1760, accounts: 14, costPerQuestionEur: 0.0042, errors: 3, aborted: 12 },
        global: { spentEur: 7.4, budgetEur: 50, percent: 15, remainingEur: 42.6 },
        byModel: [{ model: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', questions: 1700, tokensIn: 8_500_000, tokensOut: 510_000, costEur: 6.9 }],
        accountsNearBudget: [{ userId: 3, label: 'Joueur Bravo', spentEur: 1.7, percent: 85 }],
        budgetPerAccountEur: 2,
        errorsLast24h: 0,
      },
    })
    .on('GET', '/api/settings/coach/questions', {
      body: {
        days: 30,
        frequent: Array.from({ length: 12 }, (_, index) => ({ text: `Question fréquente n° ${index + 1} ?`, count: 24 - index, variants: index === 0 ? 2 : 1 })),
        votes: { helpful: 412, inaccurate: 9, pendingReview: 1 },
        inaccurate: [
          {
            messageId: 42,
            conversationId: 5,
            createdAt: '2026-10-22T19:58:00.000Z',
            clanTag: 'DEMO',
            contextLabel: COACH_CONTEXT_LABEL,
            question: COACH_QUESTION,
            note: 'La mise à terre est à 18:39, pas à 18:42.',
            answer: COACH_ANSWER,
            tools: ['getMatchDebrief', 'getRecentMatches'],
            unverified: false,
          },
        ],
      },
    })
    .on('POST', '/api/settings/coach/questions/42/reviewed', { body: { ok: true } })
  return { saves, ruleWrites }
}
