import { microUsdToEur } from '@/lib/coach/coach-cost'
import type { COACH_SETTING_BOUNDS, CoachSettings } from '@/lib/coach/coach-config'
import { getCoachModel } from '@/lib/coach/coach-models'
import type { CoachProviderErrorCode } from '@/lib/coach/coach-provider'
import type { CoachUsageStatus } from '@/lib/coach/coach-quota'

/**
 * Rapports de la page SuperUser `/settings/coach` (docs/TODO/chatbot-ia.md §9), onglets Consommation et Questions —
 * construction pure à partir des lignes lues par `coach-admin-service.ts`, testée seule.
 *
 * Les montants arrivent en micro-dollars (`CoachUsage.costMicroUsd`) et sortent en euros au taux des réglages. Les
 * questions fréquentes sont regroupées par texte normalisé (V1) et ne portent jamais le compte qui les a posées.
 */

/** `GET /api/settings/coach` : réglages en vigueur, présence de la clé (jamais sa valeur), défauts et bornes. */
export type CoachAdminState = {
  settings: CoachSettings
  apiKeyPresent: boolean
  defaults: CoachSettings
  bounds: typeof COACH_SETTING_BOUNDS
}

/** Résultat du bouton « Tester » d'une tuile de modèle (`POST /api/settings/coach/test-model`). */
export type CoachModelTestResult =
  | {
      ok: true
      model: string
      durationMs: number
      /** Le modèle a appelé l'outil de test. */
      toolCalled: boolean
      /** Et a renvoyé le code que l'outil lui a donné. */
      codeReturned: boolean
      /** Un nombre dans la réponse sans appel d'outil : chiffres inventés (ce qu'a fait 3.1-flash-lite à l'essai). */
      invented: boolean
      tokensIn: number
      tokensOut: number
      costEur: number
      answer: string
    }
  | { ok: false; model: string; durationMs: number; code: CoachProviderErrorCode | 'unknown_model' | 'no_api_key' | 'internal'; message: string }

const TEST_FAILURE_LABELS: Record<Extract<CoachModelTestResult, { ok: false }>['code'], string> = {
  unauthorized: 'clé refusée ou accès limité',
  rate_limited: 'quota du fournisseur dépassé',
  unavailable: 'fournisseur indisponible',
  bad_request: 'requête refusée',
  timeout: 'délai dépassé',
  aborted: 'interrompu',
  network: 'réseau injoignable',
  unknown_model: 'modèle inconnu',
  no_api_key: 'clé absente du .env',
  internal: 'erreur interne',
}

