import { getCoachSettings, hasCoachApiKey, type CoachSettings } from '@/lib/coach/coach-config'
import { eurToMicroUsd } from '@/lib/coach/coach-cost'
import { prisma } from '@/lib/prisma'

/**
 * Quotas et budget du Coach IA (docs/TODO/chatbot-ia.md §2). Tout se lit dans `CoachUsage`, une ligne par question :
 * la limite horaire est une vraie fenêtre glissante (compte sur la dernière heure), le budget du compte et le plafond
 * global se mesurent sur le mois calendaire de Paris. Par **compte** (`userId`), jamais par membre : une session change
 * de membre actif. Le SuperUser n'a ni limite ni budget et passe outre la pause (soirée de test, lot 9) ; ses questions
 * sont tout de même comptées pour le coût du mois. Sans clé d'API, personne ne passe.
 *
 * `readCoachQuotaFacts` lit la base, `decideCoachQuota` est pur : les tests portent sur la décision.
 */

export type CoachUsageStatus = 'pending' | 'ok' | 'error' | 'aborted' | 'refused'

/** Statuts qui comptent dans la limite horaire : une erreur du fournisseur ne coûte pas de question. */
export const COACH_COUNTED_STATUSES: readonly CoachUsageStatus[] = ['pending', 'ok', 'aborted']

export type CoachQuotaRefusal = 'coach_paused' | 'global_budget' | 'too_fast' | 'hourly_limit' | 'monthly_budget'

const HOUR_MS = 60 * 60 * 1000

const PARIS_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function parisParts(at: Date): DateParts {
  const parts: Partial<DateParts> = {}
  for (const part of PARIS_PARTS.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type as keyof DateParts] = Number(part.value)
  }
  return parts as DateParts
}

/** Instant UTC de minuit à Paris, le 1er du mois donné (mois de 1 à 12) : l'heure d'été ne change jamais un 1er. */
function parisMonthStartUtc(year: number, month: number): Date {
  const guess = Date.UTC(year, month - 1, 1)
  const seen = parisParts(new Date(guess))
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second)
  return new Date(guess - (seenAsUtc - guess))
}

/** Bornes du mois calendaire de Paris qui contient l'instant : `[start, end[`. */
export function parisMonthBounds(now: Date): { start: Date; end: Date } {
  const { year, month } = parisParts(now)
  const start = parisMonthStartUtc(year, month)
  const end = month === 12 ? parisMonthStartUtc(year + 1, 1) : parisMonthStartUtc(year, month + 1)
  return { start, end }
}

export type CoachQuotaFacts = {
  /** Questions comptées dans la dernière heure. */
  hourCount: number
  /** Plus ancienne question de cette heure : la limite se libère une heure après elle. */
  oldestInHourAt: Date | null
  /** Dernière question comptée, pour l'anti-rafale. */
  lastQuestionAt: Date | null
  monthSpentMicroUsd: number
  globalSpentMicroUsd: number
  periodStart: Date
  periodEnd: Date
}

