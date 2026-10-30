import { microUsdToEur } from '@/lib/coach/coach-cost'
import type { COACH_SETTING_BOUNDS, CoachSettings } from '@/lib/coach/coach-config'
import { COACH_GAP_TOOL_NAME, coachGapTopics } from '@/lib/coach/coach-gap'
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

export type CoachFrequentQuestion = {
  /** Formulation la plus fréquente du groupe (à égalité, la première vue). */
  text: string
  count: number
  /** Formulations distinctes réunies dans le groupe. */
  variants: number
}

/** Questions fréquentes renvoyées au SuperUser ; la page les pagine. */
export const COACH_FREQUENT_LIMIT = 200
/** Deux questions qui partagent au moins cette part de leurs mots-clés (Jaccard) sont une seule ligne. */
export const COACH_QUESTION_SIMILARITY = 0.6

/** Mots vides du français parlé et tournures de demande, sans valeur pour distinguer deux questions. */
const STOP_WORDS = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'et', 'ou', 'a', 'au', 'aux', 'en', 'dans', 'sur', 'pour', 'par', 'avec', 'sans',
  'ce', 'cet', 'cette', 'ces', 'se', 'sa', 'son', 'ses', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  'je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'm', 'moi', 'te', 't', 'toi', 'lui', 'y', 'ne', 'n', 'pas',
  'que', 'qu', 'qui', 'quoi', 'quel', 'quelle', 'quels', 'quelles', 'est', 'sont', 'ai', 'as', 'ont', 'etre', 'suis', 'es', 'c', 'ca', 'cela',
  'donne', 'donnes', 'donner', 'dis', 'dites', 'dire', 'fais', 'fait', 'faire', 'peux', 'peut', 'pouvez', 'veux', 'veut', 'voudrais',
  'stp', 'svp', 'plait', 'merci', 'bonjour', 'salut', 'coach',
])

/** Terminaisons retirées, de la plus longue à la plus courte, quand il reste au moins trois lettres. */
const SUFFIXES = ['issent', 'issons', 'issez', 'ement', 'ments', 'ment', 'ent', 'ant', 'ons', 'ez', 'er', 'es', 'e', 's', 'x']

function stem(token: string): string {
  if (token.length <= 3) return token
  for (const suffix of SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) return token.slice(0, -suffix.length)
  }
  return token
}

/** Mots-clés d'une question : sans accent, ponctuation, mot vide ni terminaison — « posent problème » et « pose un problème » se rejoignent. */
export function questionTokens(text: string): Set<string> {
  const tokens = new Set<string>()
  for (const word of normalizeCoachQuestion(text).split(' ')) {
    if (!word || STOP_WORDS.has(word)) continue
    tokens.add(stem(word))
  }
  return tokens
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared += 1
  return shared / (a.size + b.size - shared)
}

type QuestionGroup = { key: string; tokens: Set<string>; count: number; forms: Map<string, { text: string; count: number; order: number }> }

/**
 * Questions les plus posées, regroupées par mots-clés : même clé (mêmes mots-clés) ou assez de mots-clés en commun
 * (`COACH_QUESTION_SIMILARITY`) avec le premier groupe compatible. Une question sans mot-clé (« et toi ? ») est
 * groupée sur son texte normalisé. Le libellé est la formulation la plus fréquente du groupe.
 */
export function groupCoachQuestions(messages: ReadonlyArray<{ content: string }>, limit = COACH_FREQUENT_LIMIT): CoachFrequentQuestion[] {
  const byKey = new Map<string, QuestionGroup>()
  const groups: QuestionGroup[] = []
  let order = 0
  for (const message of messages) {
    const normalized = normalizeCoachQuestion(message.content)
    if (!normalized) continue
    const tokens = questionTokens(message.content)
    const key = tokens.size > 0 ? [...tokens].sort().join(' ') : `=${normalized}`
    let group = byKey.get(key)
    if (!group && tokens.size > 0) group = groups.find((candidate) => jaccard(candidate.tokens, tokens) >= COACH_QUESTION_SIMILARITY)
    if (!group) {
      group = { key, tokens, count: 0, forms: new Map() }
      byKey.set(key, group)
      groups.push(group)
    }
    group.count += 1
    const form = group.forms.get(normalized)
    if (form) form.count += 1
    else group.forms.set(normalized, { text: message.content.trim(), count: 1, order: order++ })
  }
  return groups
    .map((group) => {
      const forms = [...group.forms.values()].sort((a, b) => b.count - a.count || a.order - b.order)
      return { text: forms[0].text, count: group.count, variants: forms.length }
    })
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'fr'))
    .slice(0, limit)
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
  /** Réponses à relire d'après des signaux enregistrés, sans auto-évaluation du modèle (2026-10-30). */
  difficult: CoachDifficultAnswer[]
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

