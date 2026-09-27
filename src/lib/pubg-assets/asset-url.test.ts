import { describe, expect, it } from 'vitest'

import { weaponIconUrl, weaponWhiteIconUrl } from './asset-url'

/**
 * Noms de fichiers d'icônes : la production tourne sous Linux, sensible à la casse. Une casse fausse ne se voit pas sous
 * Windows et donne un 404 en production (noms relevés dans public/icons/pubg/weapons/ le 2026-09-27).
 */
describe('asset-url — icônes d’armes', () => {
  it('silhouette blanche : nom de l’icône suivi de _w', () => {
    expect(weaponWhiteIconUrl('WeapAK47_C')).toBe('/icons/pubg/weapons/Item_Weapon_AK47_C_w.png')
    expect(weaponWhiteIconUrl('WeapMosinNagant_C')).toBe('/icons/pubg/weapons/Item_Weapon_Mosin_C_w.png')
    // Un skin reprend la silhouette de l'arme de base.
    expect(weaponWhiteIconUrl('WeapJuliesKar98k_C')).toBe('/icons/pubg/weapons/Item_Weapon_Kar98k_C_w.png')
  })

  it('silhouette blanche : la casse du fichier blanc, pas celle de l’icône', () => {
    expect(weaponIconUrl('WeapFNFal_C')).toBe('/icons/pubg/weapons/Item_Weapon_FNFal_C.png')
    expect(weaponWhiteIconUrl('WeapFNFal_C')).toBe('/icons/pubg/weapons/Item_Weapon_FNFAL_C_w.png')
    expect(weaponWhiteIconUrl('WeapGroza_C')).toBe('/icons/pubg/weapons/Item_Weapon_GROZA_C_w.png')
  })

  it('identifiants dont la casse diffère du fichier d’icône', () => {
    expect(weaponIconUrl('WeapFamasG2_C')).toBe('/icons/pubg/weapons/Item_Weapon_FAMASG2_C.png')
    expect(weaponWhiteIconUrl('WeapFamasG2_C')).toBe('/icons/pubg/weapons/Item_Weapon_FAMASG2_C_w.png')
    expect(weaponIconUrl('WeapPickAxe_C')).toBe('/icons/pubg/weapons/Item_Weapon_Pickaxe_C.png')
  })
})
