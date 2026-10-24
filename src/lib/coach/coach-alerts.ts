import { coachBudgetAlert, coachModelNoticeAlert, coachProviderErrorsAlert } from '@/lib/admin-alerts/messages'
import { sendAdminAlert } from '@/lib/admin-alerts/send'
import { getCoachSettings } from '@/lib/coach/coach-config'
import { microUsdToEur } from '@/lib/coach/coach-cost'
import { getCoachModel, nextCoachModelPriceChange, type CoachModelDefinition } from '@/lib/coach/coach-models'
import { prisma } from '@/lib/prisma'

/**
 * Alertes du Coach IA vers le salon Discord d'administration (docs/TODO/chatbot-ia.md §9) : plafond global à 80 % puis
 * atteint, erreurs répétées du fournisseur, arrêt annoncé ou changement de prix du modèle actif. Les décisions sont
 * pures (testées seules) ; l'envoi se souvient de ce qui est parti dans `AppConfig` pour ne pas sonner deux fois.
 * Aucune de ces fonctions ne lève : une alerte suit une action déjà faite.
 */

export type CoachBudgetLevel = 80 | 100

/** Niveau à annoncer, ou null : jamais deux fois le même niveau, jamais en arrière, jamais sans plafond. */
export function decideCoachBudgetAlert(input: { percent: number; budgetMicroUsd: number; announced: CoachBudgetLevel | null }): CoachBudgetLevel | null {
  if (input.budgetMicroUsd <= 0) return null
  const level: CoachBudgetLevel | null = input.percent >= 100 ? 100 : input.percent >= 80 ? 80 : null
  if (level === null) return null
  if (input.announced !== null && input.announced >= level) return null
  return level
}

/** Erreurs du fournisseur sur la fenêtre avant d'alerter, et silence après une alerte. */
export const COACH_ERROR_ALERT = { threshold: 5, windowMinutes: 15, quietHours: 6 } as const

export function decideCoachErrorsAlert(input: { errorsInWindow: number; quietUntil: Date | null; now: Date }): boolean {
  if (input.errorsInWindow < COACH_ERROR_ALERT.threshold) return false
  return !input.quietUntil || input.quietUntil <= input.now
}

/** Avis sur le modèle actif à envoyer dans les `horizonDays` jours : arrêt annoncé ou changement de prix. */
export const COACH_MODEL_NOTICE_HORIZON_DAYS = 30

export type CoachModelNotice = { kind: 'shutdown' | 'price'; date: string }

export function decideCoachModelNotice(model: CoachModelDefinition, now: Date, horizonDays = COACH_MODEL_NOTICE_HORIZON_DAYS): CoachModelNotice | null {
  const today = now.toISOString().slice(0, 10)
  const horizon = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const within = (iso: string) => iso >= today && iso <= horizon
  if (model.shutdownNotBefore && within(model.shutdownNotBefore)) return { kind: 'shutdown', date: model.shutdownNotBefore }
  const price = nextCoachModelPriceChange(model, now)
  if (price && within(price.from)) return { kind: 'price', date: price.from }
  return null
}

const BUDGET_KEY = (periodStart: Date) => `coach_alert_budget_${periodStart.toISOString().slice(0, 7)}`
const ERRORS_KEY = 'coach_alert_errors_quiet_until'
const MODEL_KEY = (model: string, notice: CoachModelNotice) => `coach_alert_model_${model}_${notice.kind}_${notice.date}`

async function readConfig(key: string): Promise<string | null> {
  const row = await prisma.appConfig.findUnique({ where: { key }, select: { value: true } })
  return row?.value ?? null
}

async function writeConfig(key: string, value: string): Promise<void> {
  await prisma.appConfig.upsert({ where: { key }, update: { value }, create: { key, value } })
}

function warn(label: string, error: unknown) {
  console.warn(`[coach/alerts] ${label} :`, error instanceof Error ? error.message : error)
}

/** Après une question facturée : plafond global à 80 % puis atteint, une fois par mois et par niveau. */
export async function notifyCoachBudgetIfNeeded(input: {
  globalSpentMicroUsd: number
  globalBudgetMicroUsd: number
  periodStart: Date
  periodEnd: Date
  usdEurRate: number
}): Promise<void> {
  try {
    const key = BUDGET_KEY(input.periodStart)
    const stored = await readConfig(key)
    const announced = stored === '100' ? 100 : stored === '80' ? 80 : null
    const percent = input.globalBudgetMicroUsd > 0 ? Math.round((input.globalSpentMicroUsd / input.globalBudgetMicroUsd) * 100) : 100
    const level = decideCoachBudgetAlert({ percent, budgetMicroUsd: input.globalBudgetMicroUsd, announced })
    if (level === null) return
    await writeConfig(key, String(level))
    await sendAdminAlert(
      'coach_budget',
      coachBudgetAlert({
        level,
        spentEur: microUsdToEur(input.globalSpentMicroUsd, input.usdEurRate),
        budgetEur: microUsdToEur(input.globalBudgetMicroUsd, input.usdEurRate),
        periodEnd: input.periodEnd,
      })
    )
  } catch (error) {
    warn('alerte du plafond non envoyée', error)
  }
}

/** Après une réponse en erreur : au-delà du seuil sur la fenêtre, une alerte puis silence pendant `quietHours`. */
export async function notifyCoachProviderErrorsIfNeeded(now: Date = new Date(), lastMessage: string | null = null): Promise<void> {
  try {
    const windowStart = new Date(now.getTime() - COACH_ERROR_ALERT.windowMinutes * 60 * 1000)
    const [errorsInWindow, quiet] = await Promise.all([
      prisma.coachUsage.count({ where: { status: 'error', createdAt: { gte: windowStart } } }),
      readConfig(ERRORS_KEY),
    ])
    const quietUntil = quiet ? new Date(quiet) : null
    if (!decideCoachErrorsAlert({ errorsInWindow, quietUntil: quietUntil && !Number.isNaN(quietUntil.getTime()) ? quietUntil : null, now })) return
    await writeConfig(ERRORS_KEY, new Date(now.getTime() + COACH_ERROR_ALERT.quietHours * 60 * 60 * 1000).toISOString())
    await sendAdminAlert('coach_provider_errors', coachProviderErrorsAlert({ errors: errorsInWindow, windowMinutes: COACH_ERROR_ALERT.windowMinutes, lastMessage }))
  } catch (error) {
    warn('alerte des erreurs non envoyée', error)
  }
}

/** Chaque matin (veille) : arrêt ou changement de prix du modèle actif dans les 30 jours, une fois par échéance. */
export async function notifyCoachModelNoticeIfNeeded(now: Date = new Date()): Promise<void> {
  try {
    const settings = await getCoachSettings()
    const model = getCoachModel(settings.model)
    if (!model) return
    const notice = decideCoachModelNotice(model, now)
    if (!notice) return
    const key = MODEL_KEY(model.id, notice)
    if ((await readConfig(key)) === '1') return
    await writeConfig(key, '1')
    await sendAdminAlert('coach_model_notice', coachModelNoticeAlert({ model, notice, now }))
  } catch (error) {
    warn('avis sur le modèle non envoyé', error)
  }
}
