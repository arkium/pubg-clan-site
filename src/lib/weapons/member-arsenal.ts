import {
  FEAT_MIN_KILLS_FOR_HEADSHOTS,
  FEAT_MIN_SHOTS_FOR_ACCURACY,
  buildLoadout,
  type LoadoutSlot,
} from '@/lib/weapons/armory'
import {
  WEAPON_CATEGORY_ORDER,
  findWeaponEntry,
  type WeaponCategory,
  type WeaponCategoryEntry,
} from '@/lib/weapons/weapon-categories'

/**
 * L'arsenal d'un joueur (`/members/[id]/weapons`, docs/features/armes-joueur.md) : deux sources, deux onglets.
 * « Suivi par le site » lit la télémétrie (`/api/members/[id]/telemetry/weapons`, une ligne par identifiant de
 * damage-causer) et les lancers ; « Carrière PUBG » lit la maîtrise d'arme officielle (`weapon-mastery`). Module pur,
 * testé par `member-arsenal.test.ts`.
 */

// ── Onglet « Suivi par le site » ─────────────────────────────────────────────────────────────────

/** Une ligne de `/api/members/[id]/telemetry/weapons` (distances déjà en mètres). */
export type MemberWeaponRow = {
  weaponName: string
  weaponLabel?: string
  kills: number
  headshots: number
  shotsFired: number
  hitsLanded: number
  avgDistance: number
  maxDistance?: number | null
  matchCount: number
}

/** Une arme du joueur, toutes variantes confondues (skins, projectile, champ de feu). */
export type MemberWeapon = {
  id: string
  name: string
  /** Identifiant télémétrie qui porte l'icône. */
  iconId: string
  category: WeaponCategory
  kills: number
  /** Kills en headshot (télémétrie). */
  headshots: number
  shotsFired: number
  hitsLanded: number
  /** Touches ÷ tirs en %, `null` sans tir compté (explosifs, mêlée). */
  accuracy: number | null
  /** Kills en headshot ÷ kills en %, `null` sans kill. */
  headshotRate: number | null
  /** Distance moyenne des kills (m), pondérée par les kills de chaque variante ; `null` sans kill. */
  avgDistance: number | null
  maxDistance: number | null
  /** Parties avec l'arme : le maximum de ses variantes (une partie au Molotov compte le projectile et le feu). */
  matchCount: number
}

const byKillsThenName = (a: MemberWeapon, b: MemberWeapon) => b.kills - a.kills || a.name.localeCompare(b.name, 'fr')

/**
 * Regroupe les lignes par arme du catalogue (`weapon-categories.ts`). Les lignes hors arme — véhicules, poings, zone,
 * `None` (catégorie `OTHER`) — sont écartées : ce ne sont pas des armes du râtelier.
 */
export function aggregateMemberWeapons(rows: readonly MemberWeaponRow[]): MemberWeapon[] {
  type Acc = MemberWeapon & { distanceSum: number; entry: WeaponCategoryEntry | null; primaryLabel: string | null; firstLabel: string | null }
  const weapons = new Map<string, Acc>()
  for (const row of rows) {
    const entry = findWeaponEntry(row.weaponName, row.weaponLabel)
    const category = entry?.category ?? 'OTHER'
    if (category === 'OTHER') continue
    if (row.kills <= 0 && row.shotsFired <= 0 && row.hitsLanded <= 0) continue
    const id = entry?.key ?? row.weaponName
    let weapon = weapons.get(id)
    if (!weapon) {
      weapon = {
        id,
        name: row.weaponName,
        iconId: entry?.telemetryIds[0] ?? row.weaponName,
        category,
        kills: 0,
        headshots: 0,
        shotsFired: 0,
        hitsLanded: 0,
        accuracy: null,
        headshotRate: null,
        avgDistance: null,
        maxDistance: null,
        matchCount: 0,
        distanceSum: 0,
        entry,
        primaryLabel: null,
        firstLabel: null,
      }
      weapons.set(id, weapon)
    }
    if (row.weaponLabel) {
      if (row.weaponName === weapon.iconId) weapon.primaryLabel = row.weaponLabel
      weapon.firstLabel ??= row.weaponLabel
    }
    weapon.kills += row.kills
    weapon.headshots += row.headshots
    weapon.shotsFired += row.shotsFired
    weapon.hitsLanded += row.hitsLanded
    weapon.distanceSum += row.avgDistance * row.kills
    if (typeof row.maxDistance === 'number' && row.maxDistance > 0) weapon.maxDistance = Math.max(weapon.maxDistance ?? 0, row.maxDistance)
    weapon.matchCount = Math.max(weapon.matchCount, row.matchCount)
  }
  return [...weapons.values()]
    .map(({ distanceSum, entry, primaryLabel, firstLabel, ...weapon }) => ({
      ...weapon,
      // Nom : le libellé de l'identifiant principal (celui que l'administration renomme), sinon celui du catalogue,
      // sinon le premier libellé vu — le feu au sol ne rebaptise pas le Molotov.
      name: primaryLabel ?? entry?.label ?? firstLabel ?? weapon.name,
      accuracy: weapon.shotsFired > 0 ? (weapon.hitsLanded / weapon.shotsFired) * 100 : null,
      headshotRate: weapon.kills > 0 ? (weapon.headshots / weapon.kills) * 100 : null,
      avgDistance: weapon.kills > 0 ? distanceSum / weapon.kills : null,
    }))
    .sort(byKillsThenName)
}

