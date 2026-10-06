import { describe, expect, it } from 'vitest'

import {
  analyseZoneReading,
  bandExplanation,
  bandHeadline,
  closingVerdict,
  densestAxis,
  encodeAxisEntry,
  entriesNearAxis,
  finalZoneGrid,
  formatOutOfTen,
  gridCellCode,
  gridCellLabel,
  guidedCircles,
  practicalRule,
  topGridCells,
  type ZoneReadingClosingBar,
  type ZoneReadingMatchGeometry,
} from './zone-reading-analysis'

/**
 * Lecture de zone, onglet Analyse (docs/features/lecture-de-zone.md) : chaque titre vient des chiffres. La maquette
 * affirmait « 9 zones finales sur 10 dans la bande » ; les données réelles disent environ 1 sur 10 — les deux cas
 * doivent produire un titre juste.
 */

const SIZE = 8000
const line = { start: { x: 0, y: 4000 }, end: { x: 8000, y: 4000 } }

function match(final: { x: number; y: number }, circles = [{ x: final.x, y: 4100, r: 1900 }, { x: final.x, y: final.y, r: 1000 }]): ZoneReadingMatchGeometry {
  return { line, circles, final }
}

describe('analyseZoneReading', () => {
  it('distance médiane, bande de 200 m, premier cercle traversé', () => {
    const stats = analyseZoneReading([match({ x: 1000, y: 4100 }), match({ x: 2000, y: 4500 }), match({ x: 3000, y: 5000 })])
    expect(stats.matches).toBe(3)
    expect(stats.finalLineMedian).toBe(500)
    expect(stats.bandShare).toBeCloseTo(1 / 3)
    expect(stats.crossesFirstShare).toBe(1)
    expect(stats.firstCenterLineMedian).toBe(100)
    // Hasard : même ligne pour toutes les parties ici, donc même part.
    expect(stats.bandRandomShare).toBeCloseTo(1 / 3)
  })

  it('sens de fermeture : part des cercles plus proches de la ligne que le précédent', () => {
    const closer = match({ x: 1000, y: 4000 }, [
      { x: 1000, y: 5000, r: 1900 },
      { x: 1000, y: 4500, r: 1000 },
      { x: 1000, y: 4000, r: 600 },
    ])
    const away = match({ x: 1000, y: 5500 }, [
      { x: 1000, y: 4200, r: 1900 },
      { x: 1000, y: 4800, r: 1000 },
    ])
    const stats = analyseZoneReading([closer, away])
    expect(stats.closing[0]).toEqual({ circle: 2, share: 0.5, total: 2 })
    expect(stats.closing[1]).toEqual({ circle: 3, share: 1, total: 1 })
    expect(stats.closing[2].total).toBe(0)
  })

  it('règle pratique : le cercle doit précéder la zone finale ; repère ligne ramené dans le cercle', () => {
    const stats = analyseZoneReading([
      match({ x: 1000, y: 4000 }, [
        { x: 1000, y: 4600, r: 1900 },
        { x: 1000, y: 4000, r: 1000 },
      ]),
    ])
    expect(stats.rule[0]).toEqual({ circle: 1, center: 600, line: 0, total: 1 })
    // Le cercle 2 est la zone finale : il n'est pas compté.
    expect(stats.rule[1].total).toBe(0)
  })

  it('aucune partie : des zéros, pas d’erreur', () => {
    const stats = analyseZoneReading([])
    expect(stats.matches).toBe(0)
    expect(stats.bandRandomShare).toBeNull()
    expect(stats.closing.every((bar) => bar.total === 0)).toBe(true)
  })
})

