/**
 * Liste unique des catégories d'armes du site (docs/features/weapons.md §5) : l'armurerie du clan, la page armes
 * d'un joueur et la route `/api/clans/[clanId]/telemetry/weapons` classent toutes par ce fichier. Module pur, sans
 * Prisma : il est importé côté client.
 */
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

export type WeaponCategoryEntry = {
  key: string
  category: WeaponCategory
  aliases: readonly string[]
  /**
   * Identifiants de damage-causer télémétrie de l'arme (`MemberWeaponStats.weaponName`). Le premier sert d'icône et de
   * libellé ; les suivants sont ses variantes réelles (skins, projectile lancé, champ de feu), relevées en base le
   * 2026-09-27. Fumigène et flash n'ont aucun causer réel (ils ne tuent pas) : leurs IDs sont synthétiques, pour l'icône.
   */
  telemetryIds: readonly string[]
  /** Nom affiché quand le dictionnaire PUBG (`damageCauserName.json`) n'en a pas pour le premier identifiant. */
  label?: string
}

/** Ordre d'affichage. `OTHER` regroupe ce qui n'est pas une arme (véhicules, poings, feu d'un jerrican, zone…). */
export const WEAPON_CATEGORY_ORDER: readonly WeaponCategory[] = [
  'AR',
  'DMR',
  'SR',
  'SMG',
  'LMG',
  'SG',
  'PISTOL',
  'MELEE',
  'THROWABLE',
  'SPECIAL',
  'OTHER',
]

export const WEAPON_CATEGORY_LABELS: Record<WeaponCategory, string> = {
  AR: "Fusils d'assaut",
  DMR: 'Fusils de précision',
  SR: 'Snipers',
  SMG: 'Pistolets-mitrailleurs',
  LMG: 'Mitrailleuses',
  SG: 'Fusils à pompe',
  PISTOL: 'Pistolets',
  MELEE: 'Mêlée',
  THROWABLE: 'Explosifs',
  SPECIAL: 'Spécial',
  OTHER: 'Autre',
}

