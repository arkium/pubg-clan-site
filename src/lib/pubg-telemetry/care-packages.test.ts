import { describe, expect, it } from 'vitest'

import {
  buildCarePackages,
  classifyCarePackage,
  collectCarePackageEvent,
  createCarePackageAccumulator,
  notableCarePackageItems,
} from './care-packages'

function drop(eventType: string, packageId: string, t: number, x: number, y: number) {
  return [
    { itemPackage: { itemPackageId: packageId, location: { x, y, z: 0 }, items: [] } },
    eventType,
    t,
  ] as const
}

describe('classifyCarePackage', () => {
  it('reconnaît les identifiants observés dans la télémétrie réelle', () => {
    expect(classifyCarePackage('Carapackage_RedBox_C')).toBe('redbox')
    expect(classifyCarePackage('Carapackage_SmallPackage_C')).toBe('small')
    expect(classifyCarePackage('Carapackage_SmallPackage_NoParachute_C')).toBe('small')
    expect(classifyCarePackage('Carepackage_SmallPackage_NoParachute_Bluechip_C')).toBe('bluechip')
    expect(classifyCarePackage('BP_BRDM_C')).toBe('vehicle')
    expect(classifyCarePackage('Mystery_C')).toBe('other')
  })
})

describe('notableCarePackageItems', () => {
  it('garde les armes et l’équipement niveau 3, sans doublon', () => {
    expect(
      notableCarePackageItems([
        { itemId: 'Item_Weapon_Groza_C', category: 'Weapon' },
        { itemId: 'Item_Ammo_762mm_C', category: 'Ammunition' },
        { itemId: 'Item_Ammo_762mm_C', category: 'Ammunition' },
        { itemId: 'Item_Armor_C_01_Lv3_C', category: 'Equipment' },
        { itemId: 'Item_Ghillie_01_C', category: 'Equipment' },
        { itemId: 'Item_Weapon_Groza_C', category: 'Weapon' },
      ])
    ).toEqual(['Item_Weapon_Groza_C', 'Item_Armor_C_01_Lv3_C', 'Item_Ghillie_01_C'])
    expect(notableCarePackageItems(null)).toEqual([])
  })
})

describe('buildCarePackages', () => {
  it('fusionne les deux atterrissages d’une même caisse et retrouve son largage', () => {
    const accumulator = createCarePackageAccumulator()
    collectCarePackageEvent(accumulator, ...drop('LogCarePackageSpawn', 'Carapackage_RedBox_C', 100, 50000, 50000))
    collectCarePackageEvent(accumulator, ...drop('LogCarePackageLand', 'Carapackage_RedBox_C', 150, 50000, 50000))
    collectCarePackageEvent(accumulator, ...drop('LogCarePackageLand', 'Carapackage_RedBox_C', 150.2, 50010, 50000))

    const crates = buildCarePackages(accumulator)
    expect(crates).toHaveLength(1)
    expect(crates[0]).toMatchObject({ spawnTimestampSeconds: 100, timestampSeconds: 150 })
  })

  it('distingue deux petites caisses voisines de 18 m', () => {
    const accumulator = createCarePackageAccumulator()
    collectCarePackageEvent(accumulator, ...drop('LogCarePackageLand', 'Carapackage_SmallPackage_C', 320, 570100, 166976))
    collectCarePackageEvent(accumulator, ...drop('LogCarePackageLand', 'Carapackage_SmallPackage_C', 320, 568266, 167300))

    expect(buildCarePackages(accumulator)).toHaveLength(2)
  })

  it('rattache un pillage à la caisse du même type la plus proche, jamais à une caisse pas encore posée', () => {
    const accumulator = createCarePackageAccumulator()
    collectCarePackageEvent(accumulator, ...drop('LogCarePackageLand', 'Carapackage_RedBox_C', 300, 10000, 10000))
    collectCarePackageEvent(accumulator, ...drop('LogCarePackageLand', 'Carapackage_SmallPackage_C', 300, 10500, 10000))
    collectCarePackageEvent(accumulator, ...drop('LogCarePackageLand', 'Carapackage_RedBox_C', 900, 20000, 10000))

    const pickup = (t: number, x: number, teamId: number) =>
      collectCarePackageEvent(
        accumulator,
        { character: { teamId, location: { x, y: 10000 } }, carePackageName: 'Carapackage_RedBox_C' },
        'LogItemPickupFromCarepackage',
        t
      )
    pickup(400, 10400, 3) // plus proche de la petite caisse, mais d'un autre type
    pickup(450, 19950, 5) // à 50 cm de la caisse de 20 000, qui n'atterrit qu'à 900 s
    pickup(401, 10300, 3)

    const [redbox, small, lateRedbox] = buildCarePackages(accumulator)
    expect(redbox.lootTeamIds).toEqual([3])
    expect(redbox.firstLootTimestampSeconds).toBe(400)
    expect(small.lootTeamIds).toEqual([])
    expect(lateRedbox.lootTeamIds).toEqual([])
  })

  it('ignore un événement sans position ni identifiant', () => {
    const accumulator = createCarePackageAccumulator()
    collectCarePackageEvent(accumulator, { itemPackage: { location: { x: 1, y: 1 } } }, 'LogCarePackageLand', 10)
    collectCarePackageEvent(accumulator, { itemPackage: { itemPackageId: 'Carapackage_RedBox_C' } }, 'LogCarePackageLand', 10)
    expect(buildCarePackages(accumulator)).toEqual([])
  })
})
