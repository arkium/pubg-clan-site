import { Anchor, Ban, Car, CarFront, Fuel, KeyRound, MapPinOff, Motorbike, Plane, Ship, Shuffle, Warehouse, type LucideIcon } from 'lucide-react'

import type { ObservedFamily, ResourcePointKind, ResourceReportKind } from '@/lib/resources/resource-map'

/** Icônes de la Carte des ressources : familles observées, types de points saisis, motifs de signalement. */

export const FAMILY_ICONS: Record<ObservedFamily, LucideIcon> = {
  car: Car,
  moto: Motorbike,
  boat: Ship,
  glider: Plane,
  land: CarFront,
}

export const KIND_ICONS: Record<ResourcePointKind, LucideIcon> = {
  fuel: Fuel,
  garage: Warehouse,
  dock: Anchor,
  secret_room: KeyRound,
}

export const REPORT_ICONS: Record<ResourceReportKind, LucideIcon> = {
  missing: Ban,
  misplaced: MapPinOff,
  wrong_kind: Shuffle,
}
