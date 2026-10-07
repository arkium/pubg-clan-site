import { z } from 'zod'

import { requireClanFeature } from '@/lib/auth/admin-guards'
import {
  getClanLabel,
  getLoginWelcomeSettings,
  normalizeLoginWelcomeSettings,
  updateLoginWelcomeSettings,
} from '@/lib/login-welcome-service'

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

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId: clanIdParam } = await params
  const clanId = parseClanId(clanIdParam)

  if (!clanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const [settings, clanLabel] = await Promise.all([
    getLoginWelcomeSettings(clanId),
    getClanLabel(clanId),
  ])

  return Response.json({ settings, clanLabel })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId: clanIdParam } = await params
  const clanId = parseClanId(clanIdParam)

  if (!clanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const permissionError = await requireClanFeature(request, clanId, 'clan-announcements')
  if (permissionError) return permissionError

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
