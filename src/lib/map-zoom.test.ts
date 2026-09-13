import { describe, expect, it } from 'vitest'

import {
  MAP_ZOOM_DEFAULT_MAX,
  MAP_ZOOM_MIN,
  clampMapZoom,
  formatMapZoom,
  stepMapZoom,
  wheelZoomDirection,
} from './map-zoom'

describe('map-zoom', () => {
  it('progresse par paliers de ×0,5 et reste borné', () => {
    expect(stepMapZoom(1, 1)).toBe(1.5)
    expect(stepMapZoom(1.5, -1)).toBe(1)
    expect(stepMapZoom(MAP_ZOOM_MIN, -1)).toBe(MAP_ZOOM_MIN)
    expect(stepMapZoom(MAP_ZOOM_DEFAULT_MAX, 1)).toBe(MAP_ZOOM_DEFAULT_MAX)
  })

  it('accepte un plafond propre à la carte', () => {
    expect(stepMapZoom(4, 1, 8)).toBe(4.5)
    expect(stepMapZoom(8, 1, 8)).toBe(8)
    expect(clampMapZoom(12, 8)).toBe(8)
  })

  it('ramène une valeur invalide au zoom minimal', () => {
    expect(clampMapZoom(Number.NaN)).toBe(MAP_ZOOM_MIN)
    expect(clampMapZoom(0.2)).toBe(MAP_ZOOM_MIN)
  })

  it('molette vers le haut = rapprocher, sans défilement vertical = rien', () => {
    expect(wheelZoomDirection(-120)).toBe(1)
    expect(wheelZoomDirection(53)).toBe(-1)
    expect(wheelZoomDirection(0)).toBeNull()
  })

  it('formate le libellé à la française', () => {
    expect(formatMapZoom(1)).toBe('1×')
    expect(formatMapZoom(1.5)).toBe('1,5×')
  })
})
