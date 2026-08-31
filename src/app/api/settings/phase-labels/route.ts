import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import { getMemberPermissionKeys } from '@/lib/role-service'
import { getPhaseLabels, updatePhaseLabels, PHASE_KEYS } from '@/lib/phase-label-service'

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

  const labels = await getPhaseLabels()
  return Response.json({ labels })
}

const UpdatePhaseLabelsSchema = z.object({
  labels: z.record(z.string(), z.string().max(40)),
})

export async function PUT(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  if (!hasManageSettings(permissions)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = UpdatePhaseLabelsSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 })
  }

  const filteredInput = Object.fromEntries(
    Object.entries(parsed.data.labels).filter(([key]) =>
      (PHASE_KEYS as readonly string[]).includes(key)
    )
  )

  const labels = await updatePhaseLabels(filteredInput)
  return Response.json({ ok: true, labels })
}
