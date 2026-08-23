import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import {
  getClanLabel,
  getLoginWelcomeSettings,
  getPrimaryClanId,
  normalizeLoginWelcomeSettings,
  updateLoginWelcomeSettings,
} from '@/lib/login-welcome-service'
import { getMemberPermissionKeys } from '@/lib/role-service'

const UpdateWelcomeSchema = z.object({
  badge: z.string().trim().max(60),
  title: z.string().trim().max(100),
  message: z.string().trim().max(260),
  imageUrl: z
    .preprocess((value) => {
      if (value === null || value === undefined) {
        return ''
      }

      return value
    }, z.string().trim().max(500))
    .refine((value) => value.length === 0 || /^https?:\/\//i.test(value) || /^\//.test(value), {
      message: 'Image URL must start with /, http://, or https://',
    }),
})

function hasManageSettings(permissions: string[]) {
  return permissions.includes('*') || permissions.includes('manage_settings')
}

export async function GET() {
  const clanId = await getPrimaryClanId()

  if (!clanId) {
    return Response.json({ settings: null, clanLabel: null })
  }

  const [settings, clanLabel] = await Promise.all([
    getLoginWelcomeSettings(clanId),
    getClanLabel(clanId),
  ])

  return Response.json({ settings, clanLabel })
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

  const clanId = await getPrimaryClanId()
  if (!clanId) {
    return Response.json({ error: 'No active clan found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => null)) as unknown
  const validated = UpdateWelcomeSchema.safeParse(body)

  if (!validated.success) {
    return Response.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const nextSettings = normalizeLoginWelcomeSettings(validated.data)
  const saved = await updateLoginWelcomeSettings(clanId, nextSettings)

  return Response.json({ success: true, settings: saved })
}