/** « 2,2 s » */
export function formatCoachSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1).replace('.', ',')} s`
}

/** Ligne sous la tuile : réussite avec appel d'outil, outil ignoré, chiffres inventés, ou cause de l'échec. */
export function coachTestSummary(result: CoachModelTestResult): { tone: 'pos' | 'warn' | 'neg'; text: string } {
  if (!result.ok) return { tone: 'neg', text: `Test échoué · ${TEST_FAILURE_LABELS[result.code]} — ${result.message}` }
  const seconds = formatCoachSeconds(result.durationMs)
  if (result.toolCalled && result.codeReturned) return { tone: 'pos', text: `Test réussi · ${seconds} · appel d’outil OK` }
  if (result.toolCalled) return { tone: 'warn', text: `Outil appelé mais code non repris · ${seconds}` }
  if (result.invented) return { tone: 'neg', text: `Test : chiffres inventés sans appel d’outil · ${seconds}` }
  return { tone: 'warn', text: `Réponse sans appel d’outil · ${seconds}` }
}

/** Seuil à partir duquel un compte apparaît dans « comptes proches de leur budget ». */
export const COACH_ACCOUNT_WARN_PERCENT = 80
/** Seuil de l'alerte du plafond global (repère de la jauge). */
export const COACH_GLOBAL_WARN_PERCENT = 80

export type CoachUsageRow = {
  userId: number
  model: string
  status: CoachUsageStatus | string
  tokensIn: number
  tokensOut: number
  costMicroUsd: number
  createdAt: Date
}

export type CoachUsageReport = {
  period: { start: string; end: string }
  totals: {
    costEur: number
    /** Questions répondues (`ok`) ; les interrompues comptent dans le budget mais pas ici. */
    questions: number
    /** Comptes ayant posé au moins une question comptée dans le mois. */
    accounts: number
    /** Coût moyen d'une question répondue ; `null` sans question. */
    costPerQuestionEur: number | null
    errors: number
    aborted: number
  }
  global: { spentEur: number; budgetEur: number; percent: number; remainingEur: number }
  byModel: Array<{ model: string; label: string; questions: number; tokensIn: number; tokensOut: number; costEur: number }>
  /** Comptes au-delà de `COACH_ACCOUNT_WARN_PERCENT` de leur budget, du plus consommé au moins. */
  accountsNearBudget: Array<{ userId: number; label: string; spentEur: number; percent: number }>
  /** Budget par compte en vigueur, pour lire les pourcentages. */
  budgetPerAccountEur: number
  errorsLast24h: number
}

const COUNTED: ReadonlySet<string> = new Set(['pending', 'ok', 'aborted'])

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function buildCoachUsageReport(input: {
  rows: readonly CoachUsageRow[]
  settings: CoachSettings
  period: { start: Date; end: Date }
  /** Libellé d'un compte (pseudo du membre, sinon nom affiché, sinon adresse) ; un compte inconnu garde son numéro. */
  accountLabels: ReadonlyMap<number, string>
  errorsLast24h: number
}): CoachUsageReport {
  const { rows, settings } = input
  const toEur = (microUsd: number) => round(microUsdToEur(microUsd, settings.usdEurRate), 4)

  let spentMicroUsd = 0
  let questions = 0
  let errors = 0
  let aborted = 0
  const byModel = new Map<string, { questions: number; tokensIn: number; tokensOut: number; costMicroUsd: number }>()
  const byAccount = new Map<number, number>()

  for (const row of rows) {
    if (row.status === 'ok') questions += 1
    else if (row.status === 'error') errors += 1
    else if (row.status === 'aborted') aborted += 1
    if (!COUNTED.has(row.status)) continue

    spentMicroUsd += row.costMicroUsd
    byAccount.set(row.userId, (byAccount.get(row.userId) ?? 0) + row.costMicroUsd)
    const entry = byModel.get(row.model) ?? { questions: 0, tokensIn: 0, tokensOut: 0, costMicroUsd: 0 }
    if (row.status === 'ok') entry.questions += 1
    entry.tokensIn += row.tokensIn
    entry.tokensOut += row.tokensOut
    entry.costMicroUsd += row.costMicroUsd
    byModel.set(row.model, entry)
  }

  const budgetEur = settings.globalBudgetEur
  const spentEur = toEur(spentMicroUsd)
  const percent = budgetEur > 0 ? Math.round((spentEur / budgetEur) * 100) : 100
  const perAccountBudget = settings.budgetPerAccountEur

  const accountsNearBudget = [...byAccount.entries()]
    .map(([userId, microUsd]) => {
      const accountSpent = toEur(microUsd)
      const accountPercent = perAccountBudget > 0 ? Math.round((accountSpent / perAccountBudget) * 100) : 100
      return { userId, label: input.accountLabels.get(userId) ?? `Compte n° ${userId}`, spentEur: accountSpent, percent: accountPercent }
    })
    .filter((account) => account.percent >= COACH_ACCOUNT_WARN_PERCENT)
    .sort((a, b) => b.spentEur - a.spentEur)

  return {
    period: { start: input.period.start.toISOString(), end: input.period.end.toISOString() },
    totals: {
      costEur: spentEur,
      questions,
      accounts: byAccount.size,
      costPerQuestionEur: questions > 0 ? round(spentEur / questions, 4) : null,
      errors,
      aborted,
    },
    global: { spentEur, budgetEur, percent, remainingEur: round(Math.max(0, budgetEur - spentEur), 2) },
    byModel: [...byModel.entries()]
      .map(([model, entry]) => ({
        model,
        label: getCoachModel(model)?.label ?? model,
        questions: entry.questions,
        tokensIn: entry.tokensIn,
        tokensOut: entry.tokensOut,
        costEur: toEur(entry.costMicroUsd),
      }))
      .sort((a, b) => b.costEur - a.costEur),
    accountsNearBudget,
    budgetPerAccountEur: perAccountBudget,
    errorsLast24h: input.errorsLast24h,
  }
}

/** Texte comparable d'une question : minuscules, sans accent, ponctuation ni espaces répétés. */
export function normalizeCoachQuestion(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type CoachFrequentQuestion = { text: string; count: number }

/** Questions les plus posées, regroupées par texte normalisé ; le libellé gardé est la première forme rencontrée. */
export function groupCoachQuestions(messages: ReadonlyArray<{ content: string }>, limit = 15): CoachFrequentQuestion[] {
  const groups = new Map<string, CoachFrequentQuestion>()
  for (const message of messages) {
    const key = normalizeCoachQuestion(message.content)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { text: message.content.trim(), count: 1 })
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'fr')).slice(0, limit)
}

export type CoachInaccurateAnswer = {
  messageId: number
  conversationId: number
  createdAt: string
  clanTag: string | null
  contextLabel: string | null
  question: string | null
  note: string | null
  answer: string
  tools: string[]
  unverified: boolean
}

export type CoachQuestionsReport = {
  days: number
  frequent: CoachFrequentQuestion[]
  votes: { helpful: number; inaccurate: number; pendingReview: number }
  inaccurate: CoachInaccurateAnswer[]
}

/** Noms des outils d'une colonne `toolCalls` (même lecture que la vue d'un fil). */
export function coachToolNames(toolCalls: unknown): string[] {
  if (!Array.isArray(toolCalls)) return []
  return toolCalls
    .map((call) => (call && typeof call === 'object' && typeof (call as { name?: unknown }).name === 'string' ? (call as { name: string }).name : null))
    .filter((name): name is string => name !== null)
}

/** Question qui précède une réponse dans son fil : le dernier message `user` d'identifiant inférieur. */
export function questionBefore(
  answer: { conversationId: number; id: number },
  userMessages: ReadonlyArray<{ id: number; conversationId: number; content: string }>
): string | null {
  let best: { id: number; content: string } | null = null
  for (const message of userMessages) {
    if (message.conversationId !== answer.conversationId || message.id >= answer.id) continue
    if (!best || message.id > best.id) best = message
  }
  return best?.content ?? null
}