/** Arme de prédilection : le plus de kills sur la période. */
export function favouriteWeapon(weapons: readonly MemberWeapon[]): MemberWeapon | null {
  return weapons.filter((weapon) => weapon.kills > 0).sort(byKillsThenName)[0] ?? null
}

/** Emplacements 1 à 4 du sac, par la règle de l'armurerie du clan (`buildLoadout`) ; le 5 montre les lancers. */
export function memberLoadout(weapons: readonly MemberWeapon[]): LoadoutSlot<MemberWeapon>[] {
  return buildLoadout(weapons).filter((slot) => slot.slot <= 4)
}

export type MemberRecord = {
  id: 'longest' | 'accuracy' | 'headshots'
  label: string
  /** `null` : aucune arme n'atteint le seuil sur la période. */
  value: number | null
  weapon: MemberWeapon | null
}

function best(weapons: readonly MemberWeapon[], value: (weapon: MemberWeapon) => number | null) {
  let winner: MemberWeapon | null = null
  let winnerValue = -Infinity
  for (const weapon of weapons) {
    const current = value(weapon)
    if (current !== null && current > winnerValue) {
      winner = weapon
      winnerValue = current
    }
  }
  return winner ? { weapon: winner, value: winnerValue } : { weapon: null, value: null }
}

/** Records de la période, aux seuils des hauts faits de l'armurerie (100 tirs, 5 kills) : sous eux, un coup de chance ferait le record. */
export function memberRecords(weapons: readonly MemberWeapon[]): MemberRecord[] {
  return [
    { id: 'longest', label: 'Kill le plus long', ...best(weapons, (weapon) => weapon.maxDistance) },
    { id: 'accuracy', label: 'Meilleure précision', ...best(weapons, (weapon) => (weapon.shotsFired >= FEAT_MIN_SHOTS_FOR_ACCURACY ? weapon.accuracy : null)) },
    { id: 'headshots', label: 'Headshot machine', ...best(weapons, (weapon) => (weapon.kills >= FEAT_MIN_KILLS_FOR_HEADSHOTS ? weapon.headshotRate : null)) },
  ]
}

export type SiteSortKey = 'kills' | 'accuracy' | 'headshots' | 'distance'

export const SITE_SORTS: ReadonlyArray<{ key: SiteSortKey; label: string; short: string; value: (weapon: MemberWeapon) => number }> = [
  { key: 'kills', label: 'Kills', short: 'Kills', value: (weapon) => weapon.kills },
  { key: 'accuracy', label: 'Précision', short: 'Précision', value: (weapon) => weapon.accuracy ?? -1 },
  { key: 'headshots', label: 'Headshots', short: 'HS', value: (weapon) => weapon.headshotRate ?? -1 },
  { key: 'distance', label: 'Distance', short: 'Distance', value: (weapon) => weapon.maxDistance ?? -1 },
]

// ── Onglet « Carrière PUBG » ─────────────────────────────────────────────────────────────────────

