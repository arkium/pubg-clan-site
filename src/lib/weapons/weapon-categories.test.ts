import { describe, expect, it } from 'vitest'

import { WEAPON_CATEGORY_INFO } from './weapon-category-info'
import {
  WEAPON_CATEGORY_LABELS,
  WEAPON_CATEGORY_ORDER,
  findWeaponEntry,
  getWeaponCategory,
  getWeaponCategoryAliases,
  isWeaponCategory,
} from './weapon-categories'

describe('weapon-categories — catalogue', () => {
  const entries = getWeaponCategoryAliases()

  it('clés uniques, au moins un identifiant télémétrie par arme', () => {
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length)
    expect(entries.filter((entry) => entry.telemetryIds.length === 0)).toEqual([])
  })

  it('un identifiant télémétrie ne désigne qu’une seule arme', () => {
    const ids = entries.flatMap((entry) => entry.telemetryIds)
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
  })

  it('chaque catégorie d’armes a au moins une arme ; « Autre » aucune', () => {
    const used = new Set(entries.map((entry) => entry.category))
    expect(WEAPON_CATEGORY_ORDER.filter((category) => category !== 'OTHER' && !used.has(category))).toEqual([])
    expect(used.has('OTHER')).toBe(false)
  })

  it('libellés et textes ne citent que des catégories connues', () => {
    expect(Object.keys(WEAPON_CATEGORY_LABELS).sort()).toEqual([...WEAPON_CATEGORY_ORDER].sort())
    expect(Object.keys(WEAPON_CATEGORY_INFO).filter((code) => !isWeaponCategory(code))).toEqual([])
  })

  it('chaque catégorie a son accroche, sa description et son conseil pro', () => {
    const missing = WEAPON_CATEGORY_ORDER.filter((category) => {
      const info = WEAPON_CATEGORY_INFO[category]
      return !info?.tagline.trim() || !info.description.trim() || !info.tip.trim()
    })
    expect(missing).toEqual([])
  })
})

describe('weapon-categories — classement des identifiants réels', () => {
  it.each([
    // L'incohérence relevée par l'audit : le P18C tombait dans « Autre » sur la page Armes.
    ['WeapG18_C', 'PISTOL'],
    ['WeapFamasG2_C', 'AR'],
    ['WeapMosin_C', 'SR'],
    ['WeapWin1894_C', 'SR'],
    ['WeapJuliesKar98k_C', 'SR'],
    ['WeapPickaxe_C', 'MELEE'],
    ['WeapPanProjectile_C', 'MELEE'],
    ['BP_MolotovFireDebuff_C', 'THROWABLE'],
    ['ProjGrenade_C', 'THROWABLE'],
    ['PanzerFaust100M_Projectile_C', 'SPECIAL'],
    ['Dacia_A_03_v2_C', 'OTHER'],
    ['PlayerMale_A_C', 'OTHER'],
  ])('%s → %s', (id, category) => {
    expect(getWeaponCategory(id)).toBe(category)
  })

  it('les variantes d’une arme se regroupent sous sa clé', () => {
    expect(findWeaponEntry('WeapJuliesKar98k_C')?.key).toBe('kar98k')
    expect(findWeaponEntry('WeapDuncansHK416_C')?.key).toBe('m416')
  })

  it("l'identifiant l'emporte sur un libellé renommé par l'administration", () => {
    expect(findWeaponEntry('WeapHK416_C', 'Mon fusil préféré')?.key).toBe('m416')
  })

  it('un identifiant inconnu se rattrape par son libellé, puis tombe dans « Autre »', () => {
    expect(getWeaponCategory('WeapHK416Nouveau_C', 'M416')).toBe('AR')
    expect(getWeaponCategory('WeapInconnu_C', 'Inconnu')).toBe('OTHER')
  })

  it('les noms et alias restent reconnus (page armes d’un joueur)', () => {
    expect(getWeaponCategory('Beryl M762')).toBe('AR')
    expect(getWeaponCategory('mosin')).toBe('SR')
  })
})