// ── Outils et questions difficiles (2026-10-30) ────────────────────────────────────────────────────────────────────

/** Une réponse du modèle, telle que la lisent les onglets Outils et Questions (contexte et clan, jamais le compte). */
export type CoachAnswerRow = {
  id: number
  conversationId: number
  content: string
  toolCalls: unknown
  unverified: boolean
  feedbackScore: number | null
  createdAt: Date
  clanTag: string | null
  contextLabel: string | null
}

export type CoachUserMessageRow = { id: number; conversationId: number; content: string; createdAt: Date }

type AuditEntry = { name: string; failed: string | null }

/** Appels d'une colonne `toolCalls`, avec leur code d'échec (`failed`, coach-chat-service.ts). */
function auditEntries(toolCalls: unknown): AuditEntry[] {
  if (!Array.isArray(toolCalls)) return []
  return toolCalls.flatMap((call) => {
    if (!call || typeof call !== 'object') return []
    const entry = call as { name?: unknown; failed?: unknown }
    if (typeof entry.name !== 'string') return []
    return [{ name: entry.name, failed: typeof entry.failed === 'string' && entry.failed ? entry.failed : null }]
  })
}

/** Appels qui lisent des données : tout sauf la lacune déclarée. */
const dataEntries = (toolCalls: unknown) => auditEntries(toolCalls).filter((entry) => entry.name !== COACH_GAP_TOOL_NAME)

export type CoachToolStat = {
  name: string
  label: string
  calls: number
  /** Réponses qui l'ont appelé au moins une fois, et leur part parmi toutes les réponses de la période. */
  answers: number
  share: number
  /** Parmi ces réponses, celles votées « Inexact ». */
  inaccurate: number
  failures: Array<{ code: string; count: number }>
  lastUsedAt: string | null
}

export type CoachToolsReport = {
  days: number
  answers: number
  /** Réponses sans aucun outil de données : salutations, aide, refus compris. */
  withoutTool: number
  unverified: number
  withFailure: number
  /** Tous les outils déclarés, jamais appelés compris, du plus appelé au moins appelé. */
  tools: CoachToolStat[]
  /** Données manquantes signalées par le modèle (`reportMissingData`), regroupées comme les questions fréquentes. */
  gaps: CoachFrequentQuestion[]
}

/**
 * Onglet Outils : par outil, appels, réponses, échecs et votes « Inexact » sur la période ; les outils déclarés
 * jamais appelés restent dans la liste (à zéro), un outil disparu des déclarations mais présent dans l'historique aussi.
 */
