import { describe, expect, it } from 'vitest'

import {
  coachCostMicroUsd,
  coachQuestionsForBudget,
  estimatedCoachCostPerQuestionEur,
  eurToMicroUsd,
  microUsdToEur,
} from '@/lib/coach/coach-cost'
import { getCoachModel } from '@/lib/coach/coach-models'

const lite = getCoachModel('gemini-3.5-flash-lite')!
const flash = getCoachModel('gemini-3.8-flash')!
const at = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('coût d’une question du Coach IA', () => {
  it('compte en micro-dollars entiers, réflexion comprise dans la sortie', () => {
    // Question mesurée au lot 0 : 1 400 tokens en entrée, 150 en sortie → 420 + 375 µ$.
    expect(coachCostMicroUsd(lite, 1400, 150, at('2026-10-24'))).toBe(795)
    expect(coachCostMicroUsd(lite, 0, 0)).toBe(0)
    expect(coachCostMicroUsd(lite, -5, -5)).toBe(0)
  })

  it('suit le changement de tarif daté', () => {
    expect(coachCostMicroUsd(flash, 1000, 1000, at('2026-12-31'))).toBe(4500)
    expect(coachCostMicroUsd(flash, 1000, 1000, at('2027-01-01'))).toBe(9000)
  })

  it('convertit en euros et réciproquement', () => {
    expect(microUsdToEur(1_000_000, 0.86)).toBeCloseTo(0.86, 10)
    expect(eurToMicroUsd(2, 0.86)).toBe(2_325_581)
    expect(eurToMicroUsd(2, 0)).toBe(0)
  })

  it('estime la question type et le nombre de questions d’un budget', () => {
    // 5 000 × 0,30 + 300 × 2,50 = 2 250 µ$ → 0,001935 €.
    const perQuestion = estimatedCoachCostPerQuestionEur(lite, 0.86, at('2026-10-24'))
    expect(perQuestion).toBeCloseTo(0.001935, 6)
    expect(coachQuestionsForBudget(2, perQuestion)).toBe(1033)
    expect(coachQuestionsForBudget(2, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})
