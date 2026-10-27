import { describe, expect, it } from 'vitest'

import { activeSessionDays, activityByDay, activityLevel, busiestSlot, parisSlotOf, plural, slotLabel } from '@/lib/activity-heatmap'

describe('parisSlotOf / activeSessionDays — heure de Paris, quel que soit le fuseau du serveur', () => {
  it('jour et heure de Paris, en été comme en hiver (le serveur de production est en UTC)', () => {
    // Samedi 24 octobre 2026, 19:30 UTC = 21:30 à Paris (heure d'été).
    expect(parisSlotOf(new Date('2026-10-24T19:30:00Z'))).toEqual({ dayIndex: 5, hour: 21 })
    // Lundi 26 octobre 2026, 23:30 UTC = mardi 00:30 à Paris (heure d'hiver).
    expect(parisSlotOf(new Date('2026-10-26T23:30:00Z'))).toEqual({ dayIndex: 1, hour: 0 })
  })

  it('jours actifs = soirées distinctes : une soirée qui passe minuit compte une fois', () => {
    // Samedi 22 h et dimanche 1 h 30 (Paris) : même soirée ; dimanche 21 h : une autre.
    const playedAt = [new Date('2026-10-24T20:00:00Z'), new Date('2026-10-25T00:30:00Z'), new Date('2026-10-25T20:00:00Z')]
    expect(activeSessionDays(playedAt)).toBe(2)
    expect(activeSessionDays([])).toBe(0)
  })
})

describe('activityLevel', () => {
  it('0 sans partie, puis quatre quarts du créneau le plus joué', () => {
    expect(activityLevel(0, 8)).toBe(0)
    expect(activityLevel(3, 0)).toBe(0)
    expect(activityLevel(1, 8)).toBe(1)
    expect(activityLevel(2, 8)).toBe(1)
    expect(activityLevel(4, 8)).toBe(2)
    expect(activityLevel(6, 8)).toBe(3)
    expect(activityLevel(7, 8)).toBe(4)
    expect(activityLevel(8, 8)).toBe(4)
  })
})

describe('activityByDay et busiestSlot', () => {
  const cells = [
    { dayIndex: 5, hour: 21, count: 6 },
    { dayIndex: 5, hour: 22, count: 4 },
    { dayIndex: 0, hour: 20, count: 6 },
    { dayIndex: 6, hour: 23, count: 1 },
  ]

  it('totaux par jour, lundi en premier', () => {
    expect(activityByDay(cells)).toEqual([6, 0, 0, 0, 0, 10, 1])
  })

  it('créneau le plus joué, le plus tôt dans la semaine à égalité', () => {
    expect(busiestSlot(cells)).toEqual({ dayIndex: 0, hour: 20, count: 6 })
    expect(busiestSlot([])).toBeNull()
    expect(slotLabel({ dayIndex: 5, hour: 23, count: 1 })).toBe('Samedi, 23h–00h')
  })

  it('pluriel', () => {
    expect(plural(1, 'partie')).toBe('1 partie')
    expect(plural(3, 'jour')).toBe('3 jours')
  })
})
