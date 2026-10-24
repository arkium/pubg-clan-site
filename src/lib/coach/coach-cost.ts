import { coachModelPriceAt, type CoachModelDefinition } from '@/lib/coach/coach-models'

/**
 * Coût d'une question du Coach IA (docs/TODO/chatbot-ia.md §2). Les montants vivent en **micro-dollars entiers**
 * (`CoachUsage.costMicroUsd`) : un prix en dollars par million de tokens vaut exactement ce prix en micro-dollars
 * par token, donc aucune division avant la conversion en euros. La sortie comprend la réflexion, facturée au même tarif.
 */

export const MICRO_USD_PER_USD = 1_000_000

/** Hypothèse de production d'une question type (§2.3) : vrais outils et historique, à remesurer au lot 9. */
export const COACH_TYPICAL_QUESTION = { tokensIn: 5000, tokensOut: 300 } as const

export function coachCostMicroUsd(
  model: CoachModelDefinition,
  tokensIn: number,
  tokensOut: number,
  at: Date = new Date()
): number {
  const price = coachModelPriceAt(model, at)
  return Math.round(Math.max(0, tokensIn) * price.inputUsdPerM + Math.max(0, tokensOut) * price.outputUsdPerM)
}

export function microUsdToEur(microUsd: number, usdEurRate: number): number {
  return (microUsd / MICRO_USD_PER_USD) * usdEurRate
}

export function eurToMicroUsd(eur: number, usdEurRate: number): number {
  if (usdEurRate <= 0) return 0
  return Math.round((eur / usdEurRate) * MICRO_USD_PER_USD)
}

/** Coût estimé en euros d'une question type avec ce modèle, pour la tuile d'administration. */
export function estimatedCoachCostPerQuestionEur(model: CoachModelDefinition, usdEurRate: number, at: Date = new Date()): number {
  return microUsdToEur(coachCostMicroUsd(model, COACH_TYPICAL_QUESTION.tokensIn, COACH_TYPICAL_QUESTION.tokensOut, at), usdEurRate)
}

/** Nombre de questions type qu'un budget en euros permet ; `Infinity` si la question ne coûte rien. */
export function coachQuestionsForBudget(budgetEur: number, costPerQuestionEur: number): number {
  if (costPerQuestionEur <= 0) return Number.POSITIVE_INFINITY
  return Math.floor(budgetEur / costPerQuestionEur)
}
