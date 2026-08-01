import { describe, expect, it } from 'vitest'

import { getLastWeekKeys } from '@/lib/dashboard-progression'

describe('dashboard progression', () => {
  it('returns eight consecutive ISO week keys by default', () => {
    expect(getLastWeekKeys(new Date('2026-08-01T12:00:00.000Z'))).toEqual([
      'week-2026-24',
      'week-2026-25',
      'week-2026-26',
      'week-2026-27',
      'week-2026-28',
      'week-2026-29',
      'week-2026-30',
      'week-2026-31',
    ])
  })

  it('keeps ISO week years correct across New Year', () => {
    expect(getLastWeekKeys(new Date('2027-01-05T12:00:00.000Z'), 3)).toEqual([
      'week-2026-52',
      'week-2026-53',
      'week-2027-01',
    ])
  })

  it('clamps the requested window between one and 52 weeks', () => {
    expect(getLastWeekKeys(new Date('2026-08-01T12:00:00.000Z'), 0)).toHaveLength(1)
    expect(getLastWeekKeys(new Date('2026-08-01T12:00:00.000Z'), 100)).toHaveLength(52)
  })
})