import { describe, expect, it } from 'vitest'

import {
  aggregateWeapons,
  armoryCategories,
  buildLoadout,
  categoryKills,
  computeFeats,
  paginationItems,
  parseArmoryCategory,
  rankArmoryRows,
  rowCategory,
  signatureWeapon,
  weaponRack,
  type ArmoryRow,
} from './armory'

function row(overrides: Partial<ArmoryRow> & Pick<ArmoryRow, 'memberId' | 'displayName' | 'weaponName' | 'kills'>): ArmoryRow {
  return {
    headshots: 0,
    shotsFired: 0,
    hitsLanded: 0,
    avgDistance: 40,
    maxDistance: null,
    totalDamage: overrides.kills * 120,
    matchCount: 5,
    ...overrides,
  }
}

const ALPHA = { memberId: 1, displayName: 'Joueur Alpha' }
const BRAVO = { memberId: 2, displayName: 'Joueur Bravo' }

const ROWS: ArmoryRow[] = [
  row({ ...ALPHA, weaponName: 'WeapBerylM762_C', weaponLabel: 'Beryl M762', kills: 30, headshots: 6, shotsFired: 1000, hitsLanded: 300, maxDistance: 180 }),
  row({ ...BRAVO, weaponName: 'WeapBerylM762_C', weaponLabel: 'Beryl M762', kills: 12, headshots: 1, shotsFired: 400, hitsLanded: 80 }),
  row({ ...ALPHA, weaponName: 'WeapHK416_C', weaponLabel: 'M416', kills: 20, shotsFired: 600, hitsLanded: 150 }),
  row({ ...BRAVO, weaponName: 'WeapKar98k_C', weaponLabel: 'Kar98k', kills: 8, headshots: 5, shotsFired: 40, hitsLanded: 20, maxDistance: 412 }),
  row({ ...BRAVO, weaponName: 'WeapJuliesKar98k_C', weaponLabel: 'Kar98k', kills: 3, headshots: 3, shotsFired: 10, hitsLanded: 6 }),
  row({ ...ALPHA, weaponName: 'WeapG18_C', weaponLabel: 'P18C', kills: 2, shotsFired: 60, hitsLanded: 15 }),
  row({ ...BRAVO, weaponName: 'ProjGrenade_C', weaponLabel: 'Frag Grenade', kills: 4 }),
  row({ ...ALPHA, weaponName: 'Dacia_A_03_v2_C', weaponLabel: 'Dacia', kills: 1 }),
]

const label = (id: string) => ({ WeapBerylM762_C: 'Beryl M762', WeapHK416_C: 'M416', WeapKar98k_C: 'Kar98k' })[id] ?? id

describe('armory — catégories', () => {
  it('répartit les kills par catégorie, sans en perdre', () => {
    const kills = categoryKills(ROWS)
    expect(kills.AR).toBe(62)
    expect(kills.SR).toBe(11)
    expect(kills.PISTOL).toBe(2)
    expect(kills.OTHER).toBe(1)
    expect(Object.values(kills).reduce((sum, value) => sum + value, 0)).toBe(ROWS.reduce((sum, r) => sum + r.kills, 0))
  })

  it('les dix catégories toujours, « Autre » seulement quand elle a des lignes', () => {
    expect(armoryCategories(ROWS)).toHaveLength(11)
    expect(armoryCategories(ROWS.filter((r) => rowCategory(r) !== 'OTHER'))).not.toContain('OTHER')
    expect(armoryCategories([])).toHaveLength(10)
  })

  it('la catégorie de l’API prime, sinon elle est recalculée', () => {
    expect(rowCategory({ ...ROWS[0], weaponCategoryCode: 'DMR' })).toBe('DMR')
    expect(rowCategory({ ...ROWS[0], weaponCategoryCode: 'Autre' })).toBe('AR')
  })

  it('lit la catégorie de l’URL sans tenir compte de la casse', () => {
    expect(parseArmoryCategory('sr')).toBe('SR')
    expect(parseArmoryCategory('THROWABLE')).toBe('THROWABLE')
    expect(parseArmoryCategory('Autre')).toBeNull()
    expect(parseArmoryCategory(null)).toBeNull()
  })
})

