import { describe, it, expect } from 'vitest'

import { resolveBodyZone } from './body-zones'

describe('Tactical Debrief Calculations & Components', () => {
  describe('Weapon Accuracy logic', () => {
    function computeAccuracy(shotsFired: number, hitsLanded: number) {
      const safeShots = Math.max(0, shotsFired || 0)
      const safeHits = Math.max(0, hitsLanded || 0)
      return safeShots > 0 ? Math.round((safeHits / safeShots) * 100) : 0
    }

    it('returns 0 when no shots are fired', () => {
      expect(computeAccuracy(0, 0)).toBe(0)
    })

    it('computes accurate integer percentages', () => {
      expect(computeAccuracy(100, 28)).toBe(28)
      expect(computeAccuracy(73, 14)).toBe(19) // 14/73 = 0.1917 -> 19%
      expect(computeAccuracy(10, 10)).toBe(100)
    })

    it('handles negative or invalid numbers safely', () => {
      expect(computeAccuracy(-5, 10)).toBe(0)
      expect(computeAccuracy(0, 15)).toBe(0)
    })
  })

  describe('C-130 Flight Path Vector computation', () => {
    type LandingSample = { x: number; y: number; timestamp?: number }

    function computeFlightPath(samples: LandingSample[]) {
      if (!Array.isArray(samples) || samples.length < 2) return null

      // Sort by timestamp if available
      const sorted = [...samples].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      const sampleCount = Math.max(1, Math.floor(sorted.length * 0.15))

      const earlyCluster = sorted.slice(0, sampleCount)
      const lateCluster = sorted.slice(-sampleCount)

      const startX = earlyCluster.reduce((s, p) => s + p.x, 0) / earlyCluster.length
      const startY = earlyCluster.reduce((s, p) => s + p.y, 0) / earlyCluster.length

      const endX = lateCluster.reduce((s, p) => s + p.x, 0) / lateCluster.length
      const endY = lateCluster.reduce((s, p) => s + p.y, 0) / lateCluster.length

      const dx = endX - startX
      const dy = endY - startY
      let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
      if (angleDeg < 0) angleDeg += 360

      return {
        start: { x: Math.round(startX), y: Math.round(startY) },
        end: { x: Math.round(endX), y: Math.round(endY) },
        angleDeg: Math.round(angleDeg * 10) / 10,
      }
    }

    it('returns null if fewer than 2 landing points', () => {
      expect(computeFlightPath([])).toBeNull()
      expect(computeFlightPath([{ x: 100, y: 100 }])).toBeNull()
    })

    it('computes correct angle and vector coordinates for East-bound trajectory', () => {
      const samples = [
        { x: 100, y: 500, timestamp: 10 },
        { x: 150, y: 510, timestamp: 15 },
        { x: 800, y: 500, timestamp: 80 },
        { x: 850, y: 520, timestamp: 85 },
      ]
      const result = computeFlightPath(samples)
      expect(result).not.toBeNull()
      expect(result!.start.x).toBeLessThan(result!.end.x)
      // Moving almost horizontally to the East: angle ~ 0° - 5°
      expect(result!.angleDeg).toBeGreaterThanOrEqual(0)
      expect(result!.angleDeg).toBeLessThanOrEqual(5)
    })

    it('computes correct angle for South-bound trajectory', () => {
      const samples = [
        { x: 500, y: 100, timestamp: 10 },
        { x: 500, y: 900, timestamp: 90 },
      ]
      const result = computeFlightPath(samples)
      expect(result).not.toBeNull()
      expect(result!.angleDeg).toBe(90) // South is 90°
    })
  })

  describe('Damage Hit Zone mapping', () => {
    it('mappe les cinq damageReason officiels de PUBG', () => {
      expect(resolveBodyZone('HeadShot')).toBe('head')
      expect(resolveBodyZone('TorsoShot')).toBe('torso')
      expect(resolveBodyZone('PelvisShot')).toBe('pelvis')
      expect(resolveBodyZone('ArmShot')).toBe('arms')
      expect(resolveBodyZone('LegShot')).toBe('legs')
    })

    it('ignore la casse et les espaces', () => {
      expect(resolveBodyZone(' headshot ')).toBe('head')
      expect(resolveBodyZone('LEGSHOT')).toBe('legs')
    })

    it('classe en "other" les dégâts non localisés plutôt que d’inventer une zone', () => {
      expect(resolveBodyZone('NonSpecific')).toBe('other')
      expect(resolveBodyZone('None')).toBe('other')
      expect(resolveBodyZone('Torso')).toBe('other')
      expect(resolveBodyZone('Leg_Lower')).toBe('other')
      expect(resolveBodyZone(undefined)).toBe('other')
      expect(resolveBodyZone(null)).toBe('other')
    })
  })
})
