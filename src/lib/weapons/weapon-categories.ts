export type WeaponCategory =
  | 'AR'
  | 'DMR'
  | 'SR'
  | 'SMG'
  | 'LMG'
  | 'SG'
  | 'PISTOL'
  | 'MELEE'
  | 'THROWABLE'
  | 'SPECIAL'
  | 'OTHER'

type WeaponCategoryEntry = {
  key: string
  category: WeaponCategory
  aliases: readonly string[]
}

const WEAPON_CATEGORY_ENTRIES: readonly WeaponCategoryEntry[] = [
  { key: 'akm', category: 'AR', aliases: ['akm', 'item_weapon_akm_c'] },
  { key: 'm16a4', category: 'AR', aliases: ['m16a4', 'item_weapon_m16a4_c'] },
  { key: 'm416', category: 'AR', aliases: ['m416', 'item_weapon_m416_c'] },
  { key: 'scar-l', category: 'AR', aliases: ['scar-l', 'scarl', 'item_weapon_scarl_c'] },
  { key: 'beryl m762', category: 'AR', aliases: ['beryl m762', 'm762', 'item_weapon_berylm762_c'] },
  { key: 'aug a3', category: 'AR', aliases: ['aug a3', 'aug', 'item_weapon_aug_c'] },
  { key: 'ace32', category: 'AR', aliases: ['ace32', 'item_weapon_ace32_c'] },
  { key: 'qbz95', category: 'AR', aliases: ['qbz95', 'qbz', 'item_weapon_qbz95_c'] },
  { key: 'g36c', category: 'AR', aliases: ['g36c', 'item_weapon_g36c_c'] },
  { key: 'k2', category: 'AR', aliases: ['k2', 'item_weapon_k2_c'] },
  { key: 'mk47 mutant', category: 'AR', aliases: ['mk47 mutant', 'mutant', 'item_weapon_mutant_c'] },
  { key: 'famas', category: 'AR', aliases: ['famas', 'item_weapon_famasg2_c'] },

  { key: 'mini14', category: 'DMR', aliases: ['mini14', 'item_weapon_mini14_c'] },
  { key: 'slr', category: 'DMR', aliases: ['slr', 'item_weapon_slr_c'] },
  { key: 'sks', category: 'DMR', aliases: ['sks', 'item_weapon_sks_c'] },
  { key: 'mk12', category: 'DMR', aliases: ['mk12', 'item_weapon_mk12_c'] },
  { key: 'vss', category: 'DMR', aliases: ['vss', 'item_weapon_vss_c'] },
  { key: 'qbu88', category: 'DMR', aliases: ['qbu88', 'qbu', 'item_weapon_qbu88_c'] },
  { key: 'mk14', category: 'DMR', aliases: ['mk14', 'item_weapon_mk14_c'] },

  { key: 'kar98k', category: 'SR', aliases: ['kar98k', 'item_weapon_kar98k_c'] },
  { key: 'm24', category: 'SR', aliases: ['m24', 'item_weapon_m24_c'] },
  { key: 'awm', category: 'SR', aliases: ['awm', 'item_weapon_awm_c'] },
  { key: 'mosin nagant', category: 'SR', aliases: ['mosin nagant', 'mosin', 'item_weapon_mosin_c'] },
  { key: 'win94', category: 'SR', aliases: ['win94', 'item_weapon_win1894_c'] },
  { key: 'lynx amr', category: 'SR', aliases: ['lynx amr', 'lynx', 'item_weapon_lynx_c'] },

  { key: 'ump45', category: 'SMG', aliases: ['ump45', 'ump', 'item_weapon_ump_c'] },
  { key: 'vector', category: 'SMG', aliases: ['vector', 'item_weapon_vector_c'] },
  { key: 'tommy gun', category: 'SMG', aliases: ['tommy gun', 'tommy', 'item_weapon_thompson_c'] },
  { key: 'micro uzi', category: 'SMG', aliases: ['micro uzi', 'uzi', 'item_weapon_uzi_c'] },
  { key: 'mp5k', category: 'SMG', aliases: ['mp5k', 'item_weapon_mp5k_c'] },
  { key: 'pp-19 bizon', category: 'SMG', aliases: ['pp-19 bizon', 'bizon', 'item_weapon_bizonpp19_c'] },
  { key: 'mp9', category: 'SMG', aliases: ['mp9', 'item_weapon_mp9_c'] },
  { key: 'js9', category: 'SMG', aliases: ['js9', 'item_weapon_js9_c'] },

  { key: 'm249', category: 'LMG', aliases: ['m249', 'item_weapon_m249_c'] },
  { key: 'dp-28', category: 'LMG', aliases: ['dp-28', 'dp28', 'item_weapon_dp28_c'] },
  { key: 'mg3', category: 'LMG', aliases: ['mg3', 'item_weapon_mg3_c'] },

  { key: 's12k', category: 'SG', aliases: ['s12k', 'item_weapon_s12k_c'] },
  { key: 's1897', category: 'SG', aliases: ['s1897', 'item_weapon_winchester_c'] },
  { key: 's686', category: 'SG', aliases: ['s686', 'item_weapon_berreta686_c'] },
  { key: 'dbs', category: 'SG', aliases: ['dbs', 'item_weapon_dbs_c'] },
  { key: 'o12', category: 'SG', aliases: ['o12', 'item_weapon_o12_c'] },

  { key: 'p92', category: 'PISTOL', aliases: ['p92', 'item_weapon_p92_c'] },
  { key: 'p1911', category: 'PISTOL', aliases: ['p1911', 'item_weapon_p1911_c'] },
  { key: 'p18c', category: 'PISTOL', aliases: ['p18c', 'item_weapon_p18c_c'] },
  { key: 'r1895', category: 'PISTOL', aliases: ['r1895', 'item_weapon_nagantm1895_c'] },
  { key: 'r45', category: 'PISTOL', aliases: ['r45', 'item_weapon_rhino_c'] },
  { key: 'deagle', category: 'PISTOL', aliases: ['deagle', 'item_weapon_deagle_c'] },
  { key: 'skorpion', category: 'PISTOL', aliases: ['skorpion', 'item_weapon_skorpion_c'] },

  { key: 'pan', category: 'MELEE', aliases: ['pan', 'item_weapon_pan_c'] },
  { key: 'machete', category: 'MELEE', aliases: ['machete', 'item_weapon_machete_c'] },
  { key: 'crowbar', category: 'MELEE', aliases: ['crowbar', 'item_weapon_cowbar_c'] },
  { key: 'sickle', category: 'MELEE', aliases: ['sickle', 'item_weapon_sickle_c'] },

  { key: 'frag grenade', category: 'THROWABLE', aliases: ['frag grenade', 'grenade', 'item_weapon_thrown_c'] },
  { key: 'molotov', category: 'THROWABLE', aliases: ['molotov', 'item_weapon_molotov_c'] },
  { key: 'smoke grenade', category: 'THROWABLE', aliases: ['smoke grenade', 'item_weapon_smokegrenade_c'] },
  { key: 'stun grenade', category: 'THROWABLE', aliases: ['stun grenade', 'item_weapon_flashbang_c'] },
  { key: 'c4', category: 'THROWABLE', aliases: ['c4', 'item_weapon_c4_c'] },

  { key: 'crossbow', category: 'SPECIAL', aliases: ['crossbow', 'item_weapon_crossbow_c'] },
  { key: 'panzerfaust', category: 'SPECIAL', aliases: ['panzerfaust', 'item_weapon_panzerfaust100m1_c'] },
  { key: 'mortar', category: 'SPECIAL', aliases: ['mortar', 'item_weapon_mortar_c'] },
  { key: 'bluezone grenade', category: 'SPECIAL', aliases: ['bluezone grenade', 'item_weapon_bluezonegrenade_c'] },
]

const CATEGORY_BY_ALIAS = new Map<string, WeaponCategory>()

for (const entry of WEAPON_CATEGORY_ENTRIES) {
  for (const alias of entry.aliases) {
    CATEGORY_BY_ALIAS.set(normalizeWeaponAlias(alias), entry.category)
  }
}

export function normalizeWeaponAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, ' ')
}

export function getWeaponCategory(weaponNameOrKey: string): WeaponCategory {
  const normalized = normalizeWeaponAlias(weaponNameOrKey)
  return CATEGORY_BY_ALIAS.get(normalized) ?? 'OTHER'
}

export function getWeaponCategoryAliases(): ReadonlyArray<WeaponCategoryEntry> {
  return WEAPON_CATEGORY_ENTRIES
}
