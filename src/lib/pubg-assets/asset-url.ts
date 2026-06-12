/**
 * Transforms a weapon telemetry ID to its asset filename.
 * "WeapAK47_C" → "Item_Weapon_AK47_C"
 */
export function weaponTelemetryToAssetName(telemetryId: string): string {
  return telemetryId.replace(/^Weap/, 'Item_Weapon_')
}

/**
 * Normalizes a vehicle telemetry ID to its canonical asset filename.
 * Multiple color/skin variants (e.g. _01_, _03_) all map to the _00_ icon.
 * "Dacia_A_03_v2_C" → "Dacia_A_00_v2_C"
 * "BP_ATV_C" → "BP_ATV_C" (unchanged — no variant number)
 */
export function vehicleTelemetryToAssetName(telemetryId: string): string {
  return telemetryId.replace(/_\d{2}_/, '_00_')
}

export function weaponIconUrl(telemetryId: string): string {
  return `/icons/pubg/weapons/${weaponTelemetryToAssetName(telemetryId)}.png`
}

export function vehicleIconUrl(telemetryId: string): string {
  return `/icons/pubg/vehicles/${vehicleTelemetryToAssetName(telemetryId)}.png`
}

export function mapImageUrl(
  mapKey: string,
  opts?: { res?: 'high' | 'low'; noText?: boolean }
): string {
  const resolution = opts?.res === 'high' ? 'High_Res' : 'Low_Res'
  const noText = opts?.noText ? '_No_Text' : ''
  return `/maps/pubg/${mapKey}${noText}_${resolution}.png`
}