/** Une ligne de `GET /api/members/[id]/weapon-mastery`. */
export type MasteryEntry = {
  weaponId: string
  weaponName: string
  /** Libellé du site (réglage `/settings/weapon-labels`), ajouté par la route. */
  weaponLabel?: string
  kills: number
  /** Coups à la tête (API PUBG), pas des kills en headshot : peut dépasser `kills`. */
  headshots: number
  knockouts: number
  damage: number
  level: number
  xpTotal: number
  /** Niveau d'expert PUBG : +1 à chaque remise à zéro après le niveau 100 (pubg.com/fr/news/2847). */
  tier: number
  lastRefreshedAt: string
}

export type MasteryWeapon = {
  id: string
  name: string
  /** `Item_Weapon_…_C` : le nom de fichier de l'icône. */
  iconId: string
  category: WeaponCategory
  kills: number
  knocks: number
  headshots: number
  damage: number
  level: number
  expert: number
  xp: number
}

/** `Item_Weapon_HK416_C` → `WeapHK416_C`, l'identifiant télémétrie que connaissent le catalogue et les libellés. */
export function masteryTelemetryId(weaponId: string) {
  return `Weap${weaponId.replace(/^Item_Weapon_/, '').replace(/_C$/, '')}_C`
}

/** Explosifs jetés (`MemberThrowableStat.itemId`, maîtrise des grenades) : le dictionnaire PUBG ne les nomme qu'en anglais. */
export const THROWABLE_LABELS: Record<string, string> = {
  Item_Weapon_Grenade_C: 'Grenade',
  Item_Weapon_Molotov_C: 'Molotov',
  Item_Weapon_SmokeBomb_C: 'Fumigène',
  Item_Weapon_FlashBang_C: 'Flash',
  Item_Weapon_BluezoneGrenade_C: 'Grenade de zone',
  Item_Weapon_StickyGrenade_C: 'Bombe collante',
  Item_Weapon_C4_C: 'C4',
  Item_Weapon_M79_C: 'M79',
  Item_Weapon_DecoyGrenade_C: 'Leurre',
  Item_Weapon_Snowball_C: 'Boule de neige',
  Item_Weapon_Apple_C: 'Pomme',
  Item_Weapon_Rock_C: 'Pierre',
  Item_Weapon_CoverStructDropHandFlare_C: 'Fusée de couverture',
  Item_Weapon_PackageFlare_C: 'Fusée de largage',
  Item_Weapon_PackageFlare_nonDest_C: 'Fusée de largage',
  Item_Weapon_Juju_C: 'Orbe mystérieux',
}

/**
 * Objets lancés pour le jeu, pas pour le combat : pomme, pierre, boule de neige, orbe mystérieux de l'événement Jujutsu
 * Kaisen (`Juju`, septembre 2026 — lancé sur une boîte de l'île de départ, pubg.com/en/news/10991). Le loadout les écarte.
 */
export const NON_COMBAT_THROWS: ReadonlySet<string> = new Set([
  'Item_Weapon_Apple_C',
  'Item_Weapon_Rock_C',
  'Item_Weapon_Snowball_C',
  'Item_Weapon_Juju_C',
])

/** Emplacement 5 du loadout : les lancers de combat de la période, du plus lancé au moins lancé. */
export function loadoutThrows<T extends { itemId: string; count: number }>(items: readonly T[]): T[] {
  return items.filter((item) => item.count > 0 && !NON_COMBAT_THROWS.has(item.itemId)).sort((a, b) => b.count - a.count)
}

export function throwableLabel(itemId: string) {
  return THROWABLE_LABELS[itemId] ?? itemId.replace(/^Item_Weapon_/, '').replace(/_C$/, '').replace(/_/g, ' ')
}

export function masteryCategory(entry: Pick<MasteryEntry, 'weaponId' | 'weaponName'>): WeaponCategory {
  const catalog = findWeaponEntry(masteryTelemetryId(entry.weaponId)) ?? findWeaponEntry(entry.weaponId) ?? findWeaponEntry(entry.weaponName)
  if (catalog) return catalog.category
  return THROWABLE_LABELS[entry.weaponId] ? 'THROWABLE' : 'OTHER'
}

