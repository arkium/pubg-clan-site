import { z } from 'zod'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import {
  getDefaultMapLocations,
  getMapLocations,
  updateMapLocations,
} from '@/lib/map-location-service'

const MapLocationSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(60),
  mapName: z.string().min(1).max(80),
  xPct: z.number().min(0).max(100),
  yPct: z.number().min(0).max(100),
  radiusPct: z.number().min(0.25).max(25),
  enabled: z.boolean(),
})

const UpdateMapLocationsSchema = z.object({
  locations: z.record(z.string(), z.array(MapLocationSchema).max(100)),
})

export async function GET(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  return Response.json({
    locations: await getMapLocations(),
    defaultLocations: getDefaultMapLocations(),
  })
}

async function handlePut(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  const body = (await request.json().catch(() => null)) as unknown
  const validated = UpdateMapLocationsSchema.safeParse(body)
  if (!validated.success) {
    return Response.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const locations = await updateMapLocations(validated.data.locations)
  return Response.json({ success: true, locations })
}

export const PUT = withAdminActionLog('settings/map-locations', handlePut)
