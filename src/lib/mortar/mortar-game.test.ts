import { describe, expect, it } from 'vitest'

import {
  MORTAR_DIFFICULTIES,
  MORTAR_DIFFICULTY_RULES,
  MORTAR_MAP,
  MORTAR_RANGE,
  MORTAR_TARGETS_PER_SERIES,
  clampSetting,
  formatClock,
  formatMeters,
  formatSeconds,
  generateMortarTargets,
  gridDistance,
  impactPoint,
  mortarGridTable,
  parseMortarDifficulty,
  requiredSetting,
  scoreMortarSeries,
  shotError,
  shotVerdict,
  validateMortarShots,
} from './mortar-game'

const SEEDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'k3x9p2', '0']

describe('generateMortarTargets', () => {
  it('même graine, mêmes cibles (client et serveur) ; graine ou difficulté différente, autres cibles', () => {
    expect(generateMortarTargets('alpha', 'medium')).toEqual(generateMortarTargets('alpha', 'medium'))
    expect(generateMortarTargets('alpha', 'medium')).not.toEqual(generateMortarTargets('bravo', 'medium'))
    expect(generateMortarTargets('alpha', 'medium')).not.toEqual(generateMortarTargets('alpha', 'easy'))
  })

  for (const difficulty of MORTAR_DIFFICULTIES) {
    it(`${difficulty} : dix cibles dans la carte, distance et réglage dans la portée de la difficulté`, () => {
      const rules = MORTAR_DIFFICULTY_RULES[difficulty]
      for (const seed of SEEDS) {
        const targets = generateMortarTargets(seed, difficulty)
        expect(targets).toHaveLength(MORTAR_TARGETS_PER_SERIES)
        for (const target of targets) {
          for (const point of [target.shooter, target.target]) {
            expect(point.x).toBeGreaterThanOrEqual(0)
            expect(point.x).toBeLessThanOrEqual(MORTAR_MAP.width)
            expect(point.y).toBeGreaterThanOrEqual(0)
            expect(point.y).toBeLessThanOrEqual(MORTAR_MAP.height)
          }
          expect(target.distance).toBe(Math.round(Math.hypot(target.target.x - target.shooter.x, target.target.y - target.shooter.y)))
          expect(target.distance).toBeGreaterThanOrEqual(rules.minDistance)
          expect(target.distance).toBeLessThanOrEqual(rules.maxDistance)
          const setting = requiredSetting(target)
          expect(setting).toBeGreaterThanOrEqual(MORTAR_RANGE.min)
          expect(setting).toBeLessThanOrEqual(MORTAR_RANGE.max)
          if (rules.maxElevation === 0) expect(target.elevation).toBe(0)
          else {
            expect(target.elevation).not.toBe(0)
            expect(Math.abs(target.elevation)).toBeLessThanOrEqual(rules.maxElevation)
            expect(Math.abs(target.elevation) % 10).toBe(0)
          }
        }
      }
    })
  }

  it('les longues portées existent bien en Moyen (au moins une cible au-delà de 550 m sur quelques séries)', () => {
    const longest = Math.max(...SEEDS.flatMap((seed) => generateMortarTargets(seed, 'medium').map((target) => target.distance)))
    expect(longest).toBeGreaterThan(550)
  })
})

