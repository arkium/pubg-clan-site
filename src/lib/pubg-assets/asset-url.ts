/**
 * A handful of weapon/causer telemetry IDs don't reduce to their asset filename
 * through the "Weap"/"Proj" prefix rule below — either the official asset repo
 * renamed the file (Mosin-Nagant, Win94), or the causer ID has no "Weap"/"Proj"
 * prefix at all (Mortar, Bluezone Grenade — these come from mode-controller
 * actors, not from a weapon/projectile spawn).
 */
const WEAPON_ASSET_NAME_OVERRIDES: Record<string, string> = {
  WeapMosinNagant_C: 'Item_Weapon_Mosin_C',
  WeapWin94_C: 'Item_Weapon_Win1894_C',
  Mortar_Projectile_C: 'Item_Weapon_Mortar_C',
  Bluezonebomb_EffectActor_C: 'Item_Weapon_BluezoneGrenade_C',
  WeapCrossbow_1_C: 'Item_Weapon_Crossbow_C',
  WeapPanzerFaust100M1_C: 'Item_Weapon_PanzerFaust100M_C',
  // Thrown variant of a melee weapon — same visual object, no dedicated "thrown" asset.
  WeapCowbarProjectile_C: 'Item_Weapon_Cowbar_C',
  WeapMacheteProjectile_C: 'Item_Weapon_Machete_C',
  WeapPanProjectile_C: 'Item_Weapon_Pan_C',
  WeapSickleProjectile_C: 'Item_Weapon_Sickle_C',
  // Named/lore weapon variants (survivor-pass skins) — functionally identical base weapon.
  WeapDuncansHK416_C: 'Item_Weapon_HK416_C',
  WeapJuliesKar98k_C: 'Item_Weapon_Kar98k_C',
  WeapLunchmeatsAK47_C: 'Item_Weapon_AK47_C',
  WeapMadsQBU88_C: 'Item_Weapon_QBU88_C',
  // Fire/burn damage-field causers — not a pickable item, no dedicated asset exists.
  // Fall back to the Molotov icon since that's overwhelmingly the real source of a burn kill.
  BP_FireEffectController_C: 'Item_Weapon_Molotov_C',
  BP_FireEffectController_JerryCan_C: 'Item_Weapon_Molotov_C',
  BP_MolotovFireDebuff_C: 'Item_Weapon_Molotov_C',
  BP_JerryCanFireDebuff_C: 'Item_Weapon_Molotov_C',
  BP_JerryCan_FuelPuddle_C: 'Item_Weapon_Molotov_C',
  BP_IncendiaryDebuff_C: 'Item_Weapon_Molotov_C',
  ProjIncendiary_C: 'Item_Weapon_Molotov_C',
  ProjMolotov_DamageField_Direct_C: 'Item_Weapon_Molotov_C',
  // Distinct telemetry ID from WeapPanzerFaust100M1_C for the actual projectile-in-flight.
  PanzerFaust100M_Projectile_C: 'Item_Weapon_PanzerFaust100M_C',
}

/**
 * Transforms a weapon telemetry ID to its asset filename.
 * "WeapAK47_C" → "Item_Weapon_AK47_C"
 * Thrown items use a "Proj" prefix instead of "Weap": "ProjMolotov_C" → "Item_Weapon_Molotov_C"
 */
export function weaponTelemetryToAssetName(telemetryId: string): string {
  return WEAPON_ASSET_NAME_OVERRIDES[telemetryId] ?? telemetryId.replace(/^(Weap|Proj)/, 'Item_Weapon_')
}

/**
 * "Esports" broadcast-livery variants don't reduce to the canonical _00_ asset
 * through the digit-normalization rule below — the "Esports"/"esports" token
 * sits in a different position per vehicle family (sometimes replacing the
 * digit slot entirely, sometimes appended after it), so each is listed explicitly.
 */
const VEHICLE_ASSET_NAME_OVERRIDES: Record<string, string> = {
  BP_Mirado_A_03_Esports_C: 'BP_Mirado_A_00_C',
  BP_Niva_Esports_C: 'BP_Niva_00_C',
  BP_PickupTruck_A_esports_C: 'BP_PickupTruck_A_00_C',
  Dacia_A_03_v2_Esports_C: 'Dacia_A_00_v2_C',
  Uaz_B_01_esports_C: 'Uaz_B_00_C',
}

/**
 * Normalizes a vehicle telemetry ID to its canonical asset filename.
 * Multiple color/skin variants (e.g. _01_, _03_) all map to the _00_ icon.
 * "Dacia_A_03_v2_C" → "Dacia_A_00_v2_C"
 * "BP_ATV_C" → "BP_ATV_C" (unchanged — no variant number)
 */
export function vehicleTelemetryToAssetName(telemetryId: string): string {
  return VEHICLE_ASSET_NAME_OVERRIDES[telemetryId] ?? telemetryId.replace(/_\d{2}_/, '_00_')
}

export function weaponIconUrl(telemetryId: string): string {
  return `/icons/pubg/weapons/${weaponTelemetryToAssetName(telemetryId)}.png`
}

export function vehicleIconUrl(telemetryId: string): string {
  return `/icons/pubg/vehicles/${vehicleTelemetryToAssetName(telemetryId)}.png`
}

/**
 * A handful of Use-category itemIds don't match their asset filename byte-for-byte.
 * Telemetry uses "Item_Mountainbike_C" (lowercase "b"), the asset repo ships
 * "Item_MountainBike_C.png" — harmless on case-insensitive filesystems (Windows/macOS)
 * but breaks on case-sensitive ones (Linux prod).
 */
const ITEM_ASSET_NAME_OVERRIDES: Record<string, string> = {
  Item_Mountainbike_C: 'Item_MountainBike_C',
}

/**
 * Use-category consumable items (Item_Heal_*, Item_Boost_*, Item_JerryCan_C, Item_MountainBike_C).
 * Telemetry itemId otherwise matches the asset filename 1:1 — no prefix rewrite needed.
 */
export function itemIconUrl(telemetryId: string): string {
  const assetName = ITEM_ASSET_NAME_OVERRIDES[telemetryId] ?? telemetryId
  return `/icons/pubg/items/${assetName}.png`
}

export function mapImageUrl(
  mapKey: string,
  opts?: { res?: 'high' | 'low'; noText?: boolean }
): string {
  const resolution = opts?.res === 'high' ? 'High_Res' : 'Low_Res'
  const noText = opts?.noText ? '_No_Text' : ''
  return `/maps/pubg/${mapKey}${noText}_${resolution}.png`
}
