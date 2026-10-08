import {
  closedOwnerFeatureAccessMap,
  OWNER_FEATURE_ACCESS_CONFIG_KEY,
  parseOwnerFeatureAccess,
  type OwnerFeature,
  type OwnerFeatureAccess,
  type OwnerFeatureAccessMap,
} from '@/lib/auth/owner-feature-catalog'
import { prisma } from '@/lib/prisma'

/**
 * Réglage de délégation aux Owners en base (`AppConfig` `owner_feature_access`), avec un cache de 30 s. Le catalogue
 * (fonctionnalités, valeurs par défaut, entrées de menu) est dans `owner-feature-catalog.ts`, lisible côté client.
 */

export {
  isOwnerFeature,
  OWNER_FEATURE_ACCESS_CONFIG_KEY,
  OWNER_FEATURE_KEYS,
  OWNER_FEATURES,
  parseOwnerFeatureAccess,
  type OwnerFeature,
  type OwnerFeatureAccess,
  type OwnerFeatureAccessMap,
} from '@/lib/auth/owner-feature-catalog'

const CACHE_TTL_MS = 30_000
let cache: { value: OwnerFeatureAccessMap; expiresAt: number } | null = null

export function resetOwnerFeatureAccessCache() {
  cache = null
}

export async function getOwnerFeatureAccessMap(): Promise<OwnerFeatureAccessMap> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value

  try {
    const record = await prisma.appConfig.findUnique({
      where: { key: OWNER_FEATURE_ACCESS_CONFIG_KEY },
      select: { value: true },
    })
    const value = parseOwnerFeatureAccess(record?.value ?? null)
    cache = { value, expiresAt: now + CACHE_TTL_MS }
    return value
  } catch (error) {
    // Une base indisponible ne doit jamais ouvrir un outil : on ferme tout, sans mettre en cache.
    console.error('[owner-features] Lecture du réglage impossible, tout reste fermé aux Owners:', error)
    return closedOwnerFeatureAccessMap()
  }
}

export async function getOwnerFeatureAccess(feature: OwnerFeature): Promise<OwnerFeatureAccess> {
  const map = await getOwnerFeatureAccessMap()
  return map[feature]
}

export async function setOwnerFeatureAccess(feature: OwnerFeature, access: OwnerFeatureAccess) {
  const record = await prisma.appConfig.findUnique({
    where: { key: OWNER_FEATURE_ACCESS_CONFIG_KEY },
    select: { value: true },
  })
  const next = { ...parseOwnerFeatureAccess(record?.value ?? null), [feature]: access }
  const value = JSON.stringify(next)

  await prisma.appConfig.upsert({
    where: { key: OWNER_FEATURE_ACCESS_CONFIG_KEY },
    update: { value },
    create: { key: OWNER_FEATURE_ACCESS_CONFIG_KEY, value },
  })
  cache = { value: next, expiresAt: Date.now() + CACHE_TTL_MS }
  return next
}
