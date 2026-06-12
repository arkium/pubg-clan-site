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
  { key: 'akm', category: 'AR', aliases: ['akm'] },
  { key: 'm16a4', category: 'AR', aliases: ['m16a4'] },
  { key: 'm416', category: 'AR', aliases: ['m416'] },
  { key: 'scar-l', category: 'AR', aliases: ['scar-l', 'scarl'] },
  { key: 'beryl m762', category: 'AR', aliases: ['beryl m762', 'm762'] },
  { key: 'aug a3', category: 'AR', aliases: ['aug a3', 'aug'] },
  { key: 'ace32', category: 'AR', aliases: ['ace32'] },
  { key: 'qbz95', category: 'AR', aliases: ['qbz95', 'qbz'] },
  { key: 'g36c', category: 'AR', aliases: ['g36c'] },
  { key: 'k2', category: 'AR', aliases: ['k2'] },
  { key: 'mk47 mutant', category: 'AR', aliases: ['mk47 mutant', 'mutant'] },
  { key: 'famas', category: 'AR', aliases: ['famas'] },

  { key: 'mini14', category: 'DMR', aliases: ['mini14'] },
  { key: 'slr', category: 'DMR', aliases: ['slr'] },
  { key: 'sks', category: 'DMR', aliases: ['sks'] },
  { key: 'mk12', category: 'DMR', aliases: ['mk12'] },
  { key: 'vss', category: 'DMR', aliases: ['vss'] },
  { key: 'qbu88', category: 'DMR', aliases: ['qbu88', 'qbu'] },
  { key: 'mk14', category: 'DMR', aliases: ['mk14'] },

  { key: 'kar98k', category: 'SR', aliases: ['kar98k'] },
  { key: 'm24', category: 'SR', aliases: ['m24'] },
  { key: 'awm', category: 'SR', aliases: ['awm'] },
  { key: 'mosin nagant', category: 'SR', aliases: ['mosin nagant', 'mosin'] },
  { key: 'win94', category: 'SR', aliases: ['win94'] },
  { key: 'lynx amr', category: 'SR', aliases: ['lynx amr', 'lynx'] },

  { key: 'ump9', category: 'SMG', aliases: ['ump9', 'ump'] },
  { key: 'vector', category: 'SMG', aliases: ['vector'] },
  { key: 'tommy gun', category: 'SMG', aliases: ['tommy gun', 'tommy'] },
  { key: 'micro uzi', category: 'SMG', aliases: ['micro uzi', 'uzi'] },
  { key: 'mp5k', category: 'SMG', aliases: ['mp5k'] },
  { key: 'pp-19 bizon', category: 'SMG', aliases: ['pp-19 bizon', 'bizon'] },
  { key: 'mp9', category: 'SMG', aliases: ['mp9'] },
  { key: 'js9', category: 'SMG', aliases: ['js9'] },

  { key: 'm249', category: 'LMG', aliases: ['m249'] },
  { key: 'dp-28', category: 'LMG', aliases: ['dp-28', 'dp28'] },
  { key: 'mg3', category: 'LMG', aliases: ['mg3'] },

  { key: 's12k', category: 'SG', aliases: ['s12k'] },
  { key: 's1897', category: 'SG', aliases: ['s1897'] },
  { key: 's686', category: 'SG', aliases: ['s686'] },
  { key: 'dbs', category: 'SG', aliases: ['dbs'] },
  { key: 'o12', category: 'SG', aliases: ['o12'] },

  { key: 'p92', category: 'PISTOL', aliases: ['p92'] },
  { key: 'p1911', category: 'PISTOL', aliases: ['p1911'] },
  { key: 'p18c', category: 'PISTOL', aliases: ['p18c'] },
  { key: 'r1895', category: 'PISTOL', aliases: ['r1895'] },
  { key: 'r45', category: 'PISTOL', aliases: ['r45'] },
  { key: 'deagle', category: 'PISTOL', aliases: ['deagle'] },
  { key: 'skorpion', category: 'PISTOL', aliases: ['skorpion'] },

  { key: 'pan', category: 'MELEE', aliases: ['pan'] },
  { key: 'machete', category: 'MELEE', aliases: ['machete'] },
  { key: 'crowbar', category: 'MELEE', aliases: ['crowbar'] },
  { key: 'sickle', category: 'MELEE', aliases: ['sickle'] },

  { key: 'frag grenade', category: 'THROWABLE', aliases: ['frag grenade', 'grenade'] },
  { key: 'molotov', category: 'THROWABLE', aliases: ['molotov'] },
  { key: 'smoke grenade', category: 'THROWABLE', aliases: ['smoke grenade'] },
  { key: 'stun grenade', category: 'THROWABLE', aliases: ['stun grenade'] },
  { key: 'c4', category: 'THROWABLE', aliases: ['c4'] },

  { key: 'crossbow', category: 'SPECIAL', aliases: ['crossbow'] },
  { key: 'panzerfaust', category: 'SPECIAL', aliases: ['panzerfaust'] },
  { key: 'mortar', category: 'SPECIAL', aliases: ['mortar'] },
  { key: 'bluezone grenade', category: 'SPECIAL', aliases: ['bluezone grenade'] },
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