export async function readCoachQuotaFacts(userId: number, now: Date = new Date()): Promise<CoachQuotaFacts> {
  const { start, end } = parisMonthBounds(now)
  const hourAgo = new Date(now.getTime() - HOUR_MS)
  const counted = { in: [...COACH_COUNTED_STATUSES] }
  const [hourCount, oldest, last, month, global] = await Promise.all([
    prisma.coachUsage.count({ where: { userId, status: counted, createdAt: { gte: hourAgo } } }),
    prisma.coachUsage.findFirst({
      where: { userId, status: counted, createdAt: { gte: hourAgo } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.coachUsage.findFirst({ where: { userId, status: counted }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.coachUsage.aggregate({ _sum: { costMicroUsd: true }, where: { userId, createdAt: { gte: start, lt: end } } }),
    prisma.coachUsage.aggregate({ _sum: { costMicroUsd: true }, where: { createdAt: { gte: start, lt: end } } }),
  ])
  return {
    hourCount,
    oldestInHourAt: oldest?.createdAt ?? null,
    lastQuestionAt: last?.createdAt ?? null,
    monthSpentMicroUsd: month._sum.costMicroUsd ?? 0,
    globalSpentMicroUsd: global._sum.costMicroUsd ?? 0,
    periodStart: start,
    periodEnd: end,
  }
}

export type CoachQuotaState = {
  /** SuperUser : ni limite ni budget. */
  unlimited: boolean
  /** Questions encore possibles dans l'heure ; `null` sans limite. */
  remainingHour: number | null
  hourlyLimit: number
  monthSpentMicroUsd: number
  /** Budget mensuel du compte ; `null` sans limite. Un budget à 0 ne laisse passer aucune question. */
  monthBudgetMicroUsd: number | null
  /** Part consommée du budget du compte, en %, arrondie ; `null` sans limite. */
  monthPercent: number | null
  globalSpentMicroUsd: number
  globalBudgetMicroUsd: number
  globalPercent: number
  /** Début du mois suivant (Paris) : retour du budget. */
  periodEnd: Date
}

export type CoachQuotaDecision =
  | { allowed: true; reason: null; retryAt: null; state: CoachQuotaState }
  | { allowed: false; reason: CoachQuotaRefusal; retryAt: Date | null; state: CoachQuotaState }

function percentOf(spent: number, budget: number): number {
  if (budget <= 0) return 100
  return Math.round((spent / budget) * 100)
}

/** Ordre des refus : clé absente, pause, plafond global, rafale, limite horaire, budget du compte. */
export function decideCoachQuota(
  facts: CoachQuotaFacts,
  settings: CoachSettings,
  options: { isSuperUser: boolean; hasApiKey: boolean; now: Date }
): CoachQuotaDecision {
  const monthBudget = eurToMicroUsd(settings.budgetPerAccountEur, settings.usdEurRate)
  const globalBudget = eurToMicroUsd(settings.globalBudgetEur, settings.usdEurRate)
  const unlimited = options.isSuperUser
  const state: CoachQuotaState = {
    unlimited,
    remainingHour: unlimited ? null : Math.max(0, settings.hourlyLimit - facts.hourCount),
    hourlyLimit: settings.hourlyLimit,
    monthSpentMicroUsd: facts.monthSpentMicroUsd,
    monthBudgetMicroUsd: unlimited ? null : monthBudget,
    monthPercent: unlimited ? null : percentOf(facts.monthSpentMicroUsd, monthBudget),
    globalSpentMicroUsd: facts.globalSpentMicroUsd,
    globalBudgetMicroUsd: globalBudget,
    globalPercent: percentOf(facts.globalSpentMicroUsd, globalBudget),
    periodEnd: facts.periodEnd,
  }
  const refuse = (reason: CoachQuotaRefusal, retryAt: Date | null): CoachQuotaDecision => ({ allowed: false, reason, retryAt, state })

  if (!options.hasApiKey) return refuse('coach_paused', null)
  if (unlimited) return { allowed: true, reason: null, retryAt: null, state }
  if (!settings.enabled) return refuse('coach_paused', null)
  if (facts.globalSpentMicroUsd >= globalBudget) return refuse('global_budget', facts.periodEnd)
  if (facts.lastQuestionAt && settings.minIntervalSeconds > 0) {
    const retryAt = new Date(facts.lastQuestionAt.getTime() + settings.minIntervalSeconds * 1000)
    if (retryAt > options.now) return refuse('too_fast', retryAt)
  }
  if (facts.hourCount >= settings.hourlyLimit) {
    const since = facts.oldestInHourAt ?? options.now
    return refuse('hourly_limit', new Date(since.getTime() + HOUR_MS))
  }
  if (facts.monthSpentMicroUsd >= monthBudget) return refuse('monthly_budget', facts.periodEnd)
  return { allowed: true, reason: null, retryAt: null, state }
}

export async function checkCoachQuota(params: {
  userId: number
  isSuperUser: boolean
  now?: Date
  settings?: CoachSettings
}): Promise<CoachQuotaDecision> {
  const now = params.now ?? new Date()
  const settings = params.settings ?? (await getCoachSettings())
  const facts = await readCoachQuotaFacts(params.userId, now)
  return decideCoachQuota(facts, settings, { isSuperUser: params.isSuperUser, hasApiKey: hasCoachApiKey(), now })
}

/** Réserve la question **avant** l'appel au modèle : un onglet fermé en cours de réponse ne la rend pas gratuite. */
export async function reserveCoachUsage(data: {
  userId: number
  clanId: number | null
  conversationId: number | null
  model: string
}): Promise<number> {
  const row = await prisma.coachUsage.create({ data: { ...data, status: 'pending' }, select: { id: true } })
  return row.id
}

export async function completeCoachUsage(
  id: number,
  result: { status: Exclude<CoachUsageStatus, 'pending'>; tokensIn: number; tokensOut: number; costMicroUsd: number }
): Promise<void> {
  await prisma.coachUsage.update({ where: { id }, data: result })
}

/** Forme renvoyée par `GET /api/coach/quota` et lue par le tiroir. */
export type CoachQuotaPayload = {
  authenticated: true
  allowed: boolean
  reason: CoachQuotaRefusal | null
  retryAt: string | null
  unlimited: boolean
  remainingHour: number | null
  hourlyLimit: number
  monthPercent: number | null
  globalPercent: number
  periodEnd: string
  /** Mémoire personnelle ouverte (`coach_memory_enabled`, lot 11) : le panneau montre « Ce que le Coach sait de toi ». */
  memoryEnabled: boolean
}

export function coachQuotaPayload(decision: CoachQuotaDecision, extras: { memoryEnabled: boolean } = { memoryEnabled: false }): CoachQuotaPayload {
  const { state } = decision
  return {
    authenticated: true,
    memoryEnabled: extras.memoryEnabled,
    allowed: decision.allowed,
    reason: decision.reason,
    retryAt: decision.retryAt ? decision.retryAt.toISOString() : null,
    unlimited: state.unlimited,
    remainingHour: state.remainingHour,
    hourlyLimit: state.hourlyLimit,
    monthPercent: state.monthPercent,
    globalPercent: state.globalPercent,
    periodEnd: state.periodEnd.toISOString(),
  }
}
