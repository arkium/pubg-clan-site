import { describe, expect, it } from 'vitest'

import {
  axisGap,
  axisHeading,
  axisOfLine,
  axisPivot,
  axisSegment,
  axisThrough,
  cardinalBetween,
  clampAxisOffset,
  distanceToLine,
  isNearAxis,
  lineCrossesCircle,
  lineReferencePoint,
  projectOnLine,
  rotateAxis,
  towardsCardinal,
} from './zone-reading-geometry'

/** Lecture de zone — géométrie (docs/features/lecture-de-zone.md). Carte de 8 000 m pour des comptes ronds. */
const SIZE = 8000
const horizontal = { start: { x: 0, y: 4000 }, end: { x: 8000, y: 4000 } }

describe('distances à la ligne de vol', () => {
  it('distance perpendiculaire et projection sur la droite prolongée', () => {
    expect(distanceToLine({ x: 1234, y: 4300 }, horizontal)).toBe(300)
    expect(projectOnLine({ x: 9000, y: 3000 }, horizontal)).toEqual({ x: 9000, y: 4000 })
    expect(distanceToLine({ x: 5, y: 5 }, { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } })).toBeCloseTo(Math.hypot(5, 5))
  })

  it('repère « ligne » : le pied sur la ligne quand elle traverse le cercle, sinon le bord le plus proche', () => {
    expect(lineReferencePoint({ x: 2000, y: 3500, r: 800 }, horizontal)).toEqual({ x: 2000, y: 4000 })
    expect(lineReferencePoint({ x: 2000, y: 2000, r: 500 }, horizontal)).toEqual({ x: 2000, y: 2500 })
    expect(lineCrossesCircle(horizontal, { x: 2000, y: 3500, r: 500 })).toBe(true)
    expect(lineCrossesCircle(horizontal, { x: 2000, y: 3400, r: 500 })).toBe(false)
  })
})

describe('axe d’une ligne : angle dans [0, 180) et décalage depuis le centre', () => {
  it('le même axe quel que soit le sens de vol', () => {
    const eastward = axisOfLine(horizontal, SIZE)
    const westward = axisOfLine({ start: horizontal.end, end: horizontal.start }, SIZE)
    expect(eastward).toEqual({ angleDeg: 0, offset: 0 })
    expect(westward.angleDeg).toBe(0)
    expect(westward.offset).toBeCloseTo(0)
    const south = axisOfLine({ start: { x: 0, y: 5000 }, end: { x: 8000, y: 5000 } }, SIZE)
    expect(south.offset).toBe(1000)
  })

  it('l’écart replie les angles proches de 0° et 180°, en retournant le décalage', () => {
    expect(axisGap({ angleDeg: 2, offset: 300 }, { angleDeg: 178, offset: -300 })).toEqual({ angle: 4, offset: 0 })
    expect(isNearAxis({ angleDeg: 178, offset: -300 }, { angleDeg: 2, offset: 300 }, SIZE)).toBe(true)
    expect(isNearAxis({ angleDeg: 10, offset: 300 }, { angleDeg: 2, offset: 300 }, SIZE)).toBe(false)
    expect(isNearAxis({ angleDeg: 2, offset: 900 }, { angleDeg: 2, offset: 300 }, SIZE)).toBe(false)
  })

  it('tourner passe par 180° sans changer de droite', () => {
    expect(rotateAxis({ angleDeg: 170, offset: 400 }, 15)).toEqual({ angleDeg: 5, offset: -400 })
    expect(rotateAxis({ angleDeg: 5, offset: 400 }, -15)).toEqual({ angleDeg: 170, offset: -400 })
    expect(rotateAxis({ angleDeg: 30, offset: 400 }, 15)).toEqual({ angleDeg: 45, offset: 400 })
  })

  it('un axe passe par le point donné, son pied est le point le plus proche du centre', () => {
    const axis = axisThrough({ x: 4000, y: 5000 }, 0, SIZE)
    expect(axis).toEqual({ angleDeg: 0, offset: 1000 })
    expect(axisPivot(axis, SIZE)).toEqual({ x: 4000, y: 5000 })
    expect(clampAxisOffset(9999, SIZE)).toBe(3600)
  })

  it('le segment est découpé par la carte, et vaut null hors carte', () => {
    const segment = axisSegment({ angleDeg: 45, offset: 0 }, SIZE)
    expect(segment?.start.x).toBeCloseTo(0)
    expect(segment?.start.y).toBeCloseTo(0)
    expect(segment?.end.x).toBeCloseTo(8000)
    expect(segment?.end.y).toBeCloseTo(8000)
    expect(axisSegment({ angleDeg: 0, offset: 5000 }, SIZE)).toBeNull()
  })

  it('cap et direction en français', () => {
    expect(axisHeading({ angleDeg: 45, offset: 0 })).toBe(135)
    expect(cardinalBetween({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe('sud')
    expect(cardinalBetween({ x: 0, y: 0 }, { x: 100, y: -100 })).toBe('nord-est')
    expect(towardsCardinal('est')).toBe('vers l’est')
    expect(towardsCardinal('sud-est')).toBe('vers le sud-est')
  })
})
