import { describe, expect, it } from 'vitest'

import { getPeriodKey, lastWeekKeys, periodsToRecalculate, previousPeriodReference } from '@/lib/pubg-telemetry/period-keys'

// Dates locales (sans « Z ») : les clés suivent l'heure du serveur, comme l'écriture des agrégats.
const at = (value: string) => new Date(value)

describe('clés de période', () => {
  it('semaine ISO, mois civil, « tous »', () => {
    expect(getPeriodKey('week', at('2026-10-28T12:00:00'))).toBe('week-2026-44')
    expect(getPeriodKey('month', at('2026-10-28T12:00:00'))).toBe('month-2026-10')
    expect(getPeriodKey('all', at('2026-10-28T12:00:00'))).toBe('all-time')
  })

  it('l’année d’une semaine est son année ISO, au passage d’année', () => {
    expect(getPeriodKey('week', at('2027-01-01T12:00:00'))).toBe('week-2026-53')
    expect(getPeriodKey('week', at('2027-01-04T12:00:00'))).toBe('week-2027-01')
    expect(getPeriodKey('week', at('2025-12-30T12:00:00'))).toBe('week-2026-01')
  })

  it('les 8 dernières semaines, dans l’ordre et continues au passage d’année', () => {
    expect(lastWeekKeys(at('2026-10-28T12:00:00'), 8)).toEqual([
      'week-2026-37',
      'week-2026-38',
      'week-2026-39',
      'week-2026-40',
      'week-2026-41',
      'week-2026-42',
      'week-2026-43',
      'week-2026-44',
    ])
    expect(lastWeekKeys(at('2027-01-05T12:00:00'), 3)).toEqual(['week-2026-52', 'week-2026-53', 'week-2027-01'])
    expect(lastWeekKeys(at('2026-10-28T12:00:00'), 0)).toHaveLength(1)
    expect(lastWeekKeys(at('2026-10-28T12:00:00'), 100)).toHaveLength(52)
  })

  it('période précédente : la semaine d’avant, le mois d’avant, rien pour « tous »', () => {
    expect(getPeriodKey('week', previousPeriodReference('week', at('2026-10-28T12:00:00'))!)).toBe('week-2026-43')
    expect(getPeriodKey('month', previousPeriodReference('month', at('2026-10-31T12:00:00'))!)).toBe('month-2026-09')
    expect(getPeriodKey('month', previousPeriodReference('month', at('2026-03-01T12:00:00'))!)).toBe('month-2026-02')
    expect(previousPeriodReference('all', at('2026-10-28T12:00:00'))).toBeNull()
  })
})

describe('périodes à recalculer', () => {
  const keys = (date: string) => periodsToRecalculate(at(date)).map((entry) => getPeriodKey(entry.period, entry.referenceDate))

  it('mercredi : semaine, mois et « tous » courants', () => {
    expect(keys('2026-10-28T12:00:00')).toEqual(['week-2026-44', 'month-2026-10', 'all-time'])
  })

  it('lundi et mardi : la semaine précédente en plus ; pas le mercredi', () => {
    expect(keys('2026-10-26T08:00:00')).toEqual(['week-2026-44', 'week-2026-43', 'month-2026-10', 'all-time'])
    expect(keys('2026-10-27T23:00:00')).toEqual(['week-2026-44', 'week-2026-43', 'month-2026-10', 'all-time'])
  })

  it('les 1er et 2 du mois : le mois précédent en plus ; pas le 3', () => {
    expect(keys('2026-12-01T08:00:00')).toEqual(['week-2026-49', 'week-2026-48', 'month-2026-12', 'month-2026-11', 'all-time'])
    expect(keys('2026-12-03T08:00:00')).toEqual(['week-2026-49', 'month-2026-12', 'all-time'])
  })
})