export function buildCoachToolsReport(input: { days: number; answers: readonly CoachAnswerRow[]; toolLabels: Readonly<Record<string, string>> }): CoachToolsReport {
  const stats = new Map<string, CoachToolStat & { failureCounts: Map<string, number> }>()
  const statOf = (name: string) => {
    let stat = stats.get(name)
    if (!stat) {
      stat = { name, label: input.toolLabels[name] ?? name, calls: 0, answers: 0, share: 0, inaccurate: 0, failures: [], lastUsedAt: null, failureCounts: new Map() }
      stats.set(name, stat)
    }
    return stat
  }
  for (const name of Object.keys(input.toolLabels)) if (name !== COACH_GAP_TOOL_NAME) statOf(name)

  let withoutTool = 0
  let withFailure = 0
  const gapTopics: Array<{ content: string }> = []
  for (const answer of input.answers) {
    const entries = dataEntries(answer.toolCalls)
    if (entries.length === 0) withoutTool += 1
    if (entries.some((entry) => entry.failed)) withFailure += 1
    for (const topic of coachGapTopics(answer.toolCalls)) gapTopics.push({ content: topic })
    const seen = new Set<string>()
    for (const entry of entries) {
      const stat = statOf(entry.name)
      stat.calls += 1
      if (entry.failed) stat.failureCounts.set(entry.failed, (stat.failureCounts.get(entry.failed) ?? 0) + 1)
      const at = answer.createdAt.toISOString()
      if (!stat.lastUsedAt || at > stat.lastUsedAt) stat.lastUsedAt = at
      if (seen.has(entry.name)) continue
      seen.add(entry.name)
      stat.answers += 1
      if (answer.feedbackScore === -1) stat.inaccurate += 1
    }
  }

  const total = input.answers.length
  const tools = [...stats.values()]
    .map(({ failureCounts, ...stat }) => ({
      ...stat,
      share: total > 0 ? stat.answers / total : 0,
      failures: [...failureCounts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => b.calls - a.calls || a.label.localeCompare(b.label, 'fr'))

  return {
    days: input.days,
    answers: total,
    withoutTool,
    unverified: input.answers.filter((answer) => answer.unverified).length,
    withFailure,
    tools,
    gaps: groupCoachQuestions(gapTopics),
  }
}

export type CoachDifficultSignal = 'inaccurate' | 'unverified' | 'tool_failed' | 'gap' | 'rephrased'

export const COACH_DIFFICULT_SIGNAL_LABELS: Record<CoachDifficultSignal, string> = {
  inaccurate: 'Vote « Inexact »',
  unverified: 'Chiffres sans outil',
  tool_failed: 'Outil en échec',
  gap: 'Donnée manquante',
  rephrased: 'Question reposée',
}

export type CoachDifficultAnswer = {
  messageId: number
  conversationId: number
  createdAt: string
  clanTag: string | null
  contextLabel: string | null
  question: string | null
  answer: string
  tools: string[]
  signals: CoachDifficultSignal[]
  gapTopics: string[]
  failures: string[]
}

/** Question reposée : la suivante du même fil, posée dans ce délai après la réponse, avec assez de mots-clés communs. */
export const COACH_REPHRASE_WINDOW_MS = 10 * 60 * 1000
export const COACH_REPHRASE_SIMILARITY = 0.5
/** Réponses difficiles renvoyées au SuperUser ; la page les pagine. */
export const COACH_DIFFICULT_LIMIT = 100

/**
 * Questions difficiles : réponses marquées par au moins un signal enregistré — vote « Inexact », chiffres sans outil,
 * outil en échec, donnée manquante déclarée, question reposée dans la foulée. Aucune auto-évaluation du modèle : il ne
 * sait pas si ses chiffres sont justes. Les plus marquées d'abord, puis les plus récentes.
 */
export function buildCoachDifficultAnswers(answers: readonly CoachAnswerRow[], userMessages: readonly CoachUserMessageRow[]): CoachDifficultAnswer[] {
  const byConversation = new Map<number, CoachUserMessageRow[]>()
  for (const message of userMessages) {
    const list = byConversation.get(message.conversationId) ?? []
    list.push(message)
    byConversation.set(message.conversationId, list)
  }
  for (const list of byConversation.values()) list.sort((a, b) => a.id - b.id)

  const difficult: CoachDifficultAnswer[] = []
  for (const answer of answers) {
    const messages = byConversation.get(answer.conversationId) ?? []
    const question = [...messages].reverse().find((message) => message.id < answer.id) ?? null
    const next = messages.find((message) => message.id > answer.id) ?? null
    const entries = dataEntries(answer.toolCalls)
    const failures = entries.flatMap((entry) => (entry.failed ? [`${entry.name} : ${entry.failed}`] : []))
    const gapTopics = coachGapTopics(answer.toolCalls)
    const rephrased =
      question !== null &&
      next !== null &&
      next.createdAt.getTime() - answer.createdAt.getTime() <= COACH_REPHRASE_WINDOW_MS &&
      jaccard(questionTokens(question.content), questionTokens(next.content)) >= COACH_REPHRASE_SIMILARITY

    const signals: CoachDifficultSignal[] = []
    if (answer.feedbackScore === -1) signals.push('inaccurate')
    if (answer.unverified) signals.push('unverified')
    if (failures.length > 0) signals.push('tool_failed')
    if (gapTopics.length > 0) signals.push('gap')
    if (rephrased) signals.push('rephrased')
    if (signals.length === 0) continue

    difficult.push({
      messageId: answer.id,
      conversationId: answer.conversationId,
      createdAt: answer.createdAt.toISOString(),
      clanTag: answer.clanTag,
      contextLabel: answer.contextLabel,
      question: question?.content ?? null,
      answer: answer.content,
      tools: entries.map((entry) => entry.name),
      signals,
      gapTopics,
      failures,
    })
  }
  return difficult
    .sort((a, b) => b.signals.length - a.signals.length || b.createdAt.localeCompare(a.createdAt))
    .slice(0, COACH_DIFFICULT_LIMIT)
}

/** Fil du SuperUser (onglet Fils) : ses essais, à supprimer d'un coup ou un par un. */
export type CoachOwnConversation = {
  id: number
  title: string
  contextLabel: string | null
  clanTag: string | null
  questions: number
  createdAt: string
  updatedAt: string
}