describe('tir', () => {
  const flat = { index: 0, shooter: { x: 100, y: 100 }, target: { x: 400, y: 500 }, distance: 500, elevation: 0 }

  it('écart signé : trop court négatif, trop long positif ; verdict selon la tolérance de la difficulté', () => {
    expect(shotError(482, flat)).toBe(-18)
    expect(shotVerdict(-18, 'medium')).toBe('short')
    expect(shotError(509, flat)).toBe(9)
    expect(shotVerdict(9, 'medium')).toBe('hit')
    expect(shotVerdict(9, 'hard')).toBe('long')
    expect(shotVerdict(-15, 'easy')).toBe('hit')
  })

  it('dénivelé : cible 20 m plus haute → il faut viser 10 m plus loin', () => {
    const uphill = { ...flat, elevation: 20 }
    expect(requiredSetting(uphill)).toBe(510)
    expect(shotError(510, uphill)).toBe(0)
    expect(shotError(500, uphill)).toBe(-10)
    expect(shotError(490, { ...flat, elevation: -20 })).toBe(0)
  })

  it('impact sur la ligne tireur → cible, à la distance parcourue', () => {
    expect(impactPoint(flat, 500)).toEqual({ x: 400, y: 500 })
    expect(impactPoint(flat, 250)).toEqual({ x: 250, y: 300 })
  })

  it('réglage borné à la portée et arrondi au mètre', () => {
    expect(clampSetting(50)).toBe(MORTAR_RANGE.min)
    expect(clampSetting(812)).toBe(MORTAR_RANGE.max)
    expect(clampSetting(300.6)).toBe(301)
  })
})

describe('scoreMortarSeries', () => {
  it('écart moyen absolu au dixième, tirs au but, temps moyen', () => {
    const targets = generateMortarTargets('alpha', 'medium')
    const errors = [6, -22, -18, 4, 9, -3, 31, -7, 12, 2]
    const shots = targets.map((target, index) => ({ setting: target.distance + errors[index], timeMs: 15_000 }))
    const score = scoreMortarSeries(targets, shots, 'medium')
    expect(score.results.map((result) => result.error)).toEqual(errors)
    expect(score.meanError).toBe(11.4)
    expect(score.hits).toBe(6)
    expect(score.avgTimeMs).toBe(15_000)
    expect(score.totalTimeMs).toBe(150_000)
  })
})

describe('validateMortarShots', () => {
  const valid = Array.from({ length: 10 }, () => ({ setting: 300, timeMs: 12_000 }))

  it('dix tirs entiers dans la portée, temps plausibles', () => {
    expect(validateMortarShots(valid)).toEqual({ ok: true, shots: valid })
  })

  it('refuse un nombre de tirs, un réglage ou un temps invalides', () => {
    expect(validateMortarShots(valid.slice(1)).ok).toBe(false)
    expect(validateMortarShots(null).ok).toBe(false)
    expect(validateMortarShots([...valid.slice(1), { setting: 90, timeMs: 12_000 }]).ok).toBe(false)
    expect(validateMortarShots([...valid.slice(1), { setting: 300.5, timeMs: 12_000 }]).ok).toBe(false)
    expect(validateMortarShots([...valid.slice(1), { setting: 300, timeMs: 50 }]).ok).toBe(false)
  })
})

describe('guide', () => {
  it('table de la grille : 3 carrés × 2 carrés = 361 m ; 100 m et 707 m hors portée', () => {
    expect(gridDistance(3, 2)).toBe(361)
    const table = mortarGridTable(5)
    expect(table).toHaveLength(6)
    expect(table[2].cells[3]).toEqual({ across: 3, distance: 361, inRange: true })
    expect(table[0].cells[1].inRange).toBe(false)
    expect(table[5].cells[5]).toEqual({ across: 5, distance: 707, inRange: false })
    expect(table[4].cells[4].distance).toBe(566)
  })
})

describe('affichage', () => {
  it('mètres, secondes et chronomètre au format français', () => {
    expect(formatMeters(11.4, { decimals: true })).toBe('11,4 m')
    expect(formatMeters(-18, { signed: true })).toBe('−18 m')
    expect(formatMeters(6, { signed: true })).toBe('+6 m')
    expect(formatMeters(300)).toBe('300 m')
    expect(formatSeconds(15_000)).toBe('15,0 s')
    expect(formatClock(150_000)).toBe('02:30')
  })

  it('difficulté lue depuis une valeur inconnue', () => {
    expect(parseMortarDifficulty('hard')).toBe('hard')
    expect(parseMortarDifficulty('expert')).toBeNull()
  })
})
