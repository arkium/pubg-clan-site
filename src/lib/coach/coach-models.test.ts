import { describe, expect, it } from 'vitest'

import {
  COACH_DEFAULT_MODEL_ID,
  COACH_MODELS,
  coachModelBadges,
  coachModelPriceAt,
  formatCoachDate,
  getCoachModel,
  isCoachModelId,
  nextCoachModelPriceChange,
} from '@/lib/coach/coach-models'

const at = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('catalogue des modèles du Coach IA', () => {
  it('propose le modèle par défaut et des identifiants uniques', () => {
    expect(getCoachModel(COACH_DEFAULT_MODEL_ID)?.id).toBe('gemini-3.5-flash-lite')
    expect(new Set(COACH_MODELS.map((model) => model.id)).size).toBe(COACH_MODELS.length)
    expect(isCoachModelId('gemini-2.5-flash-lite')).toBe(false)
    expect(isCoachModelId(undefined)).toBe(false)
    expect(getCoachModel('inconnu')).toBeNull()
  })

  it('range les tarifs par date croissante et sait lequel s’applique', () => {
    for (const model of COACH_MODELS) {
      const froms = model.prices.map((price) => price.from)
      expect([...froms].sort()).toEqual(froms)
    }
    const flash = getCoachModel('gemini-3.8-flash')!
    expect(coachModelPriceAt(flash, at('2026-12-31')).inputUsdPerM).toBe(0.75)
    expect(coachModelPriceAt(flash, at('2027-01-01')).inputUsdPerM).toBe(1.5)
    expect(nextCoachModelPriceChange(flash, at('2026-10-24'))?.from).toBe('2027-01-01')
    expect(nextCoachModelPriceChange(flash, at('2027-01-01'))).toBeNull()
    // Avant le premier tarif, c'est lui qui vaut : jamais de prix indéfini.
    expect(coachModelPriceAt(flash, at('2020-01-01')).inputUsdPerM).toBe(0.75)
  })

  it('écrit les dates à la française', () => {
    expect(formatCoachDate('2027-01-01')).toBe('1er janvier 2027')
    expect(formatCoachDate('2027-05-07')).toBe('7 mai 2027')
  })

  it('décrit chaque modèle par ses pastilles', () => {
    expect(coachModelBadges(getCoachModel('gemini-3.5-flash-lite')!, at('2026-10-24'))).toEqual([{ tone: 'pos', label: 'Recommandé' }])
    expect(coachModelBadges(getCoachModel('gemini-3.1-flash-lite')!, at('2026-10-24'))).toEqual([
      { tone: 'neg', label: 'Arrêt au plus tôt le 7 mai 2027' },
    ])
    expect(coachModelBadges(getCoachModel('gemini-3.8-flash')!, at('2026-10-24'))).toEqual([
      { tone: 'pos', label: 'Recommandé' },
      { tone: 'warn', label: 'Prix doublé au 1er janvier 2027' },
    ])
    expect(coachModelBadges(getCoachModel('gemini-3.8-flash')!, at('2027-02-01'))).toEqual([{ tone: 'pos', label: 'Recommandé' }])
  })
})
