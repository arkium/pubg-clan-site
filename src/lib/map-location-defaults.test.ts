import { describe, expect, it } from 'vitest'

import { DEFAULT_MAP_LOCATIONS } from '@/lib/map-location-defaults'

describe('default map locations', () => {
  it('contains valid and unique locations for the eleven map assets', () => {
    expect(Object.keys(DEFAULT_MAP_LOCATIONS)).toHaveLength(11)

    const locations = Object.values(DEFAULT_MAP_LOCATIONS).flat()
    expect(locations).toHaveLength(179)
    expect(new Set(locations.map((location) => location.id)).size).toBe(locations.length)

    for (const location of locations) {
      expect(location.name.length).toBeGreaterThan(0)
      expect(location.xPct).toBeGreaterThanOrEqual(0)
      expect(location.xPct).toBeLessThanOrEqual(100)
      expect(location.yPct).toBeGreaterThanOrEqual(0)
      expect(location.yPct).toBeLessThanOrEqual(100)
      expect(location.radiusPct).toBeGreaterThanOrEqual(0.25)
      expect(location.radiusPct).toBeLessThanOrEqual(25)
      expect(location.enabled).toBe(true)
    }
  })
})