describe('armory — armes, loadout et râtelier', () => {
  const weapons = aggregateWeapons(ROWS, label)
  const byId = (id: string) => weapons.find((weapon) => weapon.id === id)

  it('regroupe les variantes d’une arme et désigne son maître', () => {
    expect(byId('kar98k')).toMatchObject({ kills: 11, shotsFired: 50, hitsLanded: 26, master: { displayName: 'Joueur Bravo', kills: 11 } })
    expect(byId('beryl m762')?.master).toEqual({ displayName: 'Joueur Alpha', kills: 30 })
  })

  it('garde les armes du catalogue sans kill, jamais fumigène ni flash', () => {
    expect(byId('awm')).toMatchObject({ kills: 0, master: null, accuracy: null })
    expect(byId('smoke grenade')).toBeUndefined()
    expect(byId('stun grenade')).toBeUndefined()
  })

  it('nomme une arme par sa ligne principale, sinon par le catalogue ou le dictionnaire', () => {
    // RPD : absent du dictionnaire PUBG (4 912 kills en production le 2026-09-27), nommé par le catalogue.
    expect(byId('rpd')?.name).toBe('RPD')
    expect(byId('awm')?.name).toBe('WeapAWM_C') // `label` de test : pas d'entrée, identifiant rendu tel quel
    const molotov = aggregateWeapons(
      [row({ ...ALPHA, weaponName: 'BP_MolotovFireDebuff_C', weaponLabel: 'Molotov Fire Debuff', kills: 3 })],
      () => 'Molotov Cocktail'
    ).find((weapon) => weapon.id === 'molotov')
    expect(molotov).toMatchObject({ name: 'Molotov Cocktail', kills: 3, iconId: 'ProjMolotov_C' })
  })

  it('ajoute les causes hors catalogue (véhicule) dans « Autre »', () => {
    expect(byId('Dacia_A_03_v2_C')).toMatchObject({ category: 'OTHER', kills: 1, name: 'Dacia' })
  })

  it('arme signature = la plus meurtrière', () => {
    expect(signatureWeapon(weapons)?.name).toBe('Beryl M762')
    expect(signatureWeapon(aggregateWeapons([], label))).toBeNull()
  })

  it('loadout : secondaire d’une autre famille, emplacement vide sans kill', () => {
    const loadout = buildLoadout(weapons)
    expect(loadout.map((slot) => slot.weapon?.id ?? null)).toEqual(['beryl m762', 'kar98k', 'p18c', null, 'frag grenade'])
  })

  it('râtelier : classé par kills, armes sans kill à la fin', () => {
    const rack = weaponRack(weapons, 'SR')
    expect(rack[0].id).toBe('kar98k')
    expect(rack.slice(1).every((weapon) => weapon.kills === 0)).toBe(true)
    expect(rack.map((weapon) => weapon.id)).toContain('lynx amr')
  })
})

describe('armory — hauts faits', () => {
  it('prend les records de la sélection', () => {
    const feats = Object.fromEntries(computeFeats(ROWS).map((feat) => [feat.id, feat]))
    expect(feats.longest).toMatchObject({ value: '412 m', who: 'Joueur Bravo · Kar98k' })
    // Kar98k (5 hs sur 8 kills) : 62,5 %, arrondi à 63 ; le Kar98k de Julie (3 sur 3) est sous le seuil de 5 kills.
    expect(feats.headshots).toMatchObject({ value: '63 %', who: 'Joueur Bravo · Kar98k' })
    // 100 tirs minimum : le Kar98k (40 tirs, 50 %) ne compte pas.
    expect(feats.surgeon).toMatchObject({ value: '30 % touchés', who: 'Joueur Alpha · Beryl M762' })
    expect(feats.trigger.value).toBe('1 000 balles')
  })

  it('« Pas assez de données » plutôt qu’un record de hasard', () => {
    const feats = computeFeats([row({ ...ALPHA, weaponName: 'WeapPan_C', kills: 1 })])
    expect(feats.map((feat) => feat.value)).toEqual([null, null, null, null])
  })
})

describe('armory — classement', () => {
  it('rang = ordre décroissant du critère, médailles gardées en tri croissant', () => {
    const desc = rankArmoryRows(ROWS, 'kills', 'desc')
    expect(desc.slice(0, 3).map(({ entry, rank }) => [entry.weaponName, rank])).toEqual([
      ['WeapBerylM762_C', 1],
      ['WeapHK416_C', 2],
      ['WeapBerylM762_C', 3],
    ])
    const asc = rankArmoryRows(ROWS, 'kills', 'asc')
    expect(asc[asc.length - 1].rank).toBe(1)
  })

  it('podium recalculé sur la sélection filtrée (l’ancien calcul ignorait le filtre)', () => {
    const snipers = ROWS.filter((r) => rowCategory(r) === 'SR')
    expect(rankArmoryRows(snipers, 'kills', 'desc').map(({ rank }) => rank)).toEqual([1, 2])
  })

  it('tri texte : ordre alphabétique, rang au nombre de kills', () => {
    const ranked = rankArmoryRows(ROWS, 'player', 'asc')
    expect(ranked[0].entry.displayName).toBe('Joueur Alpha')
    expect(ranked[0].rank).toBe(1)
    expect(ranked[ranked.length - 1].entry.displayName).toBe('Joueur Bravo')
  })

  it('précision absente (explosifs) classée en dernier', () => {
    const ranked = rankArmoryRows(ROWS, 'accuracy', 'desc')
    expect(ranked[ranked.length - 1].entry.shotsFired).toBe(0)
  })
})

describe('armory — pagination', () => {
  it('première, dernière, courante et voisines, « … » entre', () => {
    expect(paginationItems(1, 3)).toEqual([1, 2, 3])
    expect(paginationItems(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
    expect(paginationItems(1, 1)).toEqual([1])
  })
})