describe('titres calculés', () => {
  it('la bande, sur dix parties', () => {
    expect(bandHeadline({ bandShare: 0.12 })).toBe('Seulement 1 zone finale sur 10 finit dans cette bande')
    expect(bandHeadline({ bandShare: 0.03 })).toBe('Moins d’une zone finale sur 10 finit dans cette bande')
    expect(bandHeadline({ bandShare: 0.36 })).toBe('Seulement 4 zones finales sur 10 finissent dans cette bande')
    expect(bandHeadline({ bandShare: 0.9 })).toBe('9 zones finales sur 10 finissent dans cette bande')
    expect(formatOutOfTen(0.07)).toBe('0,7 sur 10')
  })

  it('la bande face au hasard', () => {
    expect(bandExplanation({ bandShare: 0.12, bandRandomShare: 0.07 })).toBe(
      'Au hasard, 0,7 sur 10 y tomberaient déjà : la ligne de vol donne le premier cercle, pas la zone finale.'
    )
    expect(bandExplanation({ bandShare: 0.9, bandRandomShare: 0.07 })).toBe('Au hasard, ce serait 0,7 sur 10 : la ligne de vol attire la zone finale.')
  })

  it('sens de fermeture : le premier cercle, puis le hasard (données réelles du 2026-10-06)', () => {
    const real: ZoneReadingClosingBar[] = [0.47, 0.48, 0.48, 0.49, 0.5, 0.48, 0.49].map((share, index) => ({ circle: index + 2, share, total: 3000 }))
    expect(guidedCircles(real)).toBe(0)
    expect(closingVerdict({ closing: real, crossesFirstShare: 1 })).toBe('L’avion place le premier cercle. Ensuite, c’est le hasard.')
    const brief: ZoneReadingClosingBar[] = [0.96, 0.92, 0.76, 0.63, 0.58, 0.53, 0.5].map((share, index) => ({ circle: index + 2, share, total: 3000 }))
    expect(closingVerdict({ closing: brief, crossesFirstShare: 1 })).toBe('L’avion guide les 5 premiers cercles. Ensuite, c’est le hasard.')
    expect(closingVerdict({ closing: real, crossesFirstShare: 0.6 })).toBe('Les cercles se déplacent au hasard autour de la ligne de vol.')
  })

  it('règle pratique', () => {
    const row = (circle: number, center: number, line: number) => ({ circle, center, line, total: 100 })
    expect(practicalRule([row(1, 593, 1016), row(2, 310, 808), row(3, 184, 570), row(4, 102, 367)])).toBe(
      'Vise le centre du cercle, dès le premier. Viser la ligne de vol fait moins bien.'
    )
    expect(practicalRule([row(1, 600, 366), row(2, 311, 215), row(3, 183, 150), row(4, 101, 106)])).toBe(
      'Jusqu’au 3e cercle, vise le point de la ligne de vol le plus proche du centre. À partir du 4e, vise le centre.'
    )
    expect(practicalRule([row(1, 600, 366), row(2, 311, 400), row(3, 183, 150)])).toBe(
      'Le meilleur repère change d’un cercle à l’autre : suis le tableau.'
    )
    expect(practicalRule([])).toBe('Pas assez de cercles pour dégager une règle.')
  })
})

describe('grille « Où finit la zone »', () => {
  it('8 × 8 cases, lettres A–H et I–P comme la carte du jeu', () => {
    expect(gridCellCode(3, 3)).toBe('D-L')
    const grid = finalZoneGrid([{ x: 3500, y: 3500 }, { x: 3999, y: 3001 }, { x: 8000, y: 8000 }], SIZE)
    expect(grid[3 * 8 + 3]).toBe(2)
    expect(grid[63]).toBe(1)
    expect(topGridCells(grid)).toEqual([
      { index: 27, col: 3, row: 3, code: 'D-L', count: 2 },
      { index: 63, col: 7, row: 7, code: 'H-P', count: 1 },
    ])
  })

  it('nom d’une case : le lieu qui la contient, sinon la direction depuis le lieu proche', () => {
    const places = [
      { name: 'Pochinki', xPct: 43.75, yPct: 43.75, radiusPct: 4 },
      { name: 'School', xPct: 56.25, yPct: 50, radiusPct: 2 },
    ]
    expect(gridCellLabel(3, 3, places)).toBe('Pochinki')
    expect(gridCellLabel(4, 4, places)).toBe('sud de School')
    expect(gridCellLabel(0, 7, places)).toBe('')
  })
})

describe('axes compacts', () => {
  it('encode, filtre et choisit l’axe le plus fréquent', () => {
    const entries = [
      encodeAxisEntry(match({ x: 1000, y: 4100 }), SIZE),
      encodeAxisEntry(match({ x: 2000, y: 4100 }), SIZE),
      encodeAxisEntry({ line: { start: { x: 4000, y: 0 }, end: { x: 4000, y: 8000 } }, circles: [], final: { x: 4100, y: 100 } }, SIZE),
    ]
    expect(entries[0]).toEqual([0, 0, 1000, 4100])
    expect(entries[2]).toEqual([900, 0, 4100, 100])
    expect(entriesNearAxis(entries, { angleDeg: 3, offset: 200 }, SIZE)).toHaveLength(2)
    expect(densestAxis(entries, SIZE)).toEqual({ angleDeg: 0, offset: 0 })
    expect(densestAxis([], SIZE)).toBeNull()
  })
})
