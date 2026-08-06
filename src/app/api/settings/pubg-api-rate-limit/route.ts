import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import {
  getPubgApiRateLimitBounds,
  getPubgApiRateLimitRpm,
  setPubgApiRateLimitRpm,
} from '@/lib/pubg-rate-limit-config-service'

const UpdatePubgRateLimitSchema = z.object({
  rpm: z.number().int().positive(),
})

async function requireSuperUserSession(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as NextResponse }
  }

  if (!session.isSuperUser) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as NextResponse }
  }

  return { error: null }
}

export async function GET(request: Request) {
  const auth = await requireSuperUserSession(request)
  if (auth.error) {
    return auth.error
  }

  const rpm = await getPubgApiRateLimitRpm()
  const bounds = getPubgApiRateLimitBounds()

  return NextResponse.json({
    rpm,
    bounds,
  })
}

export async function POST(request: Request) {
  const auth = await requireSuperUserSession(request)
  if (auth.error) {
    return auth.error
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
