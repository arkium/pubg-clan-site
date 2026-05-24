import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import { getMapLabels, updateMapLabels } from '@/lib/map-label-service'
import { getMemberPermissionKeys } from '@/lib/role-service'

const UpdateMapLabelsSchema = z.object({
  labels: z.record(z.string(), z.string().max(40)),
})

function hasManageSettings(permissions: string[]) {
  return permissions.includes('*') || permissions.includes('manage_settings')
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  if (!hasManageSettings(permissions)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const labels = await getMapLabels()
  return NextResponse.json({ labels })
}

export async function PUT(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  if (!hasManageSettings(permissions)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as unknown
  const validated = UpdateMapLabelsSchema.safeParse(body)

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const labels = await updateMapLabels(validated.data.labels)

  return NextResponse.json({
    success: true,
    labels,
  })
}