const WEAPON_CATEGORY_ENTRIES: readonly WeaponCategoryEntry[] = [
  { key: 'akm', category: 'AR', aliases: ['akm'], telemetryIds: ['WeapAK47_C', 'WeapLunchmeatsAK47_C', 'WeapLunchmeats_AK47_C'] },
  { key: 'm16a4', category: 'AR', aliases: ['m16a4'], telemetryIds: ['WeapM16A4_C'] },
  { key: 'm416', category: 'AR', aliases: ['m416'], telemetryIds: ['WeapHK416_C', 'WeapDuncansHK416_C', 'WeapDuncans_M416_C'] },
  { key: 'scar-l', category: 'AR', aliases: ['scar-l', 'scarl'], telemetryIds: ['WeapSCAR-L_C'] },
  { key: 'beryl m762', category: 'AR', aliases: ['beryl m762', 'm762'], telemetryIds: ['WeapBerylM762_C'] },
  { key: 'aug a3', category: 'AR', aliases: ['aug a3', 'aug'], telemetryIds: ['WeapAUG_C'] },
  { key: 'ace32', category: 'AR', aliases: ['ace32'], telemetryIds: ['WeapACE32_C'] },
  { key: 'qbz95', category: 'AR', aliases: ['qbz95', 'qbz'], telemetryIds: ['WeapQBZ95_C'] },
  { key: 'g36c', category: 'AR', aliases: ['g36c'], telemetryIds: ['WeapG36C_C'] },
  { key: 'k2', category: 'AR', aliases: ['k2'], telemetryIds: ['WeapK2_C'] },
  { key: 'mk47 mutant', category: 'AR', aliases: ['mk47 mutant', 'mutant'], telemetryIds: ['WeapMk47Mutant_C'] },
  { key: 'famas', category: 'AR', aliases: ['famas'], telemetryIds: ['WeapFamasG2_C', 'WeapFAMASG2_C'], label: 'FAMAS' },
  { key: 'groza', category: 'AR', aliases: ['groza'], telemetryIds: ['WeapGroza_C'] },

  { key: 'mini14', category: 'DMR', aliases: ['mini14'], telemetryIds: ['WeapMini14_C'] },
  { key: 'slr', category: 'DMR', aliases: ['slr'], telemetryIds: ['WeapFNFal_C'] },
  { key: 'sks', category: 'DMR', aliases: ['sks'], telemetryIds: ['WeapSKS_C'] },
  { key: 'mk12', category: 'DMR', aliases: ['mk12'], telemetryIds: ['WeapMk12_C'] },
  { key: 'vss', category: 'DMR', aliases: ['vss'], telemetryIds: ['WeapVSS_C'] },
  { key: 'qbu88', category: 'DMR', aliases: ['qbu88', 'qbu'], telemetryIds: ['WeapQBU88_C', 'WeapMadsQBU88_C'] },
  { key: 'mk14', category: 'DMR', aliases: ['mk14'], telemetryIds: ['WeapMk14_C'] },
  { key: 'dragunov', category: 'DMR', aliases: ['dragunov', 'svd'], telemetryIds: ['WeapDragunov_C'] },

  { key: 'kar98k', category: 'SR', aliases: ['kar98k'], telemetryIds: ['WeapKar98k_C', 'WeapJuliesKar98k_C', 'WeapJulies_Kar98k_C'] },
  { key: 'm24', category: 'SR', aliases: ['m24'], telemetryIds: ['WeapM24_C'] },
  { key: 'awm', category: 'SR', aliases: ['awm'], telemetryIds: ['WeapAWM_C'] },
  { key: 'mosin nagant', category: 'SR', aliases: ['mosin nagant', 'mosin'], telemetryIds: ['WeapMosinNagant_C', 'WeapMosin_C'] },
  { key: 'win94', category: 'SR', aliases: ['win94'], telemetryIds: ['WeapWin94_C', 'WeapWin1894_C'] },
  { key: 'lynx amr', category: 'SR', aliases: ['lynx amr', 'lynx'], telemetryIds: ['WeapL6_C'] },

  { key: 'ump9', category: 'SMG', aliases: ['ump9', 'ump'], telemetryIds: ['WeapUMP_C'] },
  { key: 'vector', category: 'SMG', aliases: ['vector'], telemetryIds: ['WeapVector_C'] },
  { key: 'tommy gun', category: 'SMG', aliases: ['tommy gun', 'tommy'], telemetryIds: ['WeapThompson_C'] },
  { key: 'micro uzi', category: 'SMG', aliases: ['micro uzi', 'uzi'], telemetryIds: ['WeapUZI_C'] },
  { key: 'mp5k', category: 'SMG', aliases: ['mp5k'], telemetryIds: ['WeapMP5K_C'] },
  { key: 'pp-19 bizon', category: 'SMG', aliases: ['pp-19 bizon', 'bizon'], telemetryIds: ['WeapBizonPP19_C'] },
  { key: 'mp9', category: 'SMG', aliases: ['mp9'], telemetryIds: ['WeapMP9_C'] },
  { key: 'js9', category: 'SMG', aliases: ['js9'], telemetryIds: ['WeapJS9_C'] },
  { key: 'p90', category: 'SMG', aliases: ['p90'], telemetryIds: ['WeapP90_C'] },

  { key: 'm249', category: 'LMG', aliases: ['m249'], telemetryIds: ['WeapM249_C'] },
  { key: 'dp-28', category: 'LMG', aliases: ['dp-28', 'dp28'], telemetryIds: ['WeapDP28_C'] },
  { key: 'mg3', category: 'LMG', aliases: ['mg3'], telemetryIds: ['WeapMG3_C'] },
  { key: 'rpd', category: 'LMG', aliases: ['rpd'], telemetryIds: ['WeapRPD_C'], label: 'RPD' },

  { key: 's12k', category: 'SG', aliases: ['s12k'], telemetryIds: ['WeapSaiga12_C'] },
  { key: 's1897', category: 'SG', aliases: ['s1897'], telemetryIds: ['WeapWinchester_C'] },
  { key: 's686', category: 'SG', aliases: ['s686'], telemetryIds: ['WeapBerreta686_C'] },
  { key: 'dbs', category: 'SG', aliases: ['dbs'], telemetryIds: ['WeapDP12_C', 'WeapDBS_C'] },
  { key: 'o12', category: 'SG', aliases: ['o12'], telemetryIds: ['WeapOriginS12_C'] },
  { key: 'sawed-off', category: 'SG', aliases: ['sawed-off', 'sawnoff'], telemetryIds: ['WeapSawnoff_C'] },

  { key: 'p92', category: 'PISTOL', aliases: ['p92'], telemetryIds: ['WeapM9_C'] },
  { key: 'p1911', category: 'PISTOL', aliases: ['p1911'], telemetryIds: ['WeapM1911_C'] },
  { key: 'p18c', category: 'PISTOL', aliases: ['p18c'], telemetryIds: ['WeapG18_C'] },
  { key: 'r1895', category: 'PISTOL', aliases: ['r1895'], telemetryIds: ['WeapNagantM1895_C'] },
  { key: 'r45', category: 'PISTOL', aliases: ['r45'], telemetryIds: ['WeapRhino_C'] },
  { key: 'deagle', category: 'PISTOL', aliases: ['deagle'], telemetryIds: ['WeapDesertEagle_C'] },
  { key: 'skorpion', category: 'PISTOL', aliases: ['skorpion'], telemetryIds: ['Weapvz61Skorpion_C'] },

  { key: 'pan', category: 'MELEE', aliases: ['pan'], telemetryIds: ['WeapPan_C', 'WeapPanProjectile_C'] },
  { key: 'machete', category: 'MELEE', aliases: ['machete'], telemetryIds: ['WeapMachete_C', 'WeapMacheteProjectile_C'] },
  { key: 'crowbar', category: 'MELEE', aliases: ['crowbar'], telemetryIds: ['WeapCowbar_C', 'WeapCowbarProjectile_C'] },
  { key: 'sickle', category: 'MELEE', aliases: ['sickle'], telemetryIds: ['WeapSickle_C', 'WeapSickleProjectile_C'] },
  { key: 'pickaxe', category: 'MELEE', aliases: ['pickaxe'], telemetryIds: ['WeapPickaxe_C', 'WeapPickAxe_C', 'WeapPickaxeProjectile_C'], label: 'Pickaxe' },

  { key: 'frag grenade', category: 'THROWABLE', aliases: ['frag grenade', 'grenade'], telemetryIds: ['ProjGrenade_C'] },
  {
    key: 'molotov',
    category: 'THROWABLE',
    aliases: ['molotov'],
    // Le feu au sol porte les kills du cocktail (321 kills en base contre 8 pour le projectile, le 2026-09-27).
    telemetryIds: ['ProjMolotov_C', 'BP_MolotovFireDebuff_C', 'ProjMolotov_DamageField_Direct_C', 'BP_FireEffectController_C'],
  },
  { key: 'smoke grenade', category: 'THROWABLE', aliases: ['smoke grenade'], telemetryIds: ['ProjSmokeBomb_C'], label: 'Smoke Grenade' },
  { key: 'stun grenade', category: 'THROWABLE', aliases: ['stun grenade'], telemetryIds: ['ProjFlashBang_C'], label: 'Stun Grenade' },
  { key: 'c4', category: 'THROWABLE', aliases: ['c4'], telemetryIds: ['ProjC4_C'] },
  { key: 'sticky grenade', category: 'THROWABLE', aliases: ['sticky grenade', 'sticky bomb'], telemetryIds: ['ProjStickyGrenade_C'] },

  { key: 'crossbow', category: 'SPECIAL', aliases: ['crossbow'], telemetryIds: ['WeapCrossbow_1_C', 'WeapCrossbow_C'] },
  {
    key: 'panzerfaust',
    category: 'SPECIAL',
    aliases: ['panzerfaust'],
    telemetryIds: ['WeapPanzerFaust100M1_C', 'PanzerFaust100M_Projectile_C', 'WeapPanzerFaust100M_C'],
  },
  { key: 'mortar', category: 'SPECIAL', aliases: ['mortar'], telemetryIds: ['Mortar_Projectile_C'], label: 'Mortar' },
  { key: 'bluezone grenade', category: 'SPECIAL', aliases: ['bluezone grenade'], telemetryIds: ['Bluezonebomb_EffectActor_C'] },
  { key: 'm79', category: 'SPECIAL', aliases: ['m79'], telemetryIds: ['WeapM79_C'], label: 'M79' },
  { key: 'stun gun', category: 'SPECIAL', aliases: ['stun gun'], telemetryIds: ['WeapStunGun_C'], label: 'Stun Gun' },
]

