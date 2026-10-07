import { z } from 'zod'

import { withAdminActionLog } from '@/lib/admin-action-log'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { getPhaseLabels, updatePhaseLabels, PHASE_KEYS } from '@/lib/phase-label-service'

export async function GET(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  const labels = await getPhaseLabels()
  return Response.json({ labels })
}

const UpdatePhaseLabelsSchema = z.object({
  labels: z.record(z.string(), z.string().max(40)),
})

async function handlePut(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

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

export const PUT = withAdminActionLog('settings/phase-labels', handlePut)
