import { describe, expect, it } from 'vitest'

import type { ResourceMapResponse } from './resource-api'
import { resourceFindings } from './resource-findings'

const zero = { car: 0, moto: 0, boat: 0, glider: 0, land: 0 }
const noPoints = { fuel: 0, garage: 0, dock: 0, secret_room: 0 }

const view = (label: string, analysedMatches: number, observed: Partial<typeof zero>, points: Partial<typeof noPoints>, spots: Array<{ family: string; grid: string; share: number }>) =>
  ({
    map: { key: label, label, sizeMeters: 8192 },
    observed: { analysedMatches, windowDays: 90, computedAt: null, spots },
    counts: { observed: { ...zero, ...observed }, points: { ...noPoints, ...points } },
  }) as unknown as ResourceMapResponse

const ERANGEL = view('Erangel', 7843, { car: 32, boat: 9, glider: 2 }, { fuel: 3, secret_room: 1 }, [
  { family: 'boat', grid: 'C-M', share: 0.035 },
  { family: 'car', grid: 'D-L', share: 0.27 },
])
const SANHOK = view('Sanhok', 0, {}, {}, [])
const NOW = new Date('2026-10-18T10:00:00Z')
const plain = (text: string) => text.replace(/ | /g, ' ')

describe('resourceFindings', () => {
  const result = resourceFindings([ERANGEL, SANHOK], NOW)!

  it('titre, fenêtre d’observation et date des chiffres', () => {
    expect(result.title).toBe('En bref : véhicules et ressources sur 2 cartes PUBG')
    expect(result.scope).toBe('Véhicules observés dans les parties des 90 derniers jours, recalculés chaque nuit · chiffres du 18 octobre 2026')
  })

  it('une phrase par carte : parties, emplacements par famille, le plus fréquent, points des joueurs', () => {
    expect(plain(result.maps[0].sentence)).toBe(
      '7 843 parties analysées : 32 emplacements de voitures, 9 de bateaux, 2 de planeurs. Le plus fréquent : voiture en ' +
        'case D-L, trouvée dans 27 % des parties. Points placés par les joueurs : 3 stations-service, 1 salle secrète.'
    )
  })

  it('une carte sans données le dit, sans chiffre inventé', () => {
    expect(result.maps[1]).toEqual({ label: 'Sanhok', sentence: 'pas encore d’emplacement de véhicule au-dessus des seuils.' })
  })

  it('accorde « trouvé » au masculin pour un bateau', () => {
    const boats = resourceFindings([view('Miramar', 100, { boat: 1 }, {}, [{ family: 'boat', grid: 'A-I', share: 0.05 }])], NOW)!
    expect(plain(boats.maps[0].sentence)).toContain('1 emplacement de bateau. Le plus fréquent : bateau en case A-I, trouvé dans 5 % des parties.')
  })

  it('explique la méthode et ses seuils', () => {
    expect(result.method).toContain('seul à bord')
    expect(result.method).toContain('à partir de 3 parties')
  })

  it('rien sans carte', () => {
    expect(resourceFindings([], NOW)).toBeNull()
  })
})
