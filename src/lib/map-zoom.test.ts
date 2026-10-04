import { describe, expect, it } from 'vitest'

import {
  MAP_ZOOM_DEFAULT_MAX,
  MAP_ZOOM_MIN,
  clampMapZoom,
  formatMapZoom,
  pinchMapZoom,
  snapMapZoom,
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

  it('pincement : zoom de départ × rapport des écarts, borné au plafond de la carte', () => {
    expect(pinchMapZoom(1, 100, 200, 8)).toBe(2)
    expect(pinchMapZoom(2, 100, 50, 8)).toBe(1)
    expect(pinchMapZoom(4, 100, 400, 8)).toBe(8)
    expect(pinchMapZoom(1, 100, 30, 8)).toBe(MAP_ZOOM_MIN)
    expect(pinchMapZoom(3, 100, 1000)).toBe(MAP_ZOOM_DEFAULT_MAX)
  })

  it('pincement : écart de départ nul ou valeur invalide → zoom inchangé', () => {
    expect(pinchMapZoom(2.5, 0, 200, 8)).toBe(2.5)
    expect(pinchMapZoom(2.5, 100, Number.NaN, 8)).toBe(2.5)
  })

  it('au lâcher, le zoom se cale sur le palier de ×0,5 le plus proche', () => {
    expect(snapMapZoom(2.37, 8)).toBe(2.5)
    expect(snapMapZoom(2.2, 8)).toBe(2)
    expect(snapMapZoom(7.9, 8)).toBe(8)
    expect(snapMapZoom(0.8, 8)).toBe(MAP_ZOOM_MIN)
    expect(snapMapZoom(Number.NaN, 8)).toBe(MAP_ZOOM_MIN)
    expect(formatMapZoom(8)).toBe('8×')
  })
})
