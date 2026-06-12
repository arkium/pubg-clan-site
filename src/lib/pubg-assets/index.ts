import damageCauserNameData from './dictionaries/damageCauserName.json'
import damageTypeCategoryData from './dictionaries/damageTypeCategory.json'
import mapNameData from './dictionaries/mapName.json'
import gameModeData from './dictionaries/gameMode.json'
import damageReasonData from './enums/damageReason.json'
import itemCategoryData from './enums/item/category.json'
import itemSubCategoryData from './enums/item/subCategory.json'
import vehicleTypeData from './enums/vehicle/vehicleType.json'
import medalNameData from './dictionaries/weaponMastery/medalName.json'

// ── Types dérivés des enums ──────────────────────────────────────────────────

export type DamageReason = (typeof damageReasonData)[number]
export type ItemCategory = (typeof itemCategoryData)[number]
export type ItemSubCategory = (typeof itemSubCategoryData)[number]
export type VehicleType = (typeof vehicleTypeData)[number]
export type MedalId = keyof typeof medalNameData

// ── Dictionnaires bruts (accès direct si besoin) ─────────────────────────────

export const damageCauserName = damageCauserNameData as Record<string, string>
export const damageTypeCategory = damageTypeCategoryData as Record<string, string>
export const mapName = mapNameData as Record<string, string>
export const gameMode = gameModeData as Record<string, string>

// ── Resolvers ────────────────────────────────────────────────────────────────

/** Résout un ID télémétrie (arme, véhicule, entité) en nom lisible. */
export function resolveDamageCauser(id: string): string {
  return damageCauserName[id] ?? id
}

/** Alias sémantique — résout un ID arme (`Weap*_C`) en nom affiché. */
export function resolveWeaponName(id: string): string {
  return damageCauserName[id] ?? id
}

/** Alias sémantique — résout un ID véhicule en nom affiché. */
export function resolveVehicleName(id: string): string {
  return damageCauserName[id] ?? id
}

/** Résout un type de dégât (`Damage_Gun`, `Damage_BlueZone`…) en label lisible. */
export function resolveDamageType(id: string): string {
  return damageTypeCategory[id] ?? id
}

/** Résout un ID de map (`Baltic_Main`…) en nom officiel. */
export function resolveMapName(id: string): string {
  return mapName[id] ?? id
}

/** Résout un mode de jeu (`squad-fpp`, `duo`…) en label lisible. */
export function resolveGameMode(id: string): string {
  return gameMode[id] ?? id
}

// ── Asset URLs ───────────────────────────────────────────────────────────────

export {
  weaponIconUrl,
  vehicleIconUrl,
  mapImageUrl,
  weaponTelemetryToAssetName,
  vehicleTelemetryToAssetName,
} from './asset-url'
