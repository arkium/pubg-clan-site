import { rankBy, type Ranked } from '@/lib/leaderboard-sort'
import {
  WEAPON_CATEGORY_ORDER,
  findWeaponEntry,
  getWeaponCategoryAliases,
  isWeaponCategory,
  type WeaponCategory,
  type WeaponCategoryEntry,
} from '@/lib/weapons/weapon-categories'

/**
 * L'armurerie du clan (`/clans/[clanId]/stats/weapons`, docs/features/weapons.md §7) : tout ce que la page calcule à
 * partir des lignes de `/api/clans/[clanId]/telemetry/weapons`. Module pur, testé par `armory.test.ts` ; la page ne fait
 * que l'afficher.
 */

/** Une ligne de l'API : un joueur, une arme (identifiant télémétrie), une période. */
export type ArmoryRow = {
  memberId: number
  displayName: string
  weaponName: string
  weaponLabel?: string
  /** Clé du catalogue (`weapon-categories.ts`), `null` hors catalogue (véhicule, poings…). */
  weaponKey?: string | null
  weaponCategoryCode?: string
  kills: number
  headshots: number
  shotsFired: number
  hitsLanded: number
  avgDistance: number
  maxDistance?: number | null
  totalDamage?: number | null
  matchCount: number
}

/** Une arme de l'armurerie, toutes variantes et tous joueurs confondus. */
export type ArmoryWeapon = {
  id: string
  name: string
  /** Identifiant télémétrie qui porte l'icône. */
  iconId: string
  category: WeaponCategory
  kills: number
  shotsFired: number
  hitsLanded: number
  /** Précision en %, `null` sans tir compté (explosifs, mêlée). */
  accuracy: number | null
  /** Le joueur qui a fait le plus de kills avec cette arme. */
  master: { displayName: string; kills: number } | null
}

const number = new Intl.NumberFormat('fr-FR')
const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const formatCount = (value: number) => number.format(Math.round(value))
export const formatPercent = (value: number) => `${oneDecimal.format(value)} %`
export const formatMeters = (value: number) => `${oneDecimal.format(value)} m`

/** Catégorie d'une ligne : celle de l'API, sinon recalculée (réponse ancienne ou arme renommée). */
export function rowCategory(row: ArmoryRow): WeaponCategory {
  if (isWeaponCategory(row.weaponCategoryCode)) return row.weaponCategoryCode
  return findWeaponEntry(row.weaponName, row.weaponLabel)?.category ?? 'OTHER'
}

function rowWeaponId(row: ArmoryRow) {
  return row.weaponKey ?? findWeaponEntry(row.weaponName, row.weaponLabel)?.key ?? row.weaponName
}

export const headshotRate = (row: ArmoryRow) => (row.kills > 0 ? (row.headshots / row.kills) * 100 : 0)
export const accuracyOf = (row: Pick<ArmoryRow, 'shotsFired' | 'hitsLanded'>) =>
  row.shotsFired > 0 ? (row.hitsLanded / row.shotsFired) * 100 : null

/** Catégorie lue dans l'URL (`?cat=SR`) ; `null` = « Tout l'arsenal ». */
export function parseArmoryCategory(value: string | null | undefined): WeaponCategory | null {
  const upper = value?.trim().toUpperCase()
  return isWeaponCategory(upper) ? upper : null
}

export function categoryKills(rows: readonly ArmoryRow[]): Record<WeaponCategory, number> {
  const totals = Object.fromEntries(WEAPON_CATEGORY_ORDER.map((category) => [category, 0])) as Record<WeaponCategory, number>
  for (const row of rows) totals[rowCategory(row)] += row.kills
  return totals
}

/** Les dix catégories d'armes, toujours ; « Autre » seulement quand elle a des lignes (véhicules, poings…). */
export function armoryCategories(rows: readonly ArmoryRow[]): WeaponCategory[] {
  const hasOther = rows.some((row) => rowCategory(row) === 'OTHER')
  return WEAPON_CATEGORY_ORDER.filter((category) => category !== 'OTHER' || hasOther)
}

const NON_LETHAL_KEYS = new Set(['smoke grenade', 'stun grenade'])

/**
 * Toutes les armes du catalogue (même sans kill, pour les montrer en gris), plus celles vues hors catalogue. Fumigène
 * et flash ne tuent jamais : ils ne figurent au râtelier que s'ils apparaissent dans les lignes.
 *
 * Nom d'une arme : le libellé de la ligne de son identifiant principal (celui du tableau, que l'administration peut
 * renommer), sinon celui du catalogue, sinon `labelOf` (dictionnaire PUBG) appliqué à cet identifiant.
 */
