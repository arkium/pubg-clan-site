import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth-session'
import { getPubgApiCallsOverview, purgePubgApiCallLogHistory } from '@/lib/pubg-api-call-log-service'
import { getPubgApiRateLimitBounds, getPubgApiRateLimitRpm } from '@/lib/pubg-rate-limit-config-service'

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!session.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const historyPageRaw = Number(url.searchParams.get('page'))
  const historyPageSizeRaw = Number(url.searchParams.get('pageSize'))
  const errorsOnlyRaw = (url.searchParams.get('errorsOnly') ?? '').toLowerCase()
  const historyQueryRaw = url.searchParams.get('q')
  const historyClanIdRaw = Number(url.searchParams.get('clanId'))

  const overview = await getPubgApiCallsOverview({
    historyPage: Number.isFinite(historyPageRaw) ? historyPageRaw : undefined,
    historyPageSize: Number.isFinite(historyPageSizeRaw) ? historyPageSizeRaw : undefined,
    errorsOnly: errorsOnlyRaw === '1' || errorsOnlyRaw === 'true',
    historyQuery: historyQueryRaw ?? undefined,
    historyClanId: Number.isFinite(historyClanIdRaw) && historyClanIdRaw > 0 ? historyClanIdRaw : undefined,
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

export async function DELETE(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!session.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const deletedCount = await purgePubgApiCallLogHistory()
  return NextResponse.json({ deletedCount })
}
