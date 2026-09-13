import { describe, expect, it } from 'vitest'

import {
  aircraftPositionAt,
  compassCardinal,
  compassHeadingDeg,
  computeFlightPath,
  computeFlightPathFromJumps,
  computeRecallFlights,
} from './flight-path'

describe('computeRecallFlights', () => {
  // Vol de rappel réel du match Karakin cmu027vpd3ftl04tzlejla0vk (secondes non arrondies).
  const karakinRecall = [
    { t: 661.04, x: 149139, y: 70510, key: 'account.a', action: 'ride' as const },
    { t: 661.04, x: 149139, y: 70510, key: 'account.b', action: 'ride' as const },
    { t: 664.87, x: 129207, y: 75275, key: 'account.c', action: 'leave' as const },
    { t: 666.11, x: 122824, y: 76801, key: 'account.b', action: 'leave' as const },
    { t: 668.08, x: 112645, y: 79235, key: 'account.a', action: 'leave' as const },
    { t: 671.45, x: 95213, y: 83402, key: 'account.d', action: 'leave' as const },
  ]

  it('reconstitue la vitesse et le cap depuis les embarquements et les sauts', () => {
    const [flight] = computeRecallFlights(karakinRecall, 'Summerland_Main')

    expect(flight.timing.speedMetersPerSecond).toBe(53)
    expect(compassHeadingDeg(flight.angleDeg)).toBe(257)
    expect(flight.riders).toBe(4)
  })

  it('fait entrer et sortir l’avion de la carte autour des sauts', () => {
    const [flight] = computeRecallFlights(karakinRecall, 'Summerland_Main')

    expect(flight.timing.startT).toBeLessThan(661.04)
    expect(flight.timing.endT).toBeGreaterThan(671.45)
    expect(aircraftPositionAt(flight, flight.timing.startT - 1)).toBeNull()
    const atJump = aircraftPositionAt(flight, 668.08)!
    expect(Math.hypot(atJump.x - 112645, atJump.y - 79235) / 100).toBeLessThan(10)
  })

  it('sépare deux avions espacés de plus de 30 s et ignore un vol sans durée', () => {
    const flights = computeRecallFlights(
      [
        ...karakinRecall,
        { t: 811.08, x: 132641, y: 83088, key: 'account.e', action: 'ride' },
        { t: 823.05, x: 113466, y: 56212, key: 'account.e', action: 'leave' },
        { t: 950, x: 1000, y: 1000, key: 'account.f', action: 'leave' },
      ],
      'Summerland_Main'
    )

    expect(flights).toHaveLength(2)
    expect(flights[1].timing.speedMetersPerSecond).toBe(28)
  })
})

describe('computeFlightPathFromJumps', () => {
  it('oriente la trajectoire du premier vers le dernier saut', () => {
    const path = computeFlightPathFromJumps([
      { t: 60, x: 689490, y: 491681 },
      { t: 19, x: 274364, y: 97448 },
    ])

    expect(path?.dropStart).toEqual({ x: 274364, y: 97448 })
    expect(path?.dropEnd).toEqual({ x: 689490, y: 491681 })
    expect(path?.angleDeg).toBeCloseTo(43.5, 0)
  })

  it('prolonge la trajectoire jusqu’aux bordures de la carte', () => {
    const path = computeFlightPathFromJumps(
      [
        { t: 19, x: 274364, y: 97448 },
        { t: 60, x: 689490, y: 491681 },
      ],
      'Baltic_Main'
    )

    expect(path?.start.y).toBe(0)
    expect(path?.end.x).toBe(819200)
  })

  it('passe exactement par les points de saut', () => {
    const path = computeFlightPathFromJumps(
      [
        { t: 19, x: 274364, y: 97448 },
        { t: 60, x: 689490, y: 491681 },
      ],
      'Baltic_Main'
    )!

    const dx = path.end.x - path.start.x
    const dy = path.end.y - path.start.y
    const norm = Math.hypot(dx, dy)
    const distance =
      Math.abs(
        dy * path.dropStart.x - dx * path.dropStart.y + path.end.x * path.start.y - path.end.y * path.start.x
      ) / norm

    expect(Math.round(distance / 100)).toBe(0)
  })

  it('renvoie null sans au moins deux sauts distincts', () => {
    expect(computeFlightPathFromJumps([])).toBeNull()
    expect(computeFlightPathFromJumps([{ t: 19, x: 1, y: 1 }])).toBeNull()
    expect(
      computeFlightPathFromJumps([
        { t: 19, x: 1, y: 1 },
        { t: 20, x: 1, y: 1 },
      ])
    ).toBeNull()
  })
})

