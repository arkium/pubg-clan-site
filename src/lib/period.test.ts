import { describe, expect, it } from 'vitest'

import {
  MATCH_PERIODS,
  PERIOD_LABELS,
  STANDARD_PERIODS,
  getPeriodRange,
  getPeriodStart,
  parsePeriod,
  periodOptions,
  resolvePagePeriod,
} from '@/lib/period'

/**
 * Période des pages joueurs — docs/TODO/sticky.md §4.C et §7.A. Les dates sont construites en
 * heure locale, comme le calcul : le test ne dépend pas du fuseau de la machine.
 */

const local = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0) =>
  new Date(year, month - 1, day, hour, minute, second, ms)

describe('bornes calendaires', () => {
  it('la semaine va du lundi 00:00 au lundi suivant 00:00 (exclu)', () => {
    // Jeudi 24 septembre 2026.
    expect(getPeriodRange('week', local(2026, 9, 24, 15))).toEqual({
      start: local(2026, 9, 21),
      end: local(2026, 9, 28),
    })
  })

  it('lundi 00:00 est dans la semaine qui commence ; dimanche 23:59 dans la précédente', () => {
    expect(getPeriodRange('week', local(2026, 9, 21))?.start).toEqual(local(2026, 9, 21))
    expect(getPeriodRange('week', local(2026, 9, 27, 23, 59, 59, 999))?.start).toEqual(local(2026, 9, 21))
    expect(getPeriodRange('week', local(2026, 9, 28))?.start).toEqual(local(2026, 9, 28))
  })

  it('une semaine à cheval sur deux années commence le lundi de décembre', () => {
    // Jeudi 1er janvier 2026.
    expect(getPeriodRange('week', local(2026, 1, 1, 12))).toEqual({
      start: local(2025, 12, 29),
      end: local(2026, 1, 5),
    })
  })

  it('le mois est le mois civil', () => {
    expect(getPeriodRange('month', local(2026, 9, 24))).toEqual({ start: local(2026, 9, 1), end: local(2026, 10, 1) })
    expect(getPeriodRange('month', local(2026, 12, 31, 23, 59))).toEqual({
      start: local(2026, 12, 1),
      end: local(2027, 1, 1),
    })
  })

  it('« Mois dernier » et « Il y a 2 mois » sont les mois civils précédents, année comprise', () => {
    expect(getPeriodRange('month-1', local(2026, 9, 24))).toEqual({ start: local(2026, 8, 1), end: local(2026, 9, 1) })
    expect(getPeriodRange('month-2', local(2026, 9, 24))).toEqual({ start: local(2026, 7, 1), end: local(2026, 8, 1) })
    expect(getPeriodRange('month-1', local(2026, 1, 15))).toEqual({ start: local(2025, 12, 1), end: local(2026, 1, 1) })
    expect(getPeriodRange('month-2', local(2026, 1, 15))).toEqual({ start: local(2025, 11, 1), end: local(2025, 12, 1) })
  })

  it('« Tous » n’a pas de borne', () => {
    expect(getPeriodRange('all', local(2026, 9, 24))).toBeNull()
    expect(getPeriodStart('all', local(2026, 9, 24))).toBeNull()
    expect(getPeriodStart('week', local(2026, 9, 24))).toEqual(local(2026, 9, 21))
  })
})

describe('libellés', () => {
  it('suivent les décisions du 2026-09-25', () => {
    expect(PERIOD_LABELS).toEqual({
      week: 'Semaine',
      month: 'Mois',
      all: 'Tous',
      'month-1': 'Mois dernier',
      'month-2': 'Il y a 2 mois',
    })
    expect(periodOptions(STANDARD_PERIODS)).toEqual([
      { value: 'week', label: 'Semaine' },
      { value: 'month', label: 'Mois' },
      { value: 'all', label: 'Tous' },
    ])
    expect(periodOptions(MATCH_PERIODS).map((option) => option.label)).toEqual([
      'Semaine',
      'Mois',
      'Mois dernier',
      'Il y a 2 mois',
    ])
  })
})

describe('parsePeriod', () => {
  it('retombe sur le défaut pour une valeur absente, inconnue ou non proposée', () => {
    expect(parsePeriod('month', STANDARD_PERIODS, 'week')).toBe('month')
    expect(parsePeriod(null, STANDARD_PERIODS, 'week')).toBe('week')
    expect(parsePeriod('year', STANDARD_PERIODS, 'week')).toBe('week')
    expect(parsePeriod('all', MATCH_PERIODS, 'week')).toBe('week')
  })
})

describe('resolvePagePeriod — l’URL fait foi, puis la mémoire de la visite, puis le défaut', () => {
  const base = { allowed: STANDARD_PERIODS, fallback: 'week' as const }

  it('l’URL l’emporte sur la mémoire', () => {
    expect(resolvePagePeriod({ ...base, urlValue: 'all', rememberedValue: 'month' })).toEqual({
      period: 'all',
      source: 'url',
    })
  })

  it('la mémoire sert quand l’URL n’a pas de période valide', () => {
    expect(resolvePagePeriod({ ...base, urlValue: null, rememberedValue: 'month' })).toEqual({
      period: 'month',
      source: 'memory',
    })
    expect(resolvePagePeriod({ ...base, urlValue: 'bogus', rememberedValue: 'month' }).source).toBe('memory')
  })

  it('une période mémorisée que la page ne propose pas est ignorée', () => {
    expect(
      resolvePagePeriod({ allowed: MATCH_PERIODS, fallback: 'week', urlValue: null, rememberedValue: 'all' })
    ).toEqual({ period: 'week', source: 'default' })
  })

  it('le défaut de la page sinon', () => {
    expect(resolvePagePeriod({ ...base, urlValue: null, rememberedValue: null })).toEqual({
      period: 'week',
      source: 'default',
    })
  })
})
