import { describe, expect, it } from 'vitest'

import {
  PUBG_SORTS,
  SITE_SORTS,
  aggregateMemberWeapons,
  careerTotals,
  categoryCounts,
  expertDistribution,
  favouriteWeapon,
  lastMasteryRefresh,
  loadoutThrows,
  masteryCategory,
  masteryTelemetryId,
  masteryWeapons,
  memberLoadout,
  memberRecords,
  mostMasteredWeapon,
  parseArsenalSource,
  throwableLabel,
  type MasteryEntry,
  type MemberWeaponRow,
} from './member-arsenal'

const row = (weaponName: string, values: Partial<MemberWeaponRow> = {}): MemberWeaponRow => ({
  weaponName,
  weaponLabel: undefined,
  kills: 0,
  headshots: 0,
  shotsFired: 0,
  hitsLanded: 0,
  avgDistance: 0,
  maxDistance: null,
  matchCount: 1,
  ...values,
})

const mastery = (weaponId: string, values: Partial<MasteryEntry> = {}): MasteryEntry => ({
  weaponId,
  weaponName: weaponId.replace(/^Item_Weapon_/, '').replace(/_C$/, ''),
  kills: 0,
  headshots: 0,
  knockouts: 0,
  damage: 0,
  level: 1,
  xpTotal: 0,
  tier: 0,
  lastRefreshedAt: '2026-09-27T04:00:00.000Z',
  ...values,
})

describe('onglet Site — aggregateMemberWeapons', () => {
  const weapons = aggregateMemberWeapons([
    row('WeapHK416_C', { weaponLabel: 'M416', kills: 10, headshots: 4, shotsFired: 400, hitsLanded: 100, avgDistance: 30, maxDistance: 120, matchCount: 8 }),
    row('WeapDuncansHK416_C', { weaponLabel: 'M416 de Duncan', kills: 10, headshots: 1, shotsFired: 100, hitsLanded: 50, avgDistance: 50, maxDistance: 180, matchCount: 3 }),
    row('ProjMolotov_C', { weaponLabel: 'Molotov', kills: 1, matchCount: 4 }),
    row('BP_MolotovFireDebuff_C', { weaponLabel: 'Feu', kills: 5, hitsLanded: 40, matchCount: 6 }),
    row('None', { weaponLabel: 'None', kills: 8, maxDistance: 164 }),
    row('Dacia_A_03_v2_Esports_C', { kills: 4 }),
    row('WeapKar98k_C', { weaponLabel: 'Kar98k', kills: 0, shotsFired: 0, hitsLanded: 0 }),
  ])

  it('fusionne les variantes sous le nom de l’identifiant principal', () => {
    const m416 = weapons.find((weapon) => weapon.id === 'm416')!
    expect(m416).toMatchObject({ name: 'M416', category: 'AR', kills: 20, headshots: 5, shotsFired: 500, hitsLanded: 150, maxDistance: 180, matchCount: 8 })
    expect(m416.accuracy).toBe(30)
    expect(m416.headshotRate).toBe(25)
    // Moyenne pondérée par les kills : (30 × 10 + 50 × 10) / 20.
    expect(m416.avgDistance).toBe(40)
  })

  it('le feu au sol compte pour le Molotov sans le rebaptiser ; pas de précision sans tir', () => {
    const molotov = weapons.find((weapon) => weapon.id === 'molotov')!
    expect(molotov).toMatchObject({ name: 'Molotov', category: 'THROWABLE', kills: 6, accuracy: null, matchCount: 6 })
  })

  it('écarte ce qui n’est pas une arme (véhicules, None) et les lignes vides', () => {
    expect(weapons.map((weapon) => weapon.id).sort()).toEqual(['m416', 'molotov'])
  })

  it('arme de prédilection, loadout de l’armurerie (4 emplacements) et catégories', () => {
    expect(favouriteWeapon(weapons)?.name).toBe('M416')
    const loadout = memberLoadout(weapons)
    expect(loadout.map((slot) => slot.slot)).toEqual([1, 2, 3, 4])
    expect(loadout[0].weapon?.name).toBe('M416')
    expect(loadout[1].weapon).toBeNull()
    expect(categoryCounts(weapons)).toEqual([
      { category: 'AR', count: 1 },
      { category: 'THROWABLE', count: 1 },
    ])
  })

  it('la secondaire vient d’une autre famille que la principale', () => {
    const loadout = memberLoadout(
      aggregateMemberWeapons([
        row('WeapHK416_C', { kills: 30 }),
        row('WeapBerylM762_C', { kills: 20 }),
        row('WeapMini14_C', { kills: 5 }),
        row('WeapM1911_C', { kills: 1 }),
      ])
    )
    expect(loadout.map((slot) => slot.weapon?.id ?? null)).toEqual(['m416', 'mini14', 'p1911', null])
  })

  it('records aux seuils de l’armurerie : 100 tirs pour la précision, 5 kills pour les headshots', () => {
    const records = memberRecords(
      aggregateMemberWeapons([
        row('WeapHK416_C', { kills: 12, headshots: 3, shotsFired: 400, hitsLanded: 80, maxDistance: 150 }),
        row('WeapKar98k_C', { kills: 4, headshots: 4, shotsFired: 20, hitsLanded: 18, maxDistance: 320 }),
      ])
    )
    expect(records.map((record) => [record.id, record.weapon?.id ?? null, record.value])).toEqual([
      ['longest', 'kar98k', 320],
      ['accuracy', 'm416', 20],
      ['headshots', 'm416', 25],
    ])
    expect(memberRecords([]).every((record) => record.weapon === null && record.value === null)).toBe(true)
  })

  it('tris : une arme sans tir passe après les autres en précision', () => {
    const accuracy = SITE_SORTS.find((sort) => sort.key === 'accuracy')!
    const list = aggregateMemberWeapons([row('ProjGrenade_C', { kills: 9 }), row('WeapUMP_C', { kills: 1, shotsFired: 10, hitsLanded: 1 })])
    expect([...list].sort((a, b) => accuracy.value(b) - accuracy.value(a)).map((weapon) => weapon.category)).toEqual(['SMG', 'THROWABLE'])
  })
})

