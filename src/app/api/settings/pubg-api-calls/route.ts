import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth-session'
import { getPubgApiCallsOverview } from '@/lib/pubg-api-call-log-service'
import { getPubgApiRateLimitBounds, getPubgApiRateLimitRpm } from '@/lib/pubg-rate-limit-config-service'
import { getMemberPermissionKeys } from '@/lib/role-service'

function canReadSettings(permissions: string[]) {
  return (
    permissions.includes('*') ||
    permissions.includes('manage_settings') ||
    permissions.includes('manage_members')
  )
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  if (!canReadSettings(permissions)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const windowMinutesRaw = Number(url.searchParams.get('windowMinutes'))
  const historyLimitRaw = Number(url.searchParams.get('historyLimit'))

  const overview = await getPubgApiCallsOverview({
    windowMinutes: Number.isFinite(windowMinutesRaw) ? windowMinutesRaw : undefined,
    historyLimit: Number.isFinite(historyLimitRaw) ? historyLimitRaw : undefined,
  })

  const [rpm, bounds] = await Promise.all([
    getPubgApiRateLimitRpm(),
    Promise.resolve(getPubgApiRateLimitBounds()),
  ])

  return NextResponse.json({
    rpm,
    bounds,
    ...overview,
  })
}
