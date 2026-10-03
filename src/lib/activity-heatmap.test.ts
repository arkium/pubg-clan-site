import { describe, expect, it } from 'vitest'

import { activityByDay, activityLevel, busiestSlot, plural, slotLabel } from '@/lib/activity-heatmap'

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
