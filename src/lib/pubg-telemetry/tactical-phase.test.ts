import { describe, expect, it } from 'vitest'

import {
  isInTacticalPhase,
  parseTacticalPhase,
  tacticalPhaseNumbers,
} from '@/lib/tactical-phase'

describe('tactical phases', () => {
  it('parses only supported phase groups', () => {
    expect(parseTacticalPhase('early')).toBe('early')
    expect(parseTacticalPhase('2')).toBe('all')
    expect(parseTacticalPhase(null)).toBe('all')
  })

  it('groups stable and shrinking phases into tactical periods', () => {
    expect(tacticalPhaseNumbers('early')).toEqual([1, 2])
    expect(isInTacticalPhase(1.5, 'early')).toBe(true)
    expect(isInTacticalPhase(2.5, 'early')).toBe(true)
    expect(isInTacticalPhase(3, 'early')).toBe(false)
    expect(isInTacticalPhase(4.5, 'mid')).toBe(true)
    expect(isInTacticalPhase(8, 'late')).toBe(true)
  })
})