export function aggregateWeapons(rows: readonly ArmoryRow[], labelOf: (telemetryId: string) => string): ArmoryWeapon[] {
  type Acc = ArmoryWeapon & { byMember: Map<number, { displayName: string; kills: number }> }
  const weapons = new Map<string, Acc>()
  const create = (id: string, name: string, iconId: string, category: WeaponCategory): Acc => ({
    id,
    name,
    iconId,
    category,
    kills: 0,
    shotsFired: 0,
    hitsLanded: 0,
    accuracy: null,
    master: null,
    byMember: new Map(),
  })
  const catalogName = (entry: WeaponCategoryEntry) => entry.label ?? labelOf(entry.telemetryIds[0])

  for (const entry of getWeaponCategoryAliases()) {
    if (NON_LETHAL_KEYS.has(entry.key)) continue
    weapons.set(entry.key, create(entry.key, catalogName(entry), entry.telemetryIds[0], entry.category))
  }

  for (const row of rows) {
    const id = rowWeaponId(row)
    let weapon = weapons.get(id)
    if (!weapon) {
      const entry = findWeaponEntry(row.weaponName, row.weaponLabel)
      weapon = entry
        ? create(entry.key, catalogName(entry), entry.telemetryIds[0], entry.category)
        : create(id, row.weaponLabel ?? row.weaponName, row.weaponName, rowCategory(row))
      weapons.set(id, weapon)
    }
    // Seul l'identifiant principal renomme l'arme : le feu au sol ne doit pas rebaptiser le Molotov.
    if (row.weaponLabel && row.weaponName === weapon.iconId) weapon.name = row.weaponLabel
    weapon.kills += row.kills
    weapon.shotsFired += row.shotsFired
    weapon.hitsLanded += row.hitsLanded
    const member = weapon.byMember.get(row.memberId) ?? { displayName: row.displayName, kills: 0 }
    member.kills += row.kills
    weapon.byMember.set(row.memberId, member)
  }

  return [...weapons.values()].map(({ byMember, ...weapon }) => {
    const top = [...byMember.values()].sort((a, b) => b.kills - a.kills)[0]
    return {
      ...weapon,
      accuracy: accuracyOf(weapon),
      master: top && top.kills > 0 ? top : null,
    }
  })
}

/** Ce que le loadout et les classements lisent d'une arme : l'armurerie du clan et la page d'un joueur le partagent. */
export type LoadoutWeapon = Pick<ArmoryWeapon, 'name' | 'category' | 'kills'>

const byKillsThenName = (a: LoadoutWeapon, b: LoadoutWeapon) => b.kills - a.kills || a.name.localeCompare(b.name, 'fr')

/** L'arme qui a fait le plus de kills, toutes catégories. */
export function signatureWeapon(weapons: readonly ArmoryWeapon[]): ArmoryWeapon | null {
  return [...weapons].filter((weapon) => weapon.kills > 0).sort(byKillsThenName)[0] ?? null
}

/** Le râtelier d'une catégorie : ses armes classées par kills, celles sans kill à la fin. */
export function weaponRack(weapons: readonly ArmoryWeapon[], category: WeaponCategory): ArmoryWeapon[] {
  return weapons.filter((weapon) => weapon.category === category).sort(byKillsThenName)
}

export type LoadoutSlot<T extends LoadoutWeapon = ArmoryWeapon> = { slot: 1 | 2 | 3 | 4 | 5; label: string; weapon: T | null }

const LONG_GUNS: readonly WeaponCategory[] = ['AR', 'DMR', 'SR', 'SMG', 'LMG', 'SG']

/**
 * Le sac du clan, comme en jeu (touches 1 à 5) : l'arme la plus meurtrière de chaque emplacement. L'arme secondaire
 * est prise dans une autre famille que la principale (pas deux fusils d'assaut).
 */
export function buildLoadout<T extends LoadoutWeapon>(weapons: readonly T[]): LoadoutSlot<T>[] {
  const best = (categories: readonly WeaponCategory[], excluded?: WeaponCategory) =>
    [...weapons]
      .filter((weapon) => weapon.kills > 0 && categories.includes(weapon.category) && weapon.category !== excluded)
      .sort(byKillsThenName)[0] ?? null
  const primary = best(LONG_GUNS)
  return [
    { slot: 1, label: 'Arme principale', weapon: primary },
    { slot: 2, label: 'Arme secondaire', weapon: best(LONG_GUNS, primary?.category) },
    { slot: 3, label: 'Pistolet', weapon: best(['PISTOL']) },
    { slot: 4, label: 'Mêlée', weapon: best(['MELEE']) },
    { slot: 5, label: 'Lancer', weapon: best(['THROWABLE']) },
  ]
}

/** Seuils des hauts faits : sous eux, un coup de chance ferait le record. */
export const FEAT_MIN_KILLS_FOR_HEADSHOTS = 5
export const FEAT_MIN_SHOTS_FOR_ACCURACY = 100

