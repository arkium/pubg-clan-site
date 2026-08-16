/**
 * Prefix-based detection of vehicle damage-causer telemetry IDs, shared between
 * server-side label resolution (vehicle-label-service.ts) and client components
 * that need to pick the right icon (weapon vs vehicle) for a MemberWeaponStats
 * row — kept in its own module, with no Prisma import, so it stays safe to
 * import from client ('use client') components.
 */
export const VEHICLE_KEY_PREFIXES = [
  'AirBoat', 'AquaRail',
  'BP_ATV', 'BP_BearV2', 'BP_BRDM', 'BP_Bicycle', 'BP_Blanc', 'BP_CoupeRB',
  'BP_DO_', 'BP_Dirtbike', 'BP_Food_Truck', 'BP_Helicopter',
  'BP_KillTruck', 'BP_LootTruck', 'BP_M_Rony', 'BP_Mirado',
  'BP_Motorbike', 'BP_Motorglider', 'BP_Niva', 'BP_PickupTruck',
  'BP_Pillar_Car', 'BP_PonyCoupe', 'BP_Porter', 'BP_Scooter',
  'BP_Snowbike', 'BP_Snowmobile', 'BP_TukTukTuk', 'BP_Van',
  'Boat_', 'Buggy_', 'Dacia_', 'EmergencyAircraft_', 'PG117_', 'Uaz_',
] as const

export function isVehicleKey(key: string): boolean {
  return VEHICLE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}