/** Armes de la maîtrise, sans celles qui n'ont jamais servi (niveau 0 et aucun kill). */
export function masteryWeapons(entries: readonly MasteryEntry[]): MasteryWeapon[] {
  return entries
    .filter((entry) => entry.level > 0 || entry.kills > 0)
    .map((entry) => ({
      id: entry.weaponId,
      name: THROWABLE_LABELS[entry.weaponId] ?? entry.weaponLabel ?? entry.weaponName,
      iconId: entry.weaponId,
      category: masteryCategory(entry),
      kills: entry.kills,
      knocks: entry.knockouts,
      headshots: entry.headshots,
      damage: entry.damage,
      level: entry.level,
      expert: entry.tier,
      xp: entry.xpTotal,
    }))
}

/** Rang de maîtrise : niveau d'expert, puis niveau, puis XP. */
export const byMastery = (a: MasteryWeapon, b: MasteryWeapon) =>
  b.expert - a.expert || b.level - a.level || b.xp - a.xp || b.kills - a.kills || a.name.localeCompare(b.name, 'fr')

export function mostMasteredWeapon(weapons: readonly MasteryWeapon[]): MasteryWeapon | null {
  return [...weapons].sort(byMastery)[0] ?? null
}

export function careerTotals(weapons: readonly MasteryWeapon[]) {
  return weapons.reduce(
    (totals, weapon) => ({
      kills: totals.kills + weapon.kills,
      knocks: totals.knocks + weapon.knocks,
      damage: totals.damage + weapon.damage,
      headshots: totals.headshots + weapon.headshots,
    }),
    { kills: 0, knocks: 0, damage: 0, headshots: 0 }
  )
}

/** Répartition des armes par niveau d'expert (0 = pas encore passé le niveau 100), du plus bas au plus haut. */
export function expertDistribution(weapons: readonly MasteryWeapon[]): Array<{ expert: number; count: number }> {
  const counts = new Map<number, number>()
  for (const weapon of weapons) counts.set(weapon.expert, (counts.get(weapon.expert) ?? 0) + 1)
  return [...counts.entries()].map(([expert, count]) => ({ expert, count })).sort((a, b) => a.expert - b.expert)
}

/** Couleur d'un niveau d'expert : l'échelle s'intensifie avec le niveau (aucun nom de palier officiel). */
export function expertColor(expert: number) {
  const scale = ['#64748b', '#38bdf8', '#34d399', '#fbbf24', '#fb923c', '#f43f5e', '#a78bfa']
  return scale[Math.min(Math.max(expert, 0), scale.length - 1)]
}

export type PubgSortKey = 'level' | 'kills' | 'damage' | 'knocks'

export const PUBG_SORTS: ReadonlyArray<{ key: PubgSortKey; label: string; compare: (a: MasteryWeapon, b: MasteryWeapon) => number }> = [
  { key: 'level', label: 'Niveau', compare: byMastery },
  { key: 'kills', label: 'Kills', compare: (a, b) => b.kills - a.kills || byMastery(a, b) },
  { key: 'damage', label: 'Dégâts', compare: (a, b) => b.damage - a.damage || byMastery(a, b) },
  { key: 'knocks', label: 'Knocks', compare: (a, b) => b.knocks - a.knocks || byMastery(a, b) },
]

/** Dernière synchronisation de la maîtrise (la plus récente des lignes). */
export function lastMasteryRefresh(entries: readonly Pick<MasteryEntry, 'lastRefreshedAt'>[]): string | null {
  let latest: string | null = null
  for (const entry of entries) if (!latest || entry.lastRefreshedAt > latest) latest = entry.lastRefreshedAt
  return latest
}

// ── Commun ───────────────────────────────────────────────────────────────────────────────────────

export type ArsenalSource = 'site' | 'pubg'

export function parseArsenalSource(value: string | null | undefined): ArsenalSource {
  return value === 'pubg' ? 'pubg' : 'site'
}

/** Catégories présentes dans la liste de l'onglet, dans l'ordre du site, avec leur nombre d'armes. */
export function categoryCounts(weapons: ReadonlyArray<{ category: WeaponCategory }>): Array<{ category: WeaponCategory; count: number }> {
  return WEAPON_CATEGORY_ORDER.map((category) => ({ category, count: weapons.filter((weapon) => weapon.category === category).length })).filter(
    (entry) => entry.count > 0
  )
}
