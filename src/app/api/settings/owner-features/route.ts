import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { isOwnerFeature, OWNER_FEATURE_KEYS, OWNER_FEATURES } from '@/lib/auth/owner-feature-catalog'
import { getOwnerFeatureAccessMap, setOwnerFeatureAccess } from '@/lib/auth/owner-features'

/**
 * Délégation aux Owners (docs/TODO/administration.md §5.3) : quels outils de clan le SuperUser ouvre à tous les Owners.
 * Le réglage est lu par `requireClanFeature` (API et pages) et par les menus.
 */

async function describeFeatures() {
  const access = await getOwnerFeatureAccessMap()
  return OWNER_FEATURE_KEYS.map((key) => ({
    key,
    label: OWNER_FEATURES[key].label,
    description: OWNER_FEATURES[key].description,
    access: access[key],
    defaultAccess: OWNER_FEATURES[key].defaultAccess,
  }))
}

export async function GET(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  try {
    return Response.json({ features: await describeFeatures() })
  } catch (error) {
    console.error('[api/settings/owner-features] Read failed:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

async function handlePut(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  const body = (await request.json().catch(() => null)) as { feature?: unknown; access?: unknown } | null
  if (!isOwnerFeature(body?.feature) || (body.access !== 'owner' && body.access !== 'superuser')) {
    return Response.json({ error: 'feature must be a known feature and access owner or superuser' }, { status: 400 })
  }
  try {
    await setOwnerFeatureAccess(body.feature, body.access)
    return Response.json({ features: await describeFeatures() })
  } catch (error) {
    console.error('[api/settings/owner-features] Update failed:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export const PUT = withAdminActionLog('settings/owner-features', handlePut)
