import { describe, expect, it } from 'vitest'

import { MORTAR_RANGE, MORTAR_SHOT_TIME_BOUNDS } from './mortar-game'
import {
  aimTime,
  deviationBar,
  deviationScale,
  elevationLabel,
  formatElevation,
  impactLabelPlacement,
  labelPlacement,
  seriesCountLabel,
  seriesDots,
  sliderPercent,
  verdictLabel,
  viewPercent,
} from './mortar-view'

describe('viewPercent', () => {
  it('toute la carte par défaut, ou un recadrage du guide', () => {
    expect(viewPercent({ x: 500, y: 300 })).toEqual({ left: 50, top: 50 })
    const crop = viewPercent({ x: 450, y: 150 }, { x: 400, y: 100, width: 500, height: 300 })
    expect(crop.left).toBe(10)
    expect(crop.top).toBeCloseTo(100 / 6)
  })
})

describe('labelPlacement', () => {
  it('du côté opposé à l’autre repère', () => {
    // Cible à droite : « Toi » à gauche, « Cible » à droite.
    expect(labelPlacement({ x: 400, y: 300 }, { x: 700, y: 320 }).side).toBe('left')
    expect(labelPlacement({ x: 700, y: 320 }, { x: 400, y: 300 }).side).toBe('right')
    // Cible au-dessous : « Toi » au-dessus, « Cible » au-dessous.
    expect(labelPlacement({ x: 500, y: 150 }, { x: 520, y: 450 }).side).toBe('above')
    expect(labelPlacement({ x: 520, y: 450 }, { x: 500, y: 150 }).side).toBe('below')
  })

  it('près d’un bord, un autre côté libre ; calage au bord pour rester dans la carte', () => {
    // Collé au bord gauche, la cible à droite : pas de place à gauche.
    expect(labelPlacement({ x: 60, y: 300 }, { x: 600, y: 300 })).toEqual({ side: 'above', align: 'start' })
    // Collé en haut, la cible au-dessous : pas de place au-dessus.
    expect(labelPlacement({ x: 500, y: 50 }, { x: 500, y: 500 }).side).toBe('left')
    expect(labelPlacement({ x: 960, y: 300 }, null)).toEqual({ side: 'above', align: 'end' })
    expect(labelPlacement({ x: 500, y: 40 }, null).side).toBe('below')
  })
})

describe('impactLabelPlacement', () => {
  it('de travers par rapport à la ligne de tir, jamais du côté de la cible', () => {
    const shooter = { x: 200, y: 300 }
    const target = { x: 600, y: 300 }
    expect(impactLabelPlacement(shooter, target, { x: 580, y: 300 }, 'right').side).toBe('below')
    expect(impactLabelPlacement(shooter, target, { x: 580, y: 300 }, 'below').side).toBe('above')
    expect(impactLabelPlacement({ x: 500, y: 100 }, { x: 500, y: 500 }, { x: 500, y: 480 }, 'below').side).toBe('right')
  })
})

describe('textes', () => {
  it('verdict, dénivelé, séries', () => {
    expect(verdictLabel('hit', 3)).toBe('Au but')
    expect(verdictLabel('short', -18)).toBe('Trop court de 18 m')
    expect(verdictLabel('long', 12)).toBe('Trop long de 12 m')
    expect(formatElevation(20)).toBe('+20 m')
    expect(formatElevation(-10)).toBe('−10 m')
    expect(elevationLabel(20)).toBe('Cible 20 m plus haute')
    expect(elevationLabel(-10)).toBe('Cible 10 m plus basse')
    expect(elevationLabel(0)).toBeNull()
    expect(seriesCountLabel(1)).toBe('1 série')
    expect(seriesCountLabel(41)).toBe('41 séries')
  })
})

describe('seriesDots', () => {
  it('au but, raté, en cours, à venir', () => {
    expect(seriesDots(['hit', 'short'], 2, 5)).toEqual(['hit', 'miss', 'current', 'pending', 'pending'])
    expect(seriesDots(['long', 'hit', 'hit'], null, 3)).toEqual(['miss', 'hit', 'hit'])
  })
})

describe('aimTime', () => {
  it('entier, borné aux temps plausibles de la route de fin de série', () => {
    expect(aimTime(1000, 1100)).toBe(MORTAR_SHOT_TIME_BOUNDS.min)
    expect(aimTime(1000, 13_400.6)).toBe(12_401)
    expect(aimTime(0, 60 * 60_000)).toBe(MORTAR_SHOT_TIME_BOUNDS.max)
  })
})

describe('barres d’écart', () => {
  it('échelle au plus grand écart (25 m au moins), barre de part et d’autre de l’axe', () => {
    expect(deviationScale([3, -4, 8])).toBe(25)
    expect(deviationScale([6, -22, 41])).toBe(45)
    expect(deviationBar(-18, 45)).toEqual({ short: 0.4, long: 0 })
    expect(deviationBar(90, 45)).toEqual({ short: 0, long: 1 })
    expect(deviationBar(0, 25)).toEqual({ short: 0, long: 0 })
  })
})

describe('sliderPercent', () => {
  it('121 m au début, 700 m à la fin', () => {
    expect(sliderPercent(MORTAR_RANGE.min)).toBe(0)
    expect(sliderPercent(MORTAR_RANGE.max)).toBe(100)
  })
})