export type ArmoryFeat = {
  id: 'longest' | 'headshots' | 'surgeon' | 'trigger'
  label: string
  /** `null` : pas assez de données sur la sélection. */
  value: string | null
  who: string | null
}

function best<T>(items: readonly T[], value: (item: T) => number | null): T | null {
  let winner: T | null = null
  let winnerValue = -Infinity
  for (const item of items) {
    const current = value(item)
    if (current !== null && current > winnerValue) {
      winner = item
      winnerValue = current
    }
  }
  return winner
}

/** Hauts faits, recalculés sur la sélection (période, joueur, catégorie). */
export function computeFeats(rows: readonly ArmoryRow[]): ArmoryFeat[] {
  const who = (row: ArmoryRow | null) => (row ? `${row.displayName} · ${row.weaponLabel ?? row.weaponName}` : null)
  const longest = best(rows, (row) => (typeof row.maxDistance === 'number' && row.maxDistance > 0 ? row.maxDistance : null))
  const headshots = best(rows, (row) => (row.kills >= FEAT_MIN_KILLS_FOR_HEADSHOTS ? headshotRate(row) : null))
  const surgeon = best(rows, (row) => (row.shotsFired >= FEAT_MIN_SHOTS_FOR_ACCURACY ? accuracyOf(row) : null))
  const trigger = best(rows, (row) => (row.shotsFired > 0 ? row.shotsFired : null))
  return [
    { id: 'longest', label: 'Tir le plus lointain', value: longest ? `${formatCount(longest.maxDistance ?? 0)} m` : null, who: who(longest) },
    { id: 'headshots', label: 'Roi du headshot', value: headshots ? `${Math.round(headshotRate(headshots))} %` : null, who: who(headshots) },
    { id: 'surgeon', label: 'Chirurgien', value: surgeon ? `${Math.round(accuracyOf(surgeon) ?? 0)} % touchés` : null, who: who(surgeon) },
    { id: 'trigger', label: 'Gâchette facile', value: trigger ? `${formatCount(trigger.shotsFired)} balles` : null, who: who(trigger) },
  ]
}

export type ArmorySortKey =
  | 'player'
  | 'weapon'
  | 'kills'
  | 'totalDamage'
  | 'headshotRate'
  | 'accuracy'
  | 'avgDistance'
  | 'maxDistance'
  | 'matchCount'

type NumericSortKey = Exclude<ArmorySortKey, 'player' | 'weapon'>

export const ARMORY_SORT_COLUMNS: Record<NumericSortKey, { label: string; value: (row: ArmoryRow) => number }> = {
  kills: { label: 'Kills', value: (row) => row.kills },
  totalDamage: { label: 'Dégâts', value: (row) => row.totalDamage ?? -1 },
  headshotRate: { label: 'HS %', value: headshotRate },
  accuracy: { label: 'Précision', value: (row) => accuracyOf(row) ?? -1 },
  avgDistance: { label: 'Dist. moy.', value: (row) => row.avgDistance },
  maxDistance: { label: 'Dist. max', value: (row) => row.maxDistance ?? -1 },
  matchCount: { label: 'Matchs', value: (row) => row.matchCount },
}

export const ARMORY_SORT_LABELS: Record<ArmorySortKey, string> = {
  player: 'Joueur',
  weapon: 'Arme',
  ...Object.fromEntries(Object.entries(ARMORY_SORT_COLUMNS).map(([key, column]) => [key, column.label])),
} as Record<ArmorySortKey, string>

const weaponText = (row: ArmoryRow) => row.weaponLabel ?? row.weaponName

/**
 * Lignes dans l'ordre d'affichage avec leur rang. Colonne chiffrée : rang dans l'ordre décroissant du critère (`rankBy`,
 * médailles aux meilleurs même en tri croissant). Colonne texte : ordre alphabétique, rang au nombre de kills. Le
 * podium est donc toujours celui de la sélection affichée, jamais de toutes les lignes.
 */
export function rankArmoryRows(rows: readonly ArmoryRow[], key: ArmorySortKey, direction: 'asc' | 'desc'): Ranked<ArmoryRow>[] {
  if (key !== 'player' && key !== 'weapon') return rankBy(rows, ARMORY_SORT_COLUMNS[key].value, direction)

  const killRank = new Map(rankBy(rows, (row) => row.kills, 'desc').map(({ entry, rank }) => [entry, rank]))
  const text = key === 'player' ? (row: ArmoryRow) => row.displayName : weaponText
  const factor = direction === 'asc' ? 1 : -1
  return [...rows]
    .sort((a, b) => text(a).localeCompare(text(b), 'fr', { sensitivity: 'base' }) * factor || b.kills - a.kills)
    .map((entry) => ({ entry, rank: killRank.get(entry) ?? 0 }))
}

// Pagination commune aux listes du site (src/lib/pagination.ts), réexportée pour l'armurerie.
export { paginationItems } from '@/lib/pagination'
