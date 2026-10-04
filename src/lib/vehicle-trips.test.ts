import { describe, expect, it } from 'vitest'

import { countsAsPositionVehicle, vehicleTripFlags, type VehicleTripSample } from './vehicle-trips'

const identity = (memberKey: string) => (memberKey.startsWith('clan-') ? memberKey : null)
const at = (memberKey: string, action: 'ride' | 'leave', x: number, extra: Partial<VehicleTripSample> = {}): VehicleTripSample => ({
  memberKey,
  action,
  vehicleType: 'WheeledVehicle',
  x,
  y: 0,
  ...extra,
})

describe('countsAsPositionVehicle', () => {
  it("écarte l'avion, le planeur, le ballon et le mortier, garde le reste et le type absent", () => {
    expect(['TransportAircraft', 'FlyingVehicle', 'EmergencyPickup', 'Mortar'].map(countsAsPositionVehicle)).toEqual([false, false, false, false])
    expect(['WheeledVehicle', 'FloatingVehicle', null, undefined].map(countsAsPositionVehicle)).toEqual([true, true, true, true])
  })
})

describe('vehicleTripFlags', () => {
  it('suit la télémétrie quand elle dit qui est à bord', () => {
    const samples = [
      at('clan-a', 'ride', 0, { teammateAboard: false }),
      at('clan-b', 'ride', 0, { teammateAboard: true }),
      at('clan-b', 'leave', 50_000, { teammateAboard: true }),
      at('clan-a', 'leave', 50_000, { teammateAboard: false }),
    ]
    expect(vehicleTripFlags(samples, identity)).toEqual([true, false, false, true])
  })

  it('historique : quatre membres dans la même voiture comptent un véhicule pris et un laissé', () => {
    const samples = [
      at('clan-a', 'ride', 0),
      at('clan-b', 'ride', 300),
      at('clan-c', 'ride', 600),
      at('clan-d', 'ride', 900),
      at('clan-b', 'leave', 400_000),
      at('clan-c', 'leave', 400_300),
      at('clan-d', 'leave', 400_600),
      at('clan-a', 'leave', 400_900),
    ]
    expect(vehicleTripFlags(samples, identity)).toEqual([true, false, false, false, false, false, false, true])
  })

  it('historique : deux véhicules pris loin l’un de l’autre comptent deux fois', () => {
    const samples = [
      at('clan-a', 'ride', 0),
      at('clan-b', 'ride', 200_000),
      at('clan-a', 'leave', 50_000),
      at('clan-b', 'leave', 300_000),
    ]
    expect(vehicleTripFlags(samples, identity)).toEqual([true, true, true, true])
  })

  it('historique : un type différent est un autre véhicule (moto et bateau côte à côte)', () => {
    const samples = [
      at('clan-a', 'ride', 0),
      at('clan-b', 'ride', 100, { vehicleType: 'FloatingVehicle' }),
    ]
    expect(vehicleTripFlags(samples, identity)).toEqual([true, true])
  })

  it('ignore les engins exclus et les joueurs hors escouade, même pour la déduction', () => {
    const samples = [
      at('clan-a', 'ride', 0, { vehicleType: 'TransportAircraft' }),
      at('adversaire', 'ride', 0),
      at('clan-b', 'ride', 100),
      at('clan-a', 'leave', 0, { vehicleType: 'TransportAircraft' }),
    ]
    expect(vehicleTripFlags(samples, identity)).toEqual([false, false, true, false])
  })
})
