import { describe, expect, it } from 'vitest'

import {
  RESOURCE_MAPS,
  classifyVehicle,
  clusterObservations,
  gridLabel,
  isNear,
  isSpotShown,
  resourceMap,
  resourcePointState,
  spotShare,
  topMatchesByFamily,
  type VehicleObservation,
} from './resource-map'

const ERANGEL = resourceMap('Baltic_Main')!
const SANHOK = resourceMap('Savage_Main')!

describe('cartes et grille', () => {
  it('cinq cartes dans l’ordre du carrousel, inconnue = null', () => {
    expect(RESOURCE_MAPS.map((map) => map.label)).toEqual(['Erangel', 'Miramar', 'Taego', 'Vikendi', 'Sanhok'])
    expect(resourceMap('Range_Main')).toBeNull()
  })

  it('repère de grille : colonnes A… d’ouest en est, lignes I… du nord au sud', () => {
    expect(gridLabel(ERANGEL, 3500, 4200)).toBe('D-M')
    expect(gridLabel(ERANGEL, 0, 0)).toBe('A-I')
    expect(gridLabel(ERANGEL, 8192, 8192)).toBe('H-P')
    expect(gridLabel(SANHOK, 4095, 4095)).toBe('D-L')
  })
})

describe('classifyVehicle', () => {
  it('familles PUBG et modèle : voiture, moto, bateau, planeur ; sans modèle, voiture ou moto', () => {
    expect(classifyVehicle('WheeledVehicle', 'Dacia_A_01_v2_C')).toBe('car')
    expect(classifyVehicle('WheeledVehicle', 'BP_Motorbike_04_SideCar_C')).toBe('moto')
    expect(classifyVehicle('WheeledVehicle', 'BP_Scooter_02_A_C')).toBe('moto')
    expect(classifyVehicle('WheeledVehicle', 'BP_Snowmobile_01_C')).toBe('moto')
    expect(classifyVehicle('WheeledVehicle', 'BP_PanigaleV4S_LGD01_C')).toBe('moto')
    expect(classifyVehicle('WheeledVehicle', 'BP_RoadGlideST_LGD_C')).toBe('moto')
    expect(classifyVehicle('WheeledVehicle', 'BP_Special_ElSolitario_C')).toBe('moto')
    expect(classifyVehicle('WheeledVehicle', 'BP_ATV_C')).toBe('moto')
    expect(classifyVehicle('WheeledVehicle', 'BP_TukTukTuk_A_02_C')).toBe('moto')
    // Voitures : y compris les skins et les modèles dont le nom contient « at » ou « v » sans être un quad.
    expect(classifyVehicle('WheeledVehicle', 'BP_Vantage_LGD_C')).toBe('car')
    expect(classifyVehicle('WheeledVehicle', 'BP_Mirado_A_03_Esports_C')).toBe('car')
    expect(classifyVehicle('WheeledVehicle', 'BP_BRDM_C')).toBe('car')
    expect(classifyVehicle('FloatingVehicle', 'AquaRail_A_02_C')).toBe('boat')
    expect(classifyVehicle('FloatingVehicle', 'AirBoat_V2_C')).toBe('boat')
    expect(classifyVehicle('WheeledVehicle', null)).toBe('land')
    expect(classifyVehicle('FloatingVehicle', 'Boat_PG117_C')).toBe('boat')
    expect(classifyVehicle('rubberboat', null)).toBe('boat')
    expect(classifyVehicle('FlyingVehicle', 'BP_Motorglider_C')).toBe('glider')
  })

  it('avion de largage, évacuation et mortier ignorés', () => {
    expect(classifyVehicle('TransportAircraft', null)).toBeNull()
    expect(classifyVehicle('EmergencyPickup', null)).toBeNull()
    expect(classifyVehicle('Mortar', null)).toBeNull()
    expect(classifyVehicle(null, null)).toBeNull()
  })
})

describe('clusterObservations', () => {
  const at = (matchId: string, x: number, y: number, family: VehicleObservation['family'] = 'car'): VehicleObservation => ({ matchId, family, x, y })

  it('regroupe les observations proches en un emplacement, compte les parties distinctes', () => {
    const spots = clusterObservations([at('m1', 1000, 1000), at('m2', 1010, 1005), at('m2', 1060, 1000), at('m3', 3000, 3000)])
    expect(spots).toHaveLength(2)
    const main = spots.find((spot) => spot.observations === 3)!
    expect(main.matches).toBe(2)
    expect(main.x).toBeGreaterThan(1000)
    expect(main.x).toBeLessThan(1060)
  })

  it('les familles ne se mélangent pas', () => {
    const spots = clusterObservations([at('m1', 500, 500, 'car'), at('m1', 505, 500, 'boat')])
    expect(spots.map((spot) => spot.family).sort()).toEqual(['boat', 'car'])
  })

  it('déterministe', () => {
    const list = [at('a', 10, 10), at('b', 900, 900), at('c', 20, 15), at('d', 905, 890)]
    expect(clusterObservations(list)).toEqual(clusterObservations([...list].reverse()))
  })
})

describe('seuils et état', () => {
  it('part des parties et seuils d’affichage : 3 parties, 0,5 %, et le quart du plus fréquent de la famille', () => {
    expect(spotShare({ matches: 48 }, 78)).toBeCloseTo(0.615, 3)
    expect(isSpotShown({ matches: 2 }, 10, 2)).toBe(false)
    expect(isSpotShown({ matches: 4 }, 1000, 4)).toBe(false) // 0,4 % des parties
    expect(isSpotShown({ matches: 30 }, 1000, 30)).toBe(true) // bateau rare mais le plus fréquent de sa famille
    expect(isSpotShown({ matches: 50 }, 1000, 240)).toBe(false) // moins du quart du plus fréquent
    expect(isSpotShown({ matches: 60 }, 1000, 240)).toBe(true)
  })

  it('plus fréquent par famille', () => {
    const top = topMatchesByFamily([{ family: 'boat', matches: 3 }, { family: 'boat', matches: 9 }, { family: 'land', matches: 40 }])
    expect(top.get('boat')).toBe(9)
    expect(top.get('land')).toBe(40)
    expect(top.get('glider')).toBeUndefined()
  })

  it('point validé à confirmer tant que personne ne l’a confirmé depuis la demande de revérification', () => {
    const validated = { status: 'validated' as const, validatedAt: '2026-09-20T10:00:00Z', lastConfirmedAt: null }
    expect(resourcePointState(validated, null)).toBe('validated')
    expect(resourcePointState(validated, '2026-10-01T00:00:00Z')).toBe('to_confirm')
    expect(resourcePointState({ ...validated, lastConfirmedAt: '2026-10-02T00:00:00Z' }, '2026-10-01T00:00:00Z')).toBe('validated')
    expect(resourcePointState({ ...validated, status: 'pending' }, null)).toBe('pending')
    expect(resourcePointState({ ...validated, status: 'rejected' }, null)).toBeNull()
  })

  it('filtre « autour de nos drop zones » : 800 m', () => {
    expect(isNear({ x: 1000, y: 1000 }, [{ x: 1500, y: 1500 }])).toBe(true)
    expect(isNear({ x: 1000, y: 1000 }, [{ x: 2000, y: 2000 }])).toBe(false)
    expect(isNear({ x: 1000, y: 1000 }, [])).toBe(false)
  })
})
