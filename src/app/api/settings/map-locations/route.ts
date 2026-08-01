import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import {
  getDefaultMapLocations,
  getMapLocations,
  updateMapLocations,
} from '@/lib/map-location-service'
import { getMemberPermissionKeys } from '@/lib/role-service'

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

function hasManageSettings(permissions: string[]) {
  return permissions.includes('*') || permissions.includes('manage_settings')
}

async function requireManageSettings(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  if (!hasManageSettings(permissions)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  return null
}

export async function GET(request: Request) {
  const authError = await requireManageSettings(request)
  if (authError) return authError

  return Response.json({
    locations: await getMapLocations(),
    defaultLocations: getDefaultMapLocations(),
  })
}

export async function PUT(request: Request) {
  const authError = await requireManageSettings(request)
  if (authError) return authError

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