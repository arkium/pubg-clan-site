import { z } from 'zod'

import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { getMapLabels, updateMapLabels } from '@/lib/map-label-service'

const UpdateMapLabelsSchema = z.object({
  labels: z.record(z.string(), z.string().max(40)),
})

export async function GET(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  const labels = await getMapLabels()
  return Response.json({ labels })
}

export async function PUT(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  const body = (await request.json().catch(() => null)) as unknown
  const validated = UpdateMapLabelsSchema.safeParse(body)

  if (!validated.success) {
    return Response.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const labels = await updateMapLabels(validated.data.labels)

  return Response.json({
    success: true,
    labels,
  })
}
