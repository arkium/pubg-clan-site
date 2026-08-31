import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import { getMemberPermissionKeys } from '@/lib/role-service'
import { getWeaponLabels, updateWeaponLabels } from '@/lib/weapon-label-service'

const UpdateWeaponLabelsSchema = z.object({
  labels: z.record(z.string(), z.string().max(50)),
})

function hasManageSettings(permissions: string[]) {
  return permissions.includes('*') || permissions.includes('manage_settings')
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  if (!hasManageSettings(permissions)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const labels = await getWeaponLabels()
  return Response.json({ labels })
}

export async function PUT(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  if (!hasManageSettings(permissions)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as unknown
  const validated = UpdateWeaponLabelsSchema.safeParse(body)

  if (!validated.success) {
    return Response.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const labels = await updateWeaponLabels(validated.data.labels)

  return Response.json({
    success: true,
    labels,
  })
}