describe('horaires de survol de l’avion', () => {
  // Match Erangel de référence : 5 725 m entre le premier et le dernier saut, en 41 s.
  const erangel = computeFlightPathFromJumps(
    [
      { t: 19, x: 274364, y: 97448 },
      { t: 60, x: 689490, y: 491681 },
    ],
    'Baltic_Main'
  )!

  it('mesure la vitesse sol entre les sauts extrêmes', () => {
    expect(erangel.timing?.dropStartT).toBe(19)
    expect(erangel.timing?.dropEndT).toBe(60)
    expect(erangel.timing?.speedMetersPerSecond).toBe(140)
  })

  it('extrapole l’entrée avant le premier saut et la sortie après le dernier', () => {
    const timing = erangel.timing!
    expect(timing.startT).toBeLessThan(19)
    expect(timing.endT).toBeGreaterThan(60)
  })

  it('place l’avion exactement sur les points de saut à leur horaire', () => {
    const atFirstJump = aircraftPositionAt(erangel, 19)!
    const atLastJump = aircraftPositionAt(erangel, 60)!

    expect(Math.hypot(atFirstJump.x - 274364, atFirstJump.y - 97448) / 100).toBeLessThan(15)
    expect(Math.hypot(atLastJump.x - 689490, atLastJump.y - 491681) / 100).toBeLessThan(15)
  })

  it('masque l’avion hors de sa fenêtre de survol', () => {
    expect(aircraftPositionAt(erangel, erangel.timing!.startT - 1)).toBeNull()
    expect(aircraftPositionAt(erangel, erangel.timing!.endT + 1)).toBeNull()
  })

  it('n’anime rien quand le plan de vol vient des atterrissages', () => {
    const fallback = computeFlightPath([
      { x: 100000, y: 100000, timestampSeconds: 1000 },
      { x: 400000, y: 400000, timestampSeconds: 1030 },
    ])

    expect(fallback?.timing).toBeNull()
    expect(aircraftPositionAt(fallback, 1010)).toBeNull()
  })
})

describe('cap compas', () => {
  it('convertit l’angle trigonométrique (0° = est, y vers le sud) en cap (0° = nord)', () => {
    expect(compassHeadingDeg(0)).toBe(90)
    expect(compassHeadingDeg(90)).toBe(180)
    expect(compassHeadingDeg(-90)).toBe(0)
    expect(compassHeadingDeg(180)).toBe(270)
  })

  it('donne un cap nord pour l’avion de Karakin qui remonte la carte', () => {
    // Match cmu027vpd3ftl04tzlejla0vk : angle −93,2°, soit 357° plein nord.
    expect(compassHeadingDeg(-93.2)).toBe(357)
    expect(compassCardinal(357)).toBe('N')
  })

  it('nomme les points cardinaux en français', () => {
    expect(compassCardinal(134)).toBe('SE')
    expect(compassCardinal(225)).toBe('SO')
    expect(compassCardinal(290)).toBe('O')
    expect(compassCardinal(-20)).toBe('N')
  })
})

describe('computeFlightPath (repli sur les atterrissages)', () => {
  // Dix atterrissages alignés à 45°, plus un rappel tardif très à l'écart.
  const landings = Array.from({ length: 10 }, (_, index) => ({
    x: 100000 + index * 50000,
    y: 100000 + index * 50000,
    timestampSeconds: 1000 + index * 5,
  }))

  it('déduit le cap de l’axe des atterrissages', () => {
    const path = computeFlightPath(landings)

    expect(path).not.toBeNull()
    expect(path!.angleDeg).toBeCloseTo(45, 0)
  })

  it('ignore les rappels tardifs hors fenêtre de largage initiale', () => {
    const withLateRecall = [...landings, { x: 700000, y: 100000, timestampSeconds: 5000 }]

    expect(computeFlightPath(withLateRecall)!.angleDeg).toBeCloseTo(45, 0)
  })

  it('renvoie null sur une entrée inexploitable', () => {
    expect(computeFlightPath(null)).toBeNull()
    expect(computeFlightPath('pas du json')).toBeNull()
    expect(computeFlightPath([{ x: 1, y: 1, timestampSeconds: 1 }])).toBeNull()
  })
})