describe('onglet PUBG — maîtrise', () => {
  it('relie l’identifiant de maîtrise au catalogue par l’identifiant télémétrie', () => {
    expect(masteryTelemetryId('Item_Weapon_HK416_C')).toBe('WeapHK416_C')
    expect(masteryCategory({ weaponId: 'Item_Weapon_HK416_C', weaponName: 'HK416' })).toBe('AR')
    expect(masteryCategory({ weaponId: 'Item_Weapon_FNFal_C', weaponName: 'FNFal' })).toBe('DMR')
    expect(masteryCategory({ weaponId: 'Item_Weapon_Grenade_C', weaponName: 'Grenade' })).toBe('THROWABLE')
    expect(masteryCategory({ weaponId: 'Item_Weapon_BluezoneGrenade_C', weaponName: 'BluezoneGrenade' })).toBe('THROWABLE')
    expect(masteryCategory({ weaponId: 'Item_Weapon_Inconnue_C', weaponName: 'Inconnue' })).toBe('OTHER')
  })

  const weapons = masteryWeapons([
    mastery('Item_Weapon_HK416_C', { weaponLabel: 'M416', kills: 5720, knockouts: 3708, headshots: 3514, damage: 701241, level: 99, tier: 6, xpTotal: 952500 }),
    mastery('Item_Weapon_M249_C', { weaponLabel: 'M249', kills: 296, knockouts: 209, headshots: 169, damage: 34980, level: 99, tier: 1, xpTotal: 939780 }),
    mastery('Item_Weapon_Grenade_C', { weaponLabel: 'Grenade', kills: 40, level: 20, lastRefreshedAt: '2026-09-27T05:00:00.000Z' }),
    mastery('Item_Weapon_Pan_C', { level: 0, kills: 0 }),
  ])

  it('écarte les armes jamais utilisées et garde le libellé du site', () => {
    expect(weapons.map((weapon) => weapon.name)).toEqual(['M416', 'M249', 'Grenade'])
    expect(weapons[0]).toMatchObject({ iconId: 'Item_Weapon_HK416_C', category: 'AR', knocks: 3708, expert: 6, xp: 952500 })
  })

  it('arme la plus maîtrisée : le niveau d’expert passe avant le niveau', () => {
    expect(mostMasteredWeapon(weapons)?.name).toBe('M416')
    const level = PUBG_SORTS.find((sort) => sort.key === 'level')!
    expect([...weapons].sort(level.compare).map((weapon) => weapon.expert)).toEqual([6, 1, 0])
    expect(mostMasteredWeapon([])).toBeNull()
  })

  it('totaux de carrière, niveaux d’expert et dernière synchro', () => {
    expect(careerTotals(weapons)).toEqual({ kills: 6056, knocks: 3917, damage: 736221, headshots: 3683 })
    expect(expertDistribution(weapons)).toEqual([
      { expert: 0, count: 1 },
      { expert: 1, count: 1 },
      { expert: 6, count: 1 },
    ])
    expect(lastMasteryRefresh([mastery('a'), mastery('b', { lastRefreshedAt: '2026-09-27T05:00:00.000Z' })])).toBe('2026-09-27T05:00:00.000Z')
    expect(lastMasteryRefresh([])).toBeNull()
  })
})

describe('commun', () => {
  it('onglet lu dans l’URL, site par défaut', () => {
    expect(parseArsenalSource('pubg')).toBe('pubg')
    expect(parseArsenalSource('PUBG')).toBe('site')
    expect(parseArsenalSource(null)).toBe('site')
  })

  it('libellés des lancers en français, sinon l’identifiant lisible', () => {
    expect(throwableLabel('Item_Weapon_SmokeBomb_C')).toBe('Fumigène')
    expect(throwableLabel('Item_Weapon_Juju_C')).toBe('Orbe mystérieux')
    expect(throwableLabel('Item_Weapon_Inconnu_C')).toBe('Inconnu')
  })

  it('loadout : lancers de combat seulement (pas l’orbe de l’événement ni la pomme), du plus lancé au moins lancé', () => {
    const items = [
      { itemId: 'Item_Weapon_Juju_C', count: 53 },
      { itemId: 'Item_Weapon_SmokeBomb_C', count: 10 },
      { itemId: 'Item_Weapon_Grenade_C', count: 35 },
      { itemId: 'Item_Weapon_Apple_C', count: 4 },
      { itemId: 'Item_Weapon_C4_C', count: 0 },
    ]
    expect(loadoutThrows(items).map((item) => item.itemId)).toEqual(['Item_Weapon_Grenade_C', 'Item_Weapon_SmokeBomb_C'])
  })
})
