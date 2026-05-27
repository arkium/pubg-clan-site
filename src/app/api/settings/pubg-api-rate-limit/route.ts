import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import {
  getPubgApiRateLimitBounds,
  getPubgApiRateLimitRpm,
  setPubgApiRateLimitRpm,
} from '@/lib/pubg-rate-limit-config-service'
import { getMemberPermissionKeys } from '@/lib/role-service'

const UpdatePubgRateLimitSchema = z.object({
  rpm: z.number().int().positive(),
})

function canReadSettings(permissions: string[]) {
  return permissions.includes('*')
}

function canWriteSettings(permissions: string[]) {
  return permissions.includes('*')
}

async function getAuthorizedPermissions(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as NextResponse }
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  return { permissions }
}

export async function GET(request: Request) {
  const auth = await getAuthorizedPermissions(request)
  if (auth.error) {
    return auth.error
  }

  if (!canReadSettings(auth.permissions)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rpm = await getPubgApiRateLimitRpm()
  const bounds = getPubgApiRateLimitBounds()

  return NextResponse.json({
    rpm,
    bounds,
  })
}

export async function POST(request: Request) {
  const auth = await getAuthorizedPermissions(request)
  if (auth.error) {
    return auth.error
  }

  if (!canWriteSettings(auth.permissions)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as unknown
  const validated = UpdatePubgRateLimitSchema.safeParse(body)

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const rpm = await setPubgApiRateLimitRpm(validated.data.rpm)
  const bounds = getPubgApiRateLimitBounds()

  return NextResponse.json({
    success: true,
    rpm,
    bounds,
  })
}
