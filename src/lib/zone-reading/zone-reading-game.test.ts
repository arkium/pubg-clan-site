import { describe, expect, it } from 'vitest'

import {
  ROUND_VERDICT_LABELS,
  ZONE_READING_ROUNDS,
  formatDistance,
  parseZoneReadingGuess,
  roundVerdict,
  scoreZoneReadingRound,
  scoreZoneReadingSeries,
  withPlaneForRound,
} from './zone-reading-game'

/**
 * Lecture de zone, entraînement « Où finit la zone ? » (docs/features/lecture-de-zone.md) : chaque étape est notée,
 * les repères sont calculés sur le même cercle que le marqueur.
 */

const round = {
  line: { start: { x: 0, y: 4000 }, end: { x: 8000, y: 4000 } },
  circles: [
    { x: 4000, y: 4600, r: 1900 },
    { x: 4000, y: 4400, r: 1000 },
    { x: 4100, y: 4300, r: 600 },
    { x: 4150, y: 4250, r: 380 },
  ],
  final: { x: 4200, y: 4200 },
}

describe('scoreZoneReadingRound', () => {
  it('note chacune des quatre étapes et fait la moyenne', () => {
    const score = scoreZoneReadingRound(round, [
      { x: 4200, y: 4600 },
      { x: 4200, y: 4500 },
      { x: 4200, y: 4300 },
      { x: 4200, y: 4200 },
    ])
    expect(score.steps.map((step) => step.you)).toEqual([400, 300, 100, 0])
    expect(score.you).toBe(200)
    // Centre du cercle 1 : (4000, 4600) → zone finale (4200, 4200).
    expect(score.steps[0].centerError).toBe(447.2)
    // Repère « ligne » du cercle 1 : la ligne le traverse, pied en (4000, 4000).
    expect(score.steps[0].linePoint).toEqual({ x: 4000, y: 4000 })
    expect(score.steps[0].lineError).toBe(282.8)
    expect(roundVerdict(score)).toBe('both')
  })

  it('une position manquante reprend la dernière connue', () => {
    const score = scoreZoneReadingRound(round, [{ x: 4200, y: 4200 }])
    expect(score.steps.map((step) => step.you)).toEqual([0, 0, 0, 0])
  })

  it('verdicts', () => {
    expect(roundVerdict({ you: 100, center: 200, line: 50 })).toBe('one')
    expect(roundVerdict({ you: 300, center: 200, line: 250 })).toBe('none')
    expect(ROUND_VERDICT_LABELS.both).toBe('Mieux que les deux repères')
  })
})

describe('série', () => {
  it('une partie sur deux sans la ligne de vol', () => {
    expect(Array.from({ length: ZONE_READING_ROUNDS }, (_, index) => withPlaneForRound(index))).toEqual([
      true, false, true, false, true, false, true, false, true, false,
    ])
  })

  it('bilan : écart moyen, parties mieux que chaque repère, avec et sans avion', () => {
    const score = scoreZoneReadingSeries(
      Array.from({ length: 10 }, (_, index) => ({
        index,
        withPlane: withPlaneForRound(index),
        you: index % 2 === 0 ? 100 : 300,
        center: 200,
        line: 250,
      }))
    )
    expect(score.meanError).toBe(200)
    expect(score.betterThanCenter).toBe(5)
    expect(score.betterThanLine).toBe(5)
    expect(score.withPlane).toEqual({ meanError: 100, rounds: 5 })
    expect(score.withoutPlane).toEqual({ meanError: 300, rounds: 5 })
  })

  it('positions reçues : nombres finis dans la carte seulement', () => {
    expect(parseZoneReadingGuess({ x: 10.04, y: 8192 }, 8192)).toEqual({ x: 10, y: 8192 })
    expect(parseZoneReadingGuess({ x: -1, y: 10 }, 8192)).toBeNull()
    expect(parseZoneReadingGuess({ x: '10', y: 10 }, 8192)).toBeNull()
    expect(parseZoneReadingGuess({ x: Number.NaN, y: 10 }, 8192)).toBeNull()
    expect(parseZoneReadingGuess(null, 8192)).toBeNull()
  })

  it('distances en français', () => {
    expect(formatDistance(1016.4)).toBe('1 016 m')
    expect(formatDistance(118)).toBe('118 m')
  })
})