const ENTRY_BY_ALIAS = new Map<string, WeaponCategoryEntry>()
const ENTRY_BY_TELEMETRY_ID = new Map<string, WeaponCategoryEntry>()

for (const entry of WEAPON_CATEGORY_ENTRIES) {
  for (const alias of entry.aliases) {
    ENTRY_BY_ALIAS.set(normalizeWeaponAlias(alias), entry)
  }
  for (const telemetryId of entry.telemetryIds) {
    ENTRY_BY_TELEMETRY_ID.set(telemetryId, entry)
  }
}

export function normalizeWeaponAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, ' ')
}

export function isWeaponCategory(value: unknown): value is WeaponCategory {
  return typeof value === 'string' && (WEAPON_CATEGORY_ORDER as readonly string[]).includes(value)
}

/**
 * Arme du catalogue désignée par un identifiant télémétrie, sinon par un nom ou alias (« M416 », « Beryl M762 »).
 * L'identifiant passe d'abord : un libellé renommé par l'administration ne change pas la catégorie.
 */
export function findWeaponEntry(weaponNameOrKey: string, label?: string | null): WeaponCategoryEntry | null {
  return (
    ENTRY_BY_TELEMETRY_ID.get(weaponNameOrKey.trim()) ??
    ENTRY_BY_ALIAS.get(normalizeWeaponAlias(weaponNameOrKey)) ??
    (label ? ENTRY_BY_ALIAS.get(normalizeWeaponAlias(label)) : undefined) ??
    null
  )
}

/** Catégorie d'une arme, par identifiant télémétrie, clé ou alias ; `OTHER` si rien ne correspond. */
export function getWeaponCategory(weaponNameOrKey: string, label?: string | null): WeaponCategory {
  return findWeaponEntry(weaponNameOrKey, label)?.category ?? 'OTHER'
}

export function getWeaponCategoryAliases(): ReadonlyArray<WeaponCategoryEntry> {
  return WEAPON_CATEGORY_ENTRIES
